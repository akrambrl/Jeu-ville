import { describe, expect, it } from 'vitest';
import { CARD_GAME } from '../config/cards.js';
import { checkAnswer, normalizeWord, wordsStartingWith } from './answers.js';
import { CATEGORY_IDS } from './categories.js';
import { CardGame, type GameEvent, type TablePlayer } from './game.js';
import { WORDS } from './words.js';

const { letterMs, revealMs, duelMs } = CARD_GAME.timing;

function seeded(seed = 42): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Avance la partie par pas de 100 ms jusqu'à `until`. */
function run(game: CardGame, from: number, until: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let t = from + 100; t <= until; t += 100) events.push(...game.tick(t));
  return events;
}

/** Deux joueurs humains, partie lancée, cartes retournées. */
function twoPlayersAtReveal() {
  const game = new CardGame(seeded());
  game.addPlayer('a', 'Alice', false);
  game.addPlayer('b', 'Bilel', false);
  game.start(0);
  return { game, a: game.players[0]!, b: game.players[1]!, t: letterMs };
}

/** Donne aux cartes du dessus de deux joueurs une seule catégorie commune, puis passe au duel. */
function forceDuel(game: CardGame, a: TablePlayer, b: TablePlayer, t: number) {
  run(game, 0, t);
  const [shared, other] = a.pile.at(-1)!.categories;
  b.pile.at(-1)!.categories = [shared, CATEGORY_IDS.find((c) => c !== shared && c !== other)!];
  run(game, t, t + revealMs);
  return t + revealMs;
}

describe('réponses', () => {
  it('ignore accents, majuscules, articles et pluriel', () => {
    expect(normalizeWord('  Pêche ')).toBe('peche');
    expect(checkAnswer('fruitVeg', 'B', 'la Banane')).toEqual({ ok: true, word: 'banane' });
    expect(checkAnswer('fruitVeg', 'B', 'BANANES')).toEqual({ ok: true, word: 'banane' });
    expect(checkAnswer('place', 'C', 'cote d ivoire')).toEqual({ ok: true, word: "Côte d'Ivoire" });
  });
  it('connaît les villes moyennes de France et du monde', () => {
    for (const [letter, city] of [['C', 'Castres'], ['M', 'Montauban'], ['S', 'Sevran'], ['F', 'Fort-de-France'], ['B', 'Bamako'], ['O', 'Oujda']]) {
      expect(checkAnswer('place', letter!, city!).ok, city).toBe(true);
    }
  });

  it('célébrité : personnes et personnages célèbres', () => {
    for (const [letter, name] of [['G', 'Garfield'], ['P', 'Pikachu'], ['S', 'Squeezie'], ['Z', 'Zlatan'], ['A', 'Astérix']]) {
      expect(checkAnswer('celebrity', letter!, name!).ok, name).toBe(true);
    }
  });

  it('prénoms : variantes d’orthographe acceptées', () => {
    for (const [letter, name] of [['H', 'Henry'], ['H', 'Henri'], ['M', 'Mohammed'], ['Y', 'Yannis'], ['K', 'Killian'], ['J', 'Jennifer'], ['M', 'Mehmet'], ['Y', 'Yuki'], ['K', 'Kwame'], ['A', 'Alejandro'], ['I', 'Ibrahim'], ['A', 'Asli'], ['B', 'Baris']]) {
      expect(checkAnswer('firstName', letter!, name!).ok, name).toBe(true);
    }
  });

  it('métiers : bricoleur, et les formes au féminin', () => {
    for (const [letter, job] of [['B', 'bricoleur'], ['B', 'boulangère'], ['C', 'coiffeuse'], ['A', 'actrice'], ['I', 'infirmière'], ['A', 'avocate'], ['P', 'pharmacienne'], ['A', 'agente de sécurité'], ['C', 'caissières']]) {
      expect(checkAnswer('job', letter!, job!).ok, job).toBe(true);
    }
  });

  it('refuse un mot qui ne commence pas par la lettre', () => {
    expect(checkAnswer('fruitVeg', 'P', 'banane')).toEqual({ ok: false, reason: 'Ça ne commence pas par P !' });
  });
  it('refuse un mot absent de la liste', () => {
    expect(checkAnswer('animal', 'B', 'bidule')).toMatchObject({ ok: false, reason: expect.stringMatching(/pas dans la liste/) });
  });
  it('célébrité : le nom seul et la lettre du nom suffisent', () => {
    expect(checkAnswer('celebrity', 'M', 'Mbappé').ok).toBe(true);
    expect(checkAnswer('celebrity', 'M', 'Kylian Mbappé').ok).toBe(true);
  });
  it('chaque catégorie a des mots pour la plupart des lettres du tirage', () => {
    for (const c of CATEGORY_IDS) {
      expect(WORDS[c].length, c).toBeGreaterThan(50);
      const covered = [...CARD_GAME.letters].filter((l) => wordsStartingWith(c, l).length > 0).length;
      expect(covered, c).toBeGreaterThanOrEqual(CARD_GAME.letters.length - 6);
    }
  });
});

