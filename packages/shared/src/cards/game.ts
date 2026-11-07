/**
 * Une partie de « Bac Bataille » autour d'une table, avec des pièces d'or.
 * Logique pure (temps et hasard injectés) : le téléphone de l'hôte la fait
 * tourner en ligne, la page en mode solo. Les joueurs n'envoient qu'une
 * intention : « je réponds X » ; tout le reste est décidé ici.
 *
 * Déroulement d'une manche :
 * 1. chacun pose la mise au milieu (1 pièce, puis 2, 3… : elle monte toutes les
 *    quelques manches ; un joueur qui n'a plus assez pose ce qui lui reste) ;
 * 2. les catégories défilent devant chacun et s'arrêtent sur la même ; une lettre
 *    est tirée (chaque lettre sort une fois avant qu'une lettre ne revienne) ;
 * 3. le premier qui donne un mot valide (lettre + catégorie) rafle tout le tas ;
 *    si personne ne trouve, le tas reste au milieu (cagnotte) ;
 * 4. qui n'a plus de pièce au moment de miser est éliminé ; le dernier qui a
 *    encore des pièces gagne la partie.
 */
import { CARD_GAME } from '../config/cards.js';
import { checkAnswer, wordsStartingWith } from './answers.js';
import { CATEGORY_IDS, type CategoryId } from './categories.js';

export type GamePhase = 'waiting' | 'ante' | 'spin' | 'duel' | 'result' | 'finished';

export interface TablePlayer {
  id: string;
  name: string;
  bot: boolean;
  /** Vrai joueur parti en cours de partie : un bot le remplace. */
  left: boolean;
  coins: number;
  /** Éliminé (plus de pièce pour miser) à cette manche, sinon null. */
  outRound: number | null;
  /** Place au classement final, sinon null. */
  rank: number | null;
  /** Mauvaise réponse : pas de nouvel essai avant (ms). */
  lockedUntil: number;
  /** Bot : instant (ms) où il répond. */
  botAnswerAt: number | null;
}

/** Fin d'une manche : qui a raflé le tas (null : personne n'a trouvé, cagnotte). */
export interface RoundResult {
  winnerId: string | null;
  word: string | null;
  /** Pièces raflées (ou laissées en cagnotte). */
  pot: number;
}

export type GameEvent =
  /** Début de manche : chacun pose sa mise (`paid` : pièces posées par joueur). */
  | { kind: 'ante'; round: number; ante: number; pot: number; paid: Record<string, number> }
  /** Les catégories défilent et s'arrêtent sur `category` ; lettre tirée. */
  | { kind: 'spin'; category: CategoryId; letter: string }
  /** À vous de répondre ! */
  | { kind: 'duel' }
  | { kind: 'won'; winnerId: string; word: string; pot: number }
  | { kind: 'timeout'; pot: number }
  | { kind: 'eliminated'; ids: string[] }
  | { kind: 'finished'; ranking: RankingLine[] }
  | { kind: 'waiting' };

export interface RankingLine {
  id: string;
  name: string;
  rank: number;
  coins: number;
}

/** Ce que tout le monde voit de la table. */
export interface PlayerView {
  id: string;
  name: string;
  bot: boolean;
  left: boolean;
  coins: number;
  out: boolean;
  rank: number | null;
}

export interface GameView {
  phase: GamePhase;
  /** Temps restant dans la phase (0 : pas de limite). */
  endsInMs: number;
  round: number;
  /** Mise de la manche en cours. */
  ante: number;
  pot: number;
  letter: string;
  category: CategoryId | null;
  players: PlayerView[];
  result: RoundResult | null;
  ranking: RankingLine[];
}

/**
 * Partie complète, sérialisable (JSON), pour qu'un autre joueur reprenne la
 * table si l'hôte s'en va. Les instants sont stockés en temps restant (ms) :
 * les horloges des téléphones ne sont pas synchronisées.
 */
export interface GameSnapshot {
  phase: GamePhase;
  endsInMs: number;
  round: number;
  ante: number;
  pot: number;
  letter: string;
  category: CategoryId | null;
  letterBag: string[];
  categoryBag: CategoryId[];
  result: RoundResult | null;
  ranking: RankingLine[];
  players: (Omit<TablePlayer, 'lockedUntil' | 'botAnswerAt'> & { lockedInMs: number; botAnswerInMs: number | null })[];
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
  ante = 0;
  /** Pièces au milieu de la table. */
  pot = 0;
  letter = '';
  category: CategoryId | null = null;
  result: RoundResult | null = null;
  ranking: RankingLine[] = [];
  readonly players: TablePlayer[] = [];
  /** Lettres et catégories pas encore sorties : chacune sort une fois avant de revenir. */
  private letterBag: string[] = [];
  private categoryBag: CategoryId[] = [];
  /** Catégorie de la manche d'avant (pas deux fois de suite, même en remplissant le sac). */
  private lastCategory: CategoryId | null = null;

