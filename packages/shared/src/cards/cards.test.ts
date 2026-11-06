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

/** Force les cartes du dessus de deux joueurs à la même couleur, puis passe au duel. */
function forceDuel(game: CardGame, a: TablePlayer, b: TablePlayer, t: number) {
  run(game, 0, t);
  b.pile.at(-1)!.color = a.pile.at(-1)!.color;
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
    const category = a.pile.at(-1)!.categories[0];
    const word = wordsStartingWith(category, game.letter)[0] ?? wordsStartingWith(a.pile.at(-1)!.categories[1], game.letter)[0]!;
    const usedCategory = wordsStartingWith(category, game.letter).length > 0 ? category : a.pile.at(-1)!.categories[1];
    const res = game.answer('a', usedCategory, word, now + 500);
    expect(res.error).toBeNull();
    expect(a.pile).toHaveLength(0);
    expect(b.pile).toHaveLength(0);
    expect(a.deck).toHaveLength(CARD_GAME.cardsPerPlayer - 1);
    expect(b.deck).toHaveLength(CARD_GAME.cardsPerPlayer + 1);
    expect(game.phase).toBe('result');
  });

  it('une mauvaise réponse bloque un instant, une catégorie hors carte est refusée', () => {
    const { game, a, b, t } = twoPlayersAtReveal();
    const now = forceDuel(game, a, b, t);
    const [c1] = a.pile.at(-1)!.categories;
    expect(game.answer('a', c1, 'zzzz', now).error).not.toBeNull();
    expect(game.answer('a', c1, 'zzzz', now + 100).error).toMatch(/Attends/);
    const other = CATEGORY_IDS.find((c) => !a.pile.at(-1)!.categories.includes(c))!;
    expect(game.answer('a', other, 'x', now + 5000).error).toMatch(/deux catégories/);
  });

  it('sans réponse, le duel s’arrête et les piles restent', () => {
    const { game, a, b, t } = twoPlayersAtReveal();
    const now = forceDuel(game, a, b, t);
    const events = run(game, now, now + duelMs);
    expect(events.some((e) => e.kind === 'duelTimeout')).toBe(true);
    expect(a.pile).toHaveLength(1);
    expect(b.pile).toHaveLength(1);
  });

  it('se débarrasser de toutes ses cartes fait gagner la partie', () => {
    const { game, a, b, t } = twoPlayersAtReveal();
    const now = forceDuel(game, a, b, t);
    a.deck = [];
    const [c1, c2] = a.pile.at(-1)!.categories;
    const c = wordsStartingWith(c1, game.letter).length > 0 ? c1 : c2;
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
