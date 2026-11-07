import { describe, expect, it } from 'vitest';
import { CARD_GAME } from '../config/cards.js';
import { checkAnswer, normalizeWord, wordsStartingWith } from './answers.js';
import { CATEGORY_IDS } from './categories.js';
import { CardGame, type GameEvent, type TablePlayer } from './game.js';
import { WORDS } from './words.js';

const { anteMs, spinMs, duelMs, resultMs } = CARD_GAME.timing;

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

/** Deux joueurs humains, partie lancée ; renvoie l'instant où l'on peut répondre. */
function twoPlayersAtDuel() {
  const game = new CardGame(seeded());
  game.addPlayer('a', 'Alice', false);
  game.addPlayer('b', 'Bilel', false);
  const first = game.start(0);
  const t = anteMs + spinMs;
  const events = [...first, ...run(game, 0, t)];
  return { game, a: game.players[0]!, b: game.players[1]!, t, events };
}

/** Un mot valide pour la manche en cours. */
const goodWord = (game: CardGame) => wordsStartingWith(game.category!, game.letter)[0]!;

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

  it('un prénom reste lui-même : Ali n’est pas Alix', () => {
    expect(checkAnswer('firstName', 'A', 'Ali')).toEqual({ ok: true, word: 'Ali' });
    expect(checkAnswer('firstName', 'A', 'Alix')).toEqual({ ok: true, word: 'Alix' });
    expect(checkAnswer('firstName', 'L', 'Lucas')).toEqual({ ok: true, word: 'Lucas' });
    expect(checkAnswer('place', 'P', 'Paris')).toEqual({ ok: true, word: 'Paris' });
    // Le pluriel reste toléré pour les noms communs.
    expect(checkAnswer('fruitVeg', 'B', 'bananes')).toEqual({ ok: true, word: 'banane' });
  });

  it('marques : mode, luxe, beauté, tech…', () => {
    for (const [letter, brand] of [['F', 'Furla'], ['L', 'Longchamp'], ['S', 'Sephora'], ['X', 'Xiaomi'], ['D', 'Dolce Gabbana']]) {
      expect(checkAnswer('brand', letter!, brand!).ok, brand).toBe(true);
    }
  });

  it('petites catégories enrichies : corps, vêtements, plats, sports, maison', () => {
    const cases: [Parameters<typeof checkAnswer>[0], string, string][] = [
      ['bodyPart', 'T', 'tendon'],
      ['bodyPart', 'C', 'clavicule'],
      ['clothing', 'K', 'kilt'],
      ['dish', 'T', 'tarte tatin'],
      ['sport', 'P', 'padel'],
      ['houseObject', 'G', 'grille-pain'],
    ];
    for (const [category, letter, word] of cases) expect(checkAnswer(category, letter, word).ok, word).toBe(true);
  });

  it('tolère une faute de frappe sur les mots d’au moins 5 lettres', () => {
    const ok: [Parameters<typeof checkAnswer>[0], string, string, string][] = [
      ['animal', 'M', 'mamouth', 'mammouth'], ['animal', 'E', 'élephan', 'éléphant'], ['animal', 'G', 'girfae', 'girafe'],
      ['place', 'M', 'Marseile', 'Marseille'], ['dish', 'T', 'tarte tatn', 'tarte tatin'],
    ];
    for (const [category, letter, typed, word] of ok) expect(checkAnswer(category, letter, typed), typed).toEqual({ ok: true, word });
    // Deux fautes, mot trop court, ou première lettre changée : refusé.
    expect(checkAnswer('animal', 'M', 'mammhout').ok).toBe(false);
    expect(checkAnswer('animal', 'C', 'cht').ok).toBe(false);
    expect(checkAnswer('animal', 'R', 'rion').ok).toBe(false);
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
  it('chacun reçoit ses pièces, pose la mise au milieu, puis les catégories s’arrêtent sur une seule', () => {
    const { game, a, b, events } = twoPlayersAtDuel();
    const start = CARD_GAME.coins.start;
    expect(events[0]).toEqual({ kind: 'ante', round: 1, ante: 1, pot: 2, paid: { a: 1, b: 1 } });
    expect([a.coins, b.coins, game.pot]).toEqual([start - 1, start - 1, 2]);
    expect(events).toContainEqual({ kind: 'spin', category: game.category, letter: game.letter });
    expect(events.at(-1)).toEqual({ kind: 'duel' });
    expect(game.phase).toBe('duel');
    // Toujours des mots possibles pour la catégorie et la lettre tirées.
    expect(wordsStartingWith(game.category!, game.letter).length).toBeGreaterThanOrEqual(CARD_GAME.minWordsPerRound);
  });

  it('pas de réponse avant la fin du défilement', () => {
    const game = new CardGame(seeded());
    game.addPlayer('a', 'Alice', false);
    game.addPlayer('b', 'Bilel', false);
    game.start(0);
    run(game, 0, anteMs + 100);
    expect(game.phase).toBe('spin');
    expect(game.answer('a', null, goodWord(game), anteMs + 200).error).toMatch(/catégories/);
  });

  it('le premier qui répond juste rafle tout le tas', () => {
    const { game, a, b, t } = twoPlayersAtDuel();
    const { error, events } = game.answer('b', null, goodWord(game), t + 500);
    expect(error).toBeNull();
    expect(events[0]).toMatchObject({ kind: 'won', winnerId: 'b', pot: 2 });
    expect([a.coins, b.coins, game.pot]).toEqual([CARD_GAME.coins.start - 1, CARD_GAME.coins.start + 1, 0]);
    expect(game.phase).toBe('result');
    // Trop tard pour l'autre.
    expect(game.answer('a', null, goodWord(game), t + 600).error).not.toBeNull();
  });

  it('une mauvaise réponse bloque un instant sans coûter de pièce', () => {
    const { game, a, t } = twoPlayersAtDuel();
    const coins = a.coins;
    expect(game.answer('a', null, 'zzzzz', t + 100).error).not.toBeNull();
    expect(game.answer('a', null, goodWord(game), t + 200).error).toMatch(/seconde/);
    expect(game.answer('a', null, goodWord(game), t + 100 + CARD_GAME.answer.wrongLockMs).error).toBeNull();
    expect(a.coins).toBe(coins + 2);
  });

  it('personne ne trouve : le tas reste au milieu (cagnotte) et grossit', () => {
    const { game, t } = twoPlayersAtDuel();
    const events = run(game, t, t + duelMs + resultMs);
    expect(events).toContainEqual({ kind: 'timeout', pot: 2 });
    expect(events).toContainEqual(expect.objectContaining({ kind: 'ante', round: 2, pot: 4 }));
    expect(game.pot).toBe(4);
  });

  it('la mise monte toutes les quelques manches', () => {
    const step = CARD_GAME.coins.anteStepRounds;
    expect(CardGame.anteFor(1)).toBe(CARD_GAME.coins.ante);
    expect(CardGame.anteFor(step)).toBe(CARD_GAME.coins.ante);
    expect(CardGame.anteFor(step + 1)).toBe(CARD_GAME.coins.ante + 1);
    expect(CardGame.anteFor(2 * step + 1)).toBe(CARD_GAME.coins.ante + 2);
  });

  it('qui n’a plus de pièce est éliminé ; le dernier en lice gagne et prend la cagnotte', () => {
    const game = new CardGame(seeded());
    for (const id of ['a', 'b', 'c']) game.addPlayer(id, id.toUpperCase(), false);
    game.start(0);
    const [a, b, c] = game.players as [TablePlayer, TablePlayer, TablePlayer];
    let t = anteMs + spinMs;
    run(game, 0, t);
    // Manche 1 : a est à sec, c gagne.
    a.coins = 0;
    game.answer('c', null, goodWord(game), t + 100);
    let events = run(game, t + 100, t + 100 + resultMs + anteMs + spinMs);
    t += 100 + resultMs + anteMs + spinMs;
    expect(events).toContainEqual({ kind: 'eliminated', ids: ['a'] });
    expect(events).toContainEqual(expect.objectContaining({ kind: 'ante', round: 2, paid: { b: 1, c: 1 } }));
    expect(game.answer('a', null, goodWord(game), t + 100).error).toMatch(/éliminé/);
    // Manche 2 : b n'a plus rien après sa mise, personne ne trouve (cagnotte), b est éliminé.
    b.coins = 0;
    const potBefore = game.pot;
    const cBefore = c.coins;
    events = run(game, t, t + duelMs + resultMs);
    expect(events).toContainEqual({ kind: 'eliminated', ids: ['b'] });
    const finished = events.find((e) => e.kind === 'finished');
    expect(finished && finished.kind === 'finished' && finished.ranking.map((r) => [r.id, r.rank])).toEqual([['c', 1], ['b', 2], ['a', 3]]);
    // Le dernier en lice récupère la cagnotte.
    expect(game.pot).toBe(0);
    expect(c.coins).toBe(cBefore + potBefore);
  });

  it('tout le monde à sec : manche gratuite, personne n’est éliminé', () => {
    const { game, a, b, t } = twoPlayersAtDuel();
    a.coins = 0;
    b.coins = 0;
    const events = run(game, t, t + duelMs + resultMs);
    expect(events.some((e) => e.kind === 'eliminated')).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'ante', round: 2, pot: 2, paid: { a: 0, b: 0 } }));
  });

  it('une lettre ne revient qu’une fois toutes les autres sorties ; jamais deux fois la même catégorie de suite', () => {
    const game = new CardGame(seeded(7));
    for (let k = 0; k < 2; k++) game.addPlayer(`bot${k}`, `Bot ${k}`, true);
    const events = game.start(0).concat(run(game, 0, 3_600_000));
    const spins = events.filter((e): e is Extract<GameEvent, { kind: 'spin' }> => e.kind === 'spin');
    const letters = spins.map((e) => e.letter);
    const n = CARD_GAME.letters.length;
    expect(letters.length).toBeGreaterThan(n);
    for (let k = 0; k + n <= letters.length; k += n) expect(new Set(letters.slice(k, k + n)).size).toBe(n);
    for (let k = 1; k < spins.length; k++) expect(spins[k]!.category).not.toBe(spins[k - 1]!.category);
    expect(new Set(spins.map((e) => e.category)).size).toBeGreaterThan(CATEGORY_IDS.length / 2);
  });

  it('une partie sauvegardée se reprend sur un autre téléphone, avec une autre horloge', () => {
    const { game, t } = twoPlayersAtDuel();
    const snap = JSON.parse(JSON.stringify(game.snapshot(t + 300)));
    const copy = CardGame.restore(snap, 50_000);
    expect(copy.view(50_000)).toEqual(game.view(t + 300));
    expect(copy.endsAt - 50_000).toBe(game.endsAt - (t + 300));
    expect(copy.answer('a', null, goodWord(copy), 50_100).error).toBeNull();
  });

  it('les bots laissent le temps de répondre après le défilement', () => {
    const game = new CardGame(seeded(11));
    game.addPlayer('me', 'Moi', false);
    game.addPlayer('bot', 'Bot', true);
    game.start(0);
    const t = anteMs + spinMs;
    const early = run(game, 0, t + CARD_GAME.bots.answerDelayMs[0] - 100);
    expect(early.some((e) => e.kind === 'won')).toBe(false);
  });

  it('une partie entre bots va jusqu’au bout', () => {
    const game = new CardGame(seeded(5));
    for (let k = 0; k < 4; k++) game.addPlayer(`bot${k}`, `Bot ${k}`, true);
    game.start(0);
    const events = run(game, 0, 3_600_000);
    expect(events.some((e) => e.kind === 'won')).toBe(true);
    const finished = events.find((e) => e.kind === 'finished');
    expect(finished).toBeDefined();
    // Les pièces ne se perdent pas : le total reste celui du départ.
    expect(finished && finished.kind === 'finished' && finished.ranking.reduce((n, r) => n + r.coins, 0)).toBe(4 * CARD_GAME.coins.start);
  });

  it('en ligne : départ automatique quand on est assez, un joueur parti est remplacé par un bot', () => {
    const game = new CardGame(seeded());
    game.addPlayer('a', 'Alice', false);
    game.scheduleStart(0);
    expect(game.endsAt).toBe(0);
    game.addPlayer('b', 'Bilel', false);
    game.scheduleStart(0);
    run(game, 0, CARD_GAME.timing.lobbyMs);
    expect(game.phase).toBe('ante');
    expect(game.addPlayer('c', 'Chloé', false)).toMatch(/commencé/);
    game.removePlayer('b');
    expect(game.players[1]).toMatchObject({ bot: true, left: true });
  });
});
