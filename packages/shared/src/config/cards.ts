/**
 * Équilibrage du jeu (pièces d'or) : tous les chiffres vivent ici (aucun nombre
 * magique dans la logique). Durées en millisecondes réelles.
 */

export const CARD_GAME = {
  /** Joueurs autour d'une table (vrais joueurs en ligne, ou toi + bots en solo). */
  players: { min: 2, max: 6 },
  /** Mode solo : nombre de bots adversaires. */
  soloBots: { min: 1, max: 5, default: 3 },

  /**
   * Pièces d'or : chacun en reçoit `start` ; à chaque manche, chacun pose la
   * mise au milieu (ou ce qui lui reste). La mise monte de 1 toutes les
   * `anteStepRounds` manches (1, puis 2, puis 3…) : les parties ne traînent pas.
   */
  coins: { start: 10, ante: 1, anteStepRounds: 5 },

  /**
   * Lettres que le tirage peut sortir. Les lettres trop dures pour la plupart des
   * catégories (K, Q, U, W, X, Y, Z) sont exclues.
   */
  letters: 'ABCDEFGHIJLMNOPRSTV',
  /** Une catégorie n'est tirée avec une lettre que si la liste du jeu a au moins tant de mots possibles. */
  minWordsPerRound: 5,

  timing: {
    /** En ligne : attente avant le début, dès qu'il y a assez de joueurs. */
    lobbyMs: 10_000,
    /** Chacun pose sa mise au milieu (les pièces volent vers le tas). */
    anteMs: 1_400,
    /** Les catégories défilent devant chacun, puis s'arrêtent sur la même : ne compte pas dans le temps de réponse. */
    spinMs: 3_200,
    /** Temps pour répondre (après le défilement). */
    duelMs: 15_000,
    /** Après une manche : on montre qui a raflé le tas. */
    resultMs: 3_200,
    /** Fin de partie : classement affiché avant de revenir au salon (en ligne). */
    finishedMs: 20_000,
  },

  answer: {
    maxLength: 40,
    /**
     * Fautes de frappe tolérées : un mot à `maxEdits` faute près (lettre en trop,
     * en moins, remplacée, ou deux lettres voisines inversées) d'un mot de la
     * liste est accepté, s'il fait au moins `minLength` lettres.
     */
    typos: { maxEdits: 1, minLength: 5 },
    /** Mauvaise réponse : on ne peut pas retenter avant… */
    wrongLockMs: 1_500,
  },

  bots: {
    /**
     * Délai de réponse d'un bot, compté après le défilement des catégories
     * (tirage uniforme) : il faut laisser le temps de taper un mot sur téléphone.
     */
    answerDelayMs: [6_000, 13_000],
    /** Chance qu'un bot trouve un mot (sinon il sèche). */
    successRate: 0.7,
    names: ['Yanis', 'Inès', 'Moussa', 'Chloé', 'Rayan', 'Sofia', 'Kenza', 'Lucas'],
  },

  /** Sécurité : au-delà de tant de manches, la partie s'arrête (classement au nombre de pièces). */
  maxRounds: 250,
} as const;

/**
 * Jeu en ligne, sans serveur à nous (Supabase Realtime) : le téléphone de
 * l'hôte arbitre la table ; si l'hôte part, un autre joueur reprend la partie.
 */
export const ONLINE = {
  /** Un joueur qui perd le réseau garde sa place tant de secondes (sinon un bot le remplace). */
  reconnectSeconds: 30,
  /** L'hôte envoie la table (et la partie complète, pour la reprise) à ce rythme (ms). */
  syncMs: 1_000,
  /** Sans nouvelles de l'hôte depuis tant de ms, un autre joueur reprend la partie. */
  hostTimeoutMs: 6_000,
  /** Rejoindre une table : sans réponse de l'hôte au bout de tant de ms, elle n'existe pas. */
  joinTimeoutMs: 5_000,
  /** Partie rapide : temps passé à écouter le salon avant de choisir (ou créer) une table. */
  lobbyScanMs: 1_500,
  /** Boucle de jeu de l'hôte (ms). */
  tickMs: 100,
  /** Code d'une table privée : longueur et lettres utilisées (sans 0/O ni 1/I, qui se confondent). */
  codeLength: 5,
  codeAlphabet: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
} as const;