  constructor(private readonly rand: () => number = Math.random) {}

  // ---------- Sauvegarde (reprise par un autre joueur) ----------

  snapshot(now: number): GameSnapshot {
    const left = (t: number) => Math.max(0, t - now);
    return structuredClone({
      phase: this.phase,
      endsInMs: this.endsAt > 0 ? left(this.endsAt) : 0,
      round: this.round,
      ante: this.ante,
      pot: this.pot,
      letter: this.letter,
      category: this.category,
      letterBag: this.letterBag,
      categoryBag: this.categoryBag,
      result: this.result,
      ranking: this.ranking,
      players: this.players.map(({ lockedUntil, botAnswerAt, ...p }) => ({
        ...p,
        lockedInMs: left(lockedUntil),
        botAnswerInMs: botAnswerAt === null ? null : left(botAnswerAt),
      })),
    });
  }

  /** Reprend une partie sauvegardée par un autre téléphone. */
  static restore(snap: GameSnapshot, now: number, rand: () => number = Math.random): CardGame {
    const game = new CardGame(rand);
    const s = structuredClone(snap);
    game.phase = s.phase;
    game.endsAt = s.phase === 'waiting' && s.endsInMs === 0 ? 0 : now + s.endsInMs;
    game.round = s.round;
    game.ante = s.ante;
    game.pot = s.pot;
    game.letter = s.letter;
    game.category = s.category;
    game.letterBag = s.letterBag ?? [];
    game.categoryBag = s.categoryBag ?? [];
    game.result = s.result;
    game.ranking = s.ranking;
    for (const { lockedInMs, botAnswerInMs, ...p } of s.players) {
      game.players.push({ ...p, lockedUntil: now + lockedInMs, botAnswerAt: botAnswerInMs === null ? null : now + botAnswerInMs });
    }
    return game;
  }

  // ---------- Table ----------

  /** Un joueur s'assoit (avant le début seulement). */
  addPlayer(id: string, name: string, bot: boolean): string | null {
    if (this.phase !== 'waiting') return 'La partie a déjà commencé.';
    if (this.players.length >= CARD_GAME.players.max) return 'La table est complète.';
    if (this.players.some((p) => p.id === id)) return null;
    this.players.push({ id, name, bot, left: false, coins: 0, outRound: null, rank: null, lockedUntil: 0, botAnswerAt: null });
    return null;
  }

  /** Un joueur parti revient (réseau rétabli) : il reprend sa place à la place du bot. */
  rejoin(id: string): boolean {
    const p = this.players.find((x) => x.id === id);
    if (!p?.left) return false;
    Object.assign(p, { bot: false, left: false, botAnswerAt: null });
    return true;
  }

  /**
   * Un vrai joueur s'en va : avant la partie il quitte la table, pendant elle un
   * bot joue à sa place (et répond dès cette manche, `now` donné).
   */
  removePlayer(id: string, now?: number): void {
    const k = this.players.findIndex((p) => p.id === id);
    if (k < 0) return;
    if (this.phase === 'waiting' || this.phase === 'finished') this.players.splice(k, 1);
    else {
      const p = this.players[k]!;
      Object.assign(p, { bot: true, left: true });
      if (now !== undefined && this.phase === 'duel' && p.outRound === null) this.planBot(p, now);
    }
  }

  humans(): TablePlayer[] {
    return this.players.filter((p) => !p.bot);
  }

  /** Joueurs encore en lice (pas éliminés). */
  inGame(): TablePlayer[] {
    return this.players.filter((p) => p.outRound === null);
  }

  /** En ligne : la partie démarre toute seule après un court délai dès qu'on est assez. */
  scheduleStart(now: number): void {
    if (this.phase !== 'waiting') return;
    const enough = this.players.length >= CARD_GAME.players.min;
    if (!enough) this.endsAt = 0;
    else if (this.endsAt === 0) this.endsAt = now + CARD_GAME.timing.lobbyMs;
    if (this.players.length >= CARD_GAME.players.max) this.endsAt = Math.min(this.endsAt, now);
  }

