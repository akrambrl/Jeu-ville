/**
 * Équilibrage du jeu de cartes : tous les chiffres vivent ici (aucun nombre
 * magique dans la logique). Durées en millisecondes réelles.
 */

export const CARD_GAME = {
  /** Joueurs autour d'une table (vrais joueurs en ligne, ou toi + bots en solo). */
  players: { min: 2, max: 6 },
  /** Mode solo : nombre de bots adversaires. */
  soloBots: { min: 1, max: 5, default: 3 },
  /**
   * Nombre de couleurs selon le nombre de joueurs : à peu de joueurs, moins de
   * couleurs, sinon les duels (même couleur) se font attendre. Au-delà : toutes.
   */
  colorsByPlayers: { 2: 2, 3: 3 } as Readonly<Record<number, number>>,
  /** Cartes distribuées à chacun au début de la partie. */
  cardsPerPlayer: 12,

  /**
   * Lettres que le tirage peut sortir. Les lettres trop dures pour la plupart des
   * catégories (K, Q, U, W, X, Y, Z) sont exclues.
   */
  letters: 'ABCDEFGHIJLMNOPRSTV',

  timing: {
    /** En ligne : attente avant le début, dès qu'il y a assez de joueurs. */
    lobbyMs: 10_000,
    /** Tirage de la lettre (animation) avant que les cartes soient posées. */
    letterMs: 2_500,
    /** Cartes retournées sur la table, le temps de voir les couleurs. */
    revealMs: 1_500,
    /** Temps pour répondre pendant un duel. */
    duelMs: 15_000,
    /** Après une manche : on montre qui a gagné quoi. */
    resultMs: 3_500,
    /** Manche sans duel : on enchaîne plus vite. */
    noDuelMs: 1_200,
    /** Fin de partie : classement affiché avant de revenir au salon (en ligne). */
    finishedMs: 20_000,
  },

  answer: {
    maxLength: 40,
    /** Mauvaise réponse : on ne peut pas retenter avant… */
    wrongLockMs: 1_500,
  },

  bots: {
    /** Délai de réponse d'un bot pendant un duel (tirage uniforme). */
    answerDelayMs: [3_500, 10_000],
    /** Chance qu'un bot trouve un mot (sinon il sèche). */
    successRate: 0.75,
    names: ['Yanis', 'Inès', 'Moussa', 'Chloé', 'Rayan', 'Sofia', 'Kenza', 'Lucas'],
  },

  /** Sécurité : au-delà de tant de manches, la partie s'arrête (classement au nombre de cartes). */
  maxRounds: 250,
} as const;

/** Couleurs des cartes (deux cartes de même couleur sur la table = duel). */
export const CARD_COLORS = ['red', 'blue', 'green', 'yellow'] as const;
export type CardColor = (typeof CARD_COLORS)[number];

export const CARD_COLOR_LABELS: Record<CardColor, { name: string; hex: string }> = {
  red: { name: 'Rouge', hex: '#e63946' },
  blue: { name: 'Bleu', hex: '#277da1' },
  green: { name: 'Vert', hex: '#2a9d5c' },
  yellow: { name: 'Jaune', hex: '#f4b400' },
};