describe('partie', () => {
  it('distribue le même nombre de cartes à chacun et tire une lettre', () => {
    const { game } = twoPlayersAtReveal();
    expect(game.players.map((p) => p.deck.length)).toEqual([CARD_GAME.cardsPerPlayer, CARD_GAME.cardsPerPlayer]);
    expect(game.phase).toBe('letter');
    expect(CARD_GAME.letters).toContain(game.letter);
  });

  it('moins de catégories en jeu quand il y a peu de joueurs (duels plus fréquents)', () => {
    const { game } = twoPlayersAtReveal();
    const used = new Set(game.players.flatMap((p) => p.deck.flatMap((c) => c.categories)));
    expect(used.size).toBe(CARD_GAME.categoriesByPlayers[2]);
  });

  it('duel seulement sur une catégorie en commun, quelle que soit la couleur', () => {
    const { game, a, b, t } = twoPlayersAtReveal();
    run(game, 0, t);
    a.pile.at(-1)!.categories = ['animal', 'sport'];
    b.pile.at(-1)!.categories = ['job', 'brand'];
    b.pile.at(-1)!.color = a.pile.at(-1)!.color;
    expect(run(game, t, t + CARD_GAME.timing.revealMs)).toContainEqual({ kind: 'noDuel' });
  });

  it('en duel, il faut répondre dans la catégorie commune', () => {
    const { game, a, b, t } = twoPlayersAtReveal();
    run(game, 0, t);
    a.pile.at(-1)!.categories = ['animal', 'sport'];
    b.pile.at(-1)!.categories = ['animal', 'brand'];
    run(game, t, t + CARD_GAME.timing.revealMs);
    expect(game.duels[0]?.categories).toEqual(['animal']);
    expect(game.answer('a', 'sport', 'basket', t + 2000).error).toMatch(/catégorie commune/);
  });

  it('la lettre reste la même tant qu’il n’y a pas de duel, et change après un duel', () => {
    const { game, a, b, t } = twoPlayersAtReveal();
    const first = game.letter;
    run(game, 0, t);
    // Aucune catégorie en commun : pas de duel.
    a.pile.at(-1)!.categories = ['animal', 'sport'];
    b.pile.at(-1)!.categories = ['job', 'brand'];
    const events = run(game, t, t + revealMs + CARD_GAME.timing.noDuelMs);
    expect(events).toContainEqual({ kind: 'letter', letter: first, round: 2, changed: false });
    // Manche 2 : duel forcé, puis délai écoulé → nouvelle lettre à la manche 3.
    const t2 = t + revealMs + CARD_GAME.timing.noDuelMs + CARD_GAME.timing.sameLetterMs;
    run(game, t + revealMs + CARD_GAME.timing.noDuelMs, t2);
    a.pile.at(-1)!.categories = ['animal', 'sport'];
    b.pile.at(-1)!.categories = ['animal', 'brand'];
    const end = t2 + revealMs + CARD_GAME.timing.duelIntroMs + duelMs + CARD_GAME.timing.resultMs;
    const later = run(game, t2, end);
    const next = later.find((e) => e.kind === 'letter');
    expect(next).toMatchObject({ kind: 'letter', round: 3, changed: true });
    expect(next && next.kind === 'letter' && next.letter).not.toBe(first);
  });

  it('tout le monde retourne sa carte en même temps', () => {
    const { game, t } = twoPlayersAtReveal();
    run(game, 0, t);
    expect(game.phase).toBe('reveal');
    expect(game.players.every((p) => p.pile.length === 1 && p.deck.length === CARD_GAME.cardsPerPlayer - 1)).toBe(true);
  });

  it('même couleur : duel ; le gagnant donne sa pile, le perdant prend les deux piles', () => {
    const { game, a, b, t } = twoPlayersAtReveal();
    const now = forceDuel(game, a, b, t);
    expect(game.phase).toBe('duel');
    const usedCategory = game.duels[0]!.categories[0]!;
    game.letter = wordsStartingWith(usedCategory, 'A').length > 0 ? 'A' : 'B';
    const word = wordsStartingWith(usedCategory, game.letter)[0]!;
    const res = game.answer('a', usedCategory, word, now + 500);
    expect(res.error).toBeNull();
    expect(a.pile).toHaveLength(0);
    expect(b.pile).toHaveLength(0);
    expect(a.deck).toHaveLength(CARD_GAME.cardsPerPlayer - 1);
    expect(b.deck).toHaveLength(CARD_GAME.cardsPerPlayer + 1);
    expect(game.phase).toBe('result');
  });

  it('sans choisir de catégorie, le mot vaut dans n’importe quelle catégorie commune', () => {
    const { game, a, b, t } = twoPlayersAtReveal();
    run(game, 0, t);
    a.pile.at(-1)!.categories = ['animal', 'sport'];
    b.pile.at(-1)!.categories = ['sport', 'animal'];
    run(game, t, t + CARD_GAME.timing.revealMs);
    game.letter = 'T';
    expect(game.answer('a', null, 'tennis', t + 3000).error).toBeNull();
    expect(game.duels[0]).toMatchObject({ winnerId: 'a', category: 'sport' });
  });

  it('une mauvaise réponse bloque un instant, une catégorie hors carte est refusée', () => {
    const { game, a, b, t } = twoPlayersAtReveal();
    const now = forceDuel(game, a, b, t);
    const c1 = game.duels[0]!.categories[0]!;
    expect(game.answer('a', c1, 'zzzz', now).error).not.toBeNull();
    expect(game.answer('a', c1, 'zzzz', now + 100).error).toMatch(/Attends/);
    const other = CATEGORY_IDS.find((c) => !a.pile.at(-1)!.categories.includes(c))!;
    expect(game.answer('a', other, 'x', now + 5000).error).toMatch(/catégorie commune/);
  });

  it('les bots laissent le temps de répondre : pas avant la fin de la cinématique + le délai minimum', () => {
    const game = new CardGame(seeded(11));
    game.addPlayer('me', 'Moi', false);
    game.addPlayer('bot', 'Bot', true);
    game.start(0);
    run(game, 0, letterMs);
    const [me, bot] = game.players;
    bot!.pile.at(-1)!.categories = [...me!.pile.at(-1)!.categories];
    const t = letterMs + revealMs;
    run(game, letterMs, t);
    expect(game.phase).toBe('duel');
    const earliest = t + CARD_GAME.timing.duelIntroMs + CARD_GAME.bots.answerDelayMs[0];
    expect(run(game, t, earliest - 100).some((e) => e.kind === 'duelWon')).toBe(false);
    expect(game.endsAt).toBe(t + CARD_GAME.timing.duelIntroMs + duelMs);
  });

  it('sans réponse, le duel s’arrête et les piles restent', () => {
    const { game, a, b, t } = twoPlayersAtReveal();
    const now = forceDuel(game, a, b, t);
    const events = run(game, now, now + CARD_GAME.timing.duelIntroMs + duelMs);
    expect(events.some((e) => e.kind === 'duelTimeout')).toBe(true);
    expect(a.pile).toHaveLength(1);
    expect(b.pile).toHaveLength(1);
  });

  it('se débarrasser de toutes ses cartes fait gagner la partie', () => {
    const { game, a, b, t } = twoPlayersAtReveal();
    const now = forceDuel(game, a, b, t);
    a.deck = [];
    const c = game.duels[0]!.categories[0]!;
    game.letter = wordsStartingWith(c, 'A').length > 0 ? 'A' : 'B';
    game.answer('a', c, wordsStartingWith(c, game.letter)[0]!, now);
    const events = run(game, now, now + CARD_GAME.timing.resultMs);
    const end = events.find((e) => e.kind === 'finished');
    expect(end).toBeDefined();
    expect(game.ranking[0]).toMatchObject({ id: 'a', rank: 1, cards: 0 });
  });

  it('une partie entre bots va jusqu’au bout', () => {
    const game = new CardGame(seeded(5));
    for (let k = 0; k < 4; k++) game.addPlayer(`bot${k}`, `Bot ${k}`, true);
    game.start(0);
    const events = run(game, 0, 3_600_000);
    expect(events.some((e) => e.kind === 'duelWon')).toBe(true);
    expect(events.some((e) => e.kind === 'finished')).toBe(true);
  });

  it('en ligne : départ automatique quand on est assez, un joueur parti est remplacé par un bot', () => {
    const game = new CardGame(seeded());
    game.addPlayer('a', 'Alice', false);
    game.scheduleStart(0);
    expect(game.endsAt).toBe(0);
    game.addPlayer('b', 'Bilel', false);
    game.scheduleStart(0);
    run(game, 0, CARD_GAME.timing.lobbyMs);
    expect(game.phase).toBe('letter');
    expect(game.addPlayer('c', 'Chloé', false)).toMatch(/commencé/);
    game.removePlayer('b');
    expect(game.players[1]).toMatchObject({ bot: true, left: true });
  });
});