  /** Donne les pièces de départ et lance la première manche. */
  start(now: number): GameEvent[] {
    if (this.players.length < CARD_GAME.players.min) return [];
    for (const p of this.players) Object.assign(p, { coins: CARD_GAME.coins.start, outRound: null, rank: null, lockedUntil: 0, botAnswerAt: null });
    Object.assign(this, { round: 0, ante: 0, pot: 0, letter: '', category: null, result: null, ranking: [], letterBag: [], categoryBag: [] });
    return this.nextRound(now);
  }

  /** Mise d'une manche : elle monte de 1 toutes les quelques manches. */
  static anteFor(round: number): number {
    const { ante, anteStepRounds } = CARD_GAME.coins;
    return ante + Math.floor((Math.max(1, round) - 1) / anteStepRounds);
  }

  // ---------- Intention du joueur ----------

  /**
   * « Je réponds `text` » pendant la manche. `category` est facultative (il n'y
   * en a qu'une par manche) ; si elle est donnée, ce doit être la bonne.
   */
  answer(playerId: string, category: CategoryId | null, text: string, now: number): AnswerResult {
    const none = (error: string | null): AnswerResult => ({ error, events: [] });
    if (this.phase !== 'duel' || !this.category) return none('Attends que les catégories s’arrêtent.');
    const p = this.players.find((x) => x.id === playerId);
    if (!p || p.outRound !== null) return none('Tu es éliminé : regarde la fin de la partie !');
    if (category !== null && category !== this.category) return none('Réponds dans la catégorie de la manche.');
    if (now < p.lockedUntil) return none('Attends une seconde avant de réessayer.');
    if (text.length > CARD_GAME.answer.maxLength) return none('Réponse trop longue.');
    const check = checkAnswer(this.category, this.letter, text);
    if (!check.ok) {
      p.lockedUntil = now + CARD_GAME.answer.wrongLockMs;
      return none(check.reason);
    }
    const pot = this.pot;
    p.coins += pot;
    this.pot = 0;
    this.result = { winnerId: p.id, word: check.word, pot };
    for (const x of this.players) x.botAnswerAt = null;
    return { error: null, events: [{ kind: 'won', winnerId: p.id, word: check.word, pot }, ...this.toResult(now)] };
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
      ante: this.ante,
      pot: this.pot,
      letter: this.letter,
      category: this.category,
      players: this.players.map((p) => ({ id: p.id, name: p.name, bot: p.bot, left: p.left, coins: p.coins, out: p.outRound !== null, rank: p.rank })),
      result: this.result,
      ranking: this.ranking,
    };
  }

  private advance(now: number): GameEvent[] {
    switch (this.phase) {
      case 'waiting':
        return this.start(now);
      case 'ante':
        return this.spin(now);
      case 'spin':
        return this.openDuel(now);
      case 'duel': {
        // Personne n'a trouvé : le tas reste au milieu pour la manche suivante.
        this.result = { winnerId: null, word: null, pot: this.pot };
        for (const p of this.players) p.botAnswerAt = null;
        return [{ kind: 'timeout', pot: this.pot }, ...this.toResult(now)];
      }
      case 'result':
        return this.nextRound(now);
      case 'finished':
        return this.backToWaiting();
    }
  }

  /** Nouvelle manche : élimination de ceux qui n'ont plus rien, puis chacun pose sa mise. */
  private nextRound(now: number): GameEvent[] {
    if (this.round >= CARD_GAME.maxRounds) return this.finish(now);
    const events: GameEvent[] = [];
    const playing = this.inGame();
    const broke = playing.filter((p) => p.coins <= 0);
    // Tout le monde à sec (tout est dans la cagnotte) : manche gratuite, personne n'est éliminé.
    if (broke.length > 0 && broke.length < playing.length) {
      for (const p of broke) p.outRound = this.round;
      events.push({ kind: 'eliminated', ids: broke.map((p) => p.id) });
    }
    const left = this.inGame();
    if (left.length <= 1) {
      // Le dernier en lice remporte aussi ce qui reste au milieu.
      if (left[0]) left[0].coins += this.pot;
      this.pot = 0;
      return [...events, ...this.finish(now)];
    }
    this.round += 1;
    this.ante = CardGame.anteFor(this.round);
    const paid: Record<string, number> = {};
    for (const p of left) {
      const coins = Math.min(p.coins, this.ante);
      p.coins -= coins;
      this.pot += coins;
      paid[p.id] = coins;
    }
    Object.assign(this, { result: null, category: null, phase: 'ante', endsAt: now + CARD_GAME.timing.anteMs });
    events.push({ kind: 'ante', round: this.round, ante: this.ante, pot: this.pot, paid });
    return events;
  }

  /** Les catégories défilent : on tire la lettre, puis une catégorie qui a des mots pour cette lettre. */
  private spin(now: number): GameEvent[] {
    this.letter = this.draw(this.letterBag, [...CARD_GAME.letters], this.letter || null);
    const playable = (c: CategoryId) => wordsStartingWith(c, this.letter).length >= CARD_GAME.minWordsPerRound;
    this.category = this.draw(this.categoryBag, CATEGORY_IDS, this.lastCategory, playable);
    this.lastCategory = this.category;
    this.phase = 'spin';
    this.endsAt = now + CARD_GAME.timing.spinMs;
    return [{ kind: 'spin', category: this.category, letter: this.letter }];
  }

  private openDuel(now: number): GameEvent[] {
    this.phase = 'duel';
    this.endsAt = now + CARD_GAME.timing.duelMs;
    for (const p of this.inGame()) {
      p.lockedUntil = 0;
      p.botAnswerAt = null;
      if (p.bot) this.planBot(p, now);
    }
    return [{ kind: 'duel' }];
  }

  private planBot(p: TablePlayer, now: number): void {
    const [min, max] = CARD_GAME.bots.answerDelayMs;
    p.botAnswerAt = now + min + this.rand() * (max - min);
  }

  /**
   * Tire dans un sac (modifié sur place) : chaque élément sort une fois avant
   * qu'un élément ne revienne. Sac vide, ou rien qui convienne : on le remplit à
   * nouveau, sans répéter la dernière sortie.
   */
  private draw<T extends string>(bag: T[], all: readonly T[], previous: T | null, ok: (v: T) => boolean = () => true): T {
    let pool = bag.filter(ok);
    if (pool.length === 0) {
      bag.splice(0, bag.length, ...all.filter((v) => v !== previous));
      pool = bag.filter(ok);
      if (pool.length === 0) pool = [...bag];
    }
    const pick = pool[Math.floor(this.rand() * pool.length)]!;
    bag.splice(bag.indexOf(pick), 1);
    return pick;
  }

  private botsAnswer(now: number): GameEvent[] {
    for (const p of this.players) {
      if (p.botAnswerAt === null || now < p.botAnswerAt || this.phase !== 'duel' || !this.category) continue;
      p.botAnswerAt = null;
      if (p.outRound !== null || this.rand() >= CARD_GAME.bots.successRate) continue;
      const options = wordsStartingWith(this.category, this.letter);
      const pick = options[Math.floor(this.rand() * options.length)];
      if (pick) return this.answer(p.id, null, pick, now).events;
    }
    return [];
  }

  private toResult(now: number): GameEvent[] {
    this.phase = 'result';
    this.endsAt = now + CARD_GAME.timing.resultMs;
    return [];
  }

  /** Classement : les joueurs en lice par pièces, puis les éliminés (éliminé tard = mieux classé). */
  private finish(now: number): GameEvent[] {
    const score = (p: TablePlayer) => (p.outRound === null ? 1_000_000 + p.coins : p.outRound);
    for (const p of this.players) p.rank = 1 + this.players.filter((o) => score(o) > score(p)).length;
    this.ranking = [...this.players]
      .sort((a, b) => a.rank! - b.rank!)
      .map((p) => ({ id: p.id, name: p.name, rank: p.rank!, coins: p.coins }));
    this.phase = 'finished';
    this.endsAt = now + CARD_GAME.timing.finishedMs;
    return [{ kind: 'finished', ranking: this.ranking }];
  }

  /** Retour au salon : les joueurs partis et les bots quittent la table. */
  private backToWaiting(): GameEvent[] {
    for (let k = this.players.length - 1; k >= 0; k--) if (this.players[k]!.bot) this.players.splice(k, 1);
    for (const p of this.players) Object.assign(p, { coins: 0, outRound: null, rank: null });
    Object.assign(this, { phase: 'waiting', endsAt: 0, round: 0, ante: 0, pot: 0, letter: '', category: null, result: null, ranking: [] });
    return [{ kind: 'waiting' }];
  }
}
