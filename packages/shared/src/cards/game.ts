/**
 * Une partie de « Bac Bataille » autour d'une table. Logique pure (temps et
 * hasard injectés) : le serveur la fait tourner dans sa room, le mode solo dans
 * la page. Les joueurs n'envoient qu'une intention : « je réponds X dans la
 * catégorie Y » ; tout le reste (cartes, lettre, duels) est décidé ici.
 *
 * Déroulement d'une manche :
 * 1. une lettre est tirée au hasard ; elle reste la même tant qu'il n'y a pas de
 *    duel, et une nouvelle est tirée après chaque manche avec duel ;
 * 2. chacun retourne la carte du dessus de son paquet sur sa pile (on ne choisit pas) ;
 * 3. les joueurs dont les cartes du dessus ont une catégorie en commun s'affrontent
 *    en duel (la couleur ne compte pas) : le premier qui donne un mot valide (lettre +
 *    catégorie commune) gagne ; le perdant récupère les deux piles sous son paquet ;
 * 4. le premier qui n'a plus aucune carte (paquet et pile vides) gagne la partie.
 */
import { CARD_COLORS, CARD_GAME, type CardColor } from '../config/cards.js';
import { checkAnswer, wordsStartingWith } from './answers.js';
import { CATEGORY_IDS, type CategoryId } from './categories.js';

export interface Card {
  id: number;
  color: CardColor;
  categories: [CategoryId, CategoryId];
}

export type GamePhase = 'waiting' | 'letter' | 'reveal' | 'duel' | 'result' | 'finished';

export interface TablePlayer {
  id: string;
  name: string;
  bot: boolean;
  /** Vrai joueur parti en cours de partie : un bot le remplace. */
  left: boolean;
  /** Paquet face cachée (on retourne la première carte). */
  deck: Card[];
  /** Cartes posées devant soi, face visible (la dernière est sur le dessus). */
  pile: Card[];
  /** Place au classement final, sinon null. */
  rank: number | null;
  /** Mauvaise réponse : pas de nouvel essai avant (ms). */
  lockedUntil: number;
  /** Bot en duel : instant (ms) où il répond. */
  botAnswerAt: number | null;
}

export interface Duel {
  id: number;
  /** Catégories communes à toutes les cartes du duel : on répond dans l'une d'elles. */
  categories: CategoryId[];
  playerIds: string[];
  winnerId: string | null;
  word: string | null;
  category: CategoryId | null;
  /** Cartes récupérées par chaque perdant. */
  losers: { id: string; cards: number }[];
}

export type GameEvent =
  /** `changed` : nouvelle lettre tirée (sinon on garde celle d'avant, faute de duel). */
  | { kind: 'letter'; letter: string; round: number; changed: boolean }
  | { kind: 'reveal' }
  | { kind: 'duels'; duels: Duel[] }
  | { kind: 'noDuel' }
  | { kind: 'duelWon'; duel: Duel }
  | { kind: 'duelTimeout'; duel: Duel }
  | { kind: 'finished'; ranking: RankingLine[] }
  | { kind: 'waiting' };

export interface RankingLine {
  id: string;
  name: string;
  rank: number;
  cards: number;
}

/** Ce que tout le monde voit de la table (les paquets restent secrets). */
export interface PlayerView {
  id: string;
  name: string;
  bot: boolean;
  left: boolean;
  deckCount: number;
  pileCount: number;
  top: Card | null;
  rank: number | null;
}

export interface GameView {
  phase: GamePhase;
  /** Temps restant dans la phase (0 : pas de limite). */
  endsInMs: number;
  round: number;
  letter: string;
  players: PlayerView[];
  duels: Duel[];
  ranking: RankingLine[];
}

export interface AnswerResult {
  /** null si accepté ; sinon le message à montrer au joueur. */
  error: string | null;
  events: GameEvent[];
}

export class CardGame {
  phase: GamePhase = 'waiting';
  /** Fin de la phase en cours (ms), 0 : pas de limite. */
  endsAt = 0;
  round = 0;
  letter = '';
  duels: Duel[] = [];
  ranking: RankingLine[] = [];
  readonly players: TablePlayer[] = [];
  private nextCardId = 1;
  private nextDuelId = 1;

  constructor(private readonly rand: () => number = Math.random) {}

  // ---------- Table ----------

  /** Un joueur s'assoit (avant le début seulement). */
  addPlayer(id: string, name: string, bot: boolean): string | null {
    if (this.phase !== 'waiting') return 'La partie a déjà commencé.';
    if (this.players.length >= CARD_GAME.players.max) return 'La table est complète.';
    if (this.players.some((p) => p.id === id)) return null;
    this.players.push({ id, name, bot, left: false, deck: [], pile: [], rank: null, lockedUntil: 0, botAnswerAt: null });
    return null;
  }

  /** Un vrai joueur s'en va : avant la partie il quitte la table, pendant elle un bot joue à sa place. */
  removePlayer(id: string): void {
    const k = this.players.findIndex((p) => p.id === id);
    if (k < 0) return;
    if (this.phase === 'waiting' || this.phase === 'finished') this.players.splice(k, 1);
    else Object.assign(this.players[k]!, { bot: true, left: true });
  }

  humans(): TablePlayer[] {
    return this.players.filter((p) => !p.bot);
  }

  /** En ligne : la partie démarre toute seule après un court délai dès qu'on est assez. */
  scheduleStart(now: number): void {
    if (this.phase !== 'waiting') return;
    const enough = this.players.length >= CARD_GAME.players.min;
    if (!enough) this.endsAt = 0;
    else if (this.endsAt === 0) this.endsAt = now + CARD_GAME.timing.lobbyMs;
    if (this.players.length >= CARD_GAME.players.max) this.endsAt = Math.min(this.endsAt, now);
  }

  /** Distribue les cartes et lance la première manche. */
  start(now: number): GameEvent[] {
    if (this.players.length < CARD_GAME.players.min) return [];
    const deck = this.newDeck(this.players.length * CARD_GAME.cardsPerPlayer, this.categoriesInPlay(this.players.length));
    this.players.forEach((p, k) => {
      Object.assign(p, { pile: [], rank: null, lockedUntil: 0, botAnswerAt: null });
      p.deck = deck.slice(k * CARD_GAME.cardsPerPlayer, (k + 1) * CARD_GAME.cardsPerPlayer);
    });
    this.round = 0;
    this.ranking = [];
    this.duels = [];
    this.letter = '';
    return this.nextRound(now);
  }

  // ---------- Intention du joueur ----------

  /**
   * « Je réponds `text` » pendant un duel. Sans catégorie (`null`), le mot est
   * accepté dans n'importe quelle catégorie commune du duel : pas besoin de choisir.
   */
  answer(playerId: string, category: CategoryId | null, text: string, now: number): AnswerResult {
    const none = (error: string | null): AnswerResult => ({ error, events: [] });
    if (this.phase !== 'duel') return none('Pas de duel en cours.');
    const p = this.players.find((x) => x.id === playerId);
    const duel = this.duels.find((d) => d.winnerId === null && d.playerIds.includes(playerId));
    if (!p || !duel) return none('Tu n’es pas dans un duel.');
    const top = p.pile.at(-1);
    if (!top || (category !== null && !duel.categories.includes(category))) return none('Réponds dans la catégorie commune du duel.');
    if (now < p.lockedUntil) return none('Attends une seconde avant de réessayer.');
    if (text.length > CARD_GAME.answer.maxLength) return none('Réponse trop longue.');
    const tried = (category === null ? duel.categories : [category]).map((c) => ({ c, check: checkAnswer(c, this.letter, text) }));
    const found = tried.find((t) => t.check.ok);
    if (!found || !found.check.ok) {
      p.lockedUntil = now + CARD_GAME.answer.wrongLockMs;
      // Le motif le plus utile : « mauvaise lettre » avant « pas dans la liste ».
      const reasons = tried.map((t) => (t.check.ok ? '' : t.check.reason));
      return none(reasons.find((r) => r.startsWith('Ça ne commence')) ?? reasons[0] ?? 'Réponse refusée.');
    }
    const events: GameEvent[] = [{ kind: 'duelWon', duel: this.resolveDuel(duel, p, found.check.word, found.c) }];
    if (this.duels.every((d) => d.winnerId !== null)) events.push(...this.toResult(now, CARD_GAME.timing.resultMs));
    return { error: null, events };
  }

  // ---------- Simulation ----------

  tick(now: number): GameEvent[] {
    const events: GameEvent[] = [];
    if (this.phase === 'duel') events.push(...this.botsAnswer(now));
    if (this.endsAt > 0 && now >= this.endsAt) events.push(...this.advance(now));
    return events;
  }

  view(now: number): GameView {
    return {
      phase: this.phase,
      endsInMs: this.endsAt > 0 ? Math.max(0, this.endsAt - now) : 0,
      round: this.round,
      letter: this.letter,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        bot: p.bot,
        left: p.left,
        deckCount: p.deck.length,
        pileCount: p.pile.length,
        top: p.pile.at(-1) ?? null,
        rank: p.rank,
      })),
      duels: this.duels,
      ranking: this.ranking,
    };
  }

  private advance(now: number): GameEvent[] {
    switch (this.phase) {
      case 'waiting':
        return this.start(now);
      case 'letter':
        return this.reveal(now);
      case 'reveal':
        return this.findDuels(now);
      case 'duel': {
        const events: GameEvent[] = this.duels.filter((d) => d.winnerId === null).map((duel) => ({ kind: 'duelTimeout', duel }) as const);
        return [...events, ...this.toResult(now, CARD_GAME.timing.resultMs)];
      }
      case 'result':
        return this.afterResult(now);
      case 'finished':
        return this.backToWaiting();
    }
  }

  private nextRound(now: number): GameEvent[] {
    if (this.round >= CARD_GAME.maxRounds) return this.finish(now);
    this.round += 1;
    // Nouvelle lettre au début de la partie et après chaque duel ; sinon on garde la même.
    const changed = this.letter === '' || this.duels.length > 0;
    if (changed) {
      const pool = [...CARD_GAME.letters].filter((l) => l !== this.letter);
      this.letter = pool[Math.floor(this.rand() * pool.length)]!;
    }
    this.duels = [];
    this.phase = 'letter';
    this.endsAt = now + (changed ? CARD_GAME.timing.letterMs : CARD_GAME.timing.sameLetterMs);
    return [{ kind: 'letter', letter: this.letter, round: this.round, changed }];
  }

  /** Tout le monde retourne la carte du dessus de son paquet, en même temps. */
  private reveal(now: number): GameEvent[] {
    let flipped = 0;
    for (const p of this.players) {
      const card = p.rank === null ? p.deck.shift() : undefined;
      if (card) {
        p.pile.push(card);
        flipped += 1;
      }
    }
    // Plus personne ne peut poser et aucun duel possible : la partie est bloquée.
    if (flipped === 0 && this.duelGroups().length === 0) return this.finish(now);
    this.phase = 'reveal';
    this.endsAt = now + CARD_GAME.timing.revealMs;
    return [{ kind: 'reveal' }];
  }

  /**
   * Cartes du dessus avec une catégorie en commun = duel entre leurs joueurs.
   * Chacun ne fait qu'un duel par manche : on forme d'abord le plus grand groupe
   * autour d'une même catégorie, puis le suivant parmi les joueurs restants.
   */
  private duelGroups(): { categories: CategoryId[]; ids: string[] }[] {
    const tops = new Map(this.players.filter((p) => p.rank === null && p.pile.length > 0).map((p) => [p.id, p.pile.at(-1)!]));
    const free = new Set(tops.keys());
    const groups: { categories: CategoryId[]; ids: string[] }[] = [];
    for (;;) {
      let ids: string[] = [];
      for (const c of CATEGORY_IDS) {
        const withC = [...free].filter((id) => tops.get(id)!.categories.includes(c));
        if (withC.length > ids.length) ids = withC;
      }
      if (ids.length < 2) return groups;
      const categories = CATEGORY_IDS.filter((c) => ids.every((id) => tops.get(id)!.categories.includes(c)));
      groups.push({ categories, ids });
      for (const id of ids) free.delete(id);
    }
  }

  private findDuels(now: number): GameEvent[] {
    this.duels = this.duelGroups().map(({ categories, ids }) => ({
      id: this.nextDuelId++,
      categories,
      playerIds: ids,
      winnerId: null,
      word: null,
      category: null,
      losers: [],
    }));
    if (this.duels.length === 0) return [{ kind: 'noDuel' }, ...this.toResult(now, CARD_GAME.timing.noDuelMs)];
    const [min, max] = CARD_GAME.bots.answerDelayMs;
    for (const d of this.duels) {
      for (const id of d.playerIds) {
        const p = this.players.find((x) => x.id === id)!;
        p.lockedUntil = 0;
        p.botAnswerAt = p.bot ? now + CARD_GAME.timing.duelIntroMs + min + this.rand() * (max - min) : null;
      }
    }
    this.phase = 'duel';
    this.endsAt = now + CARD_GAME.timing.duelIntroMs + CARD_GAME.timing.duelMs;
    return [{ kind: 'duels', duels: this.duels }];
  }

  /** Le gagnant se débarrasse de sa pile : les perdants récupèrent les deux piles sous leur paquet. */
  private resolveDuel(duel: Duel, winner: TablePlayer, word: string, category: CategoryId): Duel {
    const losers = duel.playerIds.filter((id) => id !== winner.id).map((id) => this.players.find((p) => p.id === id)!);
    const given = winner.pile;
    winner.pile = [];
    const counts = new Map(losers.map((l) => [l.id, l.pile.length]));
    for (const l of losers) {
      l.deck.push(...l.pile);
      l.pile = [];
    }
    // À plusieurs perdants, la pile du gagnant est partagée entre eux.
    given.forEach((card, k) => {
      const l = losers[k % losers.length]!;
      l.deck.push(card);
      counts.set(l.id, (counts.get(l.id) ?? 0) + 1);
    });
    Object.assign(duel, { winnerId: winner.id, word, category, losers: losers.map((l) => ({ id: l.id, cards: counts.get(l.id) ?? 0 })) });
    for (const p of [winner, ...losers]) p.botAnswerAt = null;
    return duel;
  }

  private botsAnswer(now: number): GameEvent[] {
    const events: GameEvent[] = [];
    for (const p of this.players) {
      if (p.botAnswerAt === null || now < p.botAnswerAt || this.phase !== 'duel') continue;
      p.botAnswerAt = null;
      if (this.rand() >= CARD_GAME.bots.successRate) continue;
      const duel = this.duels.find((d) => d.winnerId === null && d.playerIds.includes(p.id));
      if (!duel) continue;
      const options = duel.categories.flatMap((c) => wordsStartingWith(c, this.letter).map((w) => ({ c, w })));
      const pick = options[Math.floor(this.rand() * options.length)];
      if (pick) events.push(...this.answer(p.id, pick.c, pick.w, now).events);
    }
    return events;
  }

  private toResult(now: number, ms: number): GameEvent[] {
    this.phase = 'result';
    this.endsAt = now + ms;
    return [];
  }

  private afterResult(now: number): GameEvent[] {
    if (this.players.some((p) => p.deck.length === 0 && p.pile.length === 0)) return this.finish(now);
    return this.nextRound(now);
  }

  /** Classement : moins on a de cartes, mieux on est classé (0 carte = vainqueur). */
  private finish(now: number): GameEvent[] {
    const total = (p: TablePlayer) => p.deck.length + p.pile.length;
    for (const p of this.players) p.rank = 1 + this.players.filter((o) => total(o) < total(p)).length;
    this.ranking = [...this.players]
      .sort((a, b) => a.rank! - b.rank!)
      .map((p) => ({ id: p.id, name: p.name, rank: p.rank!, cards: total(p) }));
    this.phase = 'finished';
    this.endsAt = now + CARD_GAME.timing.finishedMs;
    this.duels = [];
    return [{ kind: 'finished', ranking: this.ranking }];
  }

  /** Retour au salon : les joueurs partis et les bots quittent la table. */
  private backToWaiting(): GameEvent[] {
    for (let k = this.players.length - 1; k >= 0; k--) if (this.players[k]!.bot) this.players.splice(k, 1);
    for (const p of this.players) Object.assign(p, { deck: [], pile: [], rank: null });
    this.phase = 'waiting';
    this.endsAt = 0;
    this.letter = '';
    this.round = 0;
    this.ranking = [];
    return [{ kind: 'waiting' }];
  }

  /** Catégories tirées au hasard pour cette partie (moins à peu de joueurs). */
  private categoriesInPlay(players: number): CategoryId[] {
    const pool = [...CATEGORY_IDS];
    this.shuffle(pool);
    return pool.slice(0, CARD_GAME.categoriesByPlayers[players] ?? pool.length);
  }

  private shuffle<T>(items: T[]): void {
    for (let k = items.length - 1; k > 0; k--) {
      const j = Math.floor(this.rand() * (k + 1));
      [items[k], items[j]] = [items[j]!, items[k]!];
    }
  }

  /** Paquet mélangé : couleurs équilibrées (décoratives), deux catégories différentes par carte. */
  private newDeck(size: number, categories: readonly CategoryId[]): Card[] {
    const cards: Card[] = [];
    for (let k = 0; k < size; k++) {
      const a = categories[Math.floor(this.rand() * categories.length)]!;
      const others = categories.filter((c) => c !== a);
      const b = others[Math.floor(this.rand() * others.length)]!;
      cards.push({ id: this.nextCardId++, color: CARD_COLORS[k % CARD_COLORS.length]!, categories: [a, b] });
    }
    this.shuffle(cards);
    return cards;
  }
}
