/**
 * Chiffres d'équilibrage du jeu.
 *
 * Règle du projet : AUCUN nombre de gameplay ailleurs que dans ce dossier.
 * Les montants sont en centimes (entiers).
 */

/** 1 € de jeu = 100 centimes. */
export const CENTS_PER_EURO = 100;

export const ECONOMY = {
  /** Capital de départ d'un nouveau personnage : 20 000 €. */
  startingMoneyCents: 20_000 * CENTS_PER_EURO,
} as const;

export const TIME = {
  /** 1 an de jeu = 1 semaine réelle. */
  realMsPerGameYear: 7 * 24 * 60 * 60 * 1000,
  gameDaysPerYear: 365,
  startingAge: 25,
  maxAge: 70,
  /** Mandat de maire, en semaines réelles. */
  mayorTermRealWeeks: 4,
} as const;

/** Valeur max de chaque jauge. */
export const GAUGE_MAX = 100;

/**
 * Décroissance des jauges, en points par heure RÉELLE.
 * Calibré pour une visite par jour : la faim tombe à 0 en ~30 h.
 */
export const GAUGE_DECAY_PER_REAL_HOUR = {
  hunger: GAUGE_MAX / 30,
  hygiene: GAUGE_MAX / 36,
  appearance: GAUGE_MAX / 72,
  /** Usure naturelle de la santé (≈ 0 en 14 jours sans aucun soin). */
  health: GAUGE_MAX / (14 * 24),
  /** Perte de santé supplémentaire tant que la faim est à 0. */
  healthWhileStarving: GAUGE_MAX / 24,
} as const;

/** Valeurs des jauges à la création du personnage. */
export const STARTING_GAUGES = {
  hunger: 80,
  hygiene: 80,
  appearance: 70,
  health: 90,
} as const;

/**
 * Poids des jauges dans le calcul du bonheur (somme = 1).
 * Le bonheur est dérivé des autres jauges + bonus de logement.
 */
export const HAPPINESS_WEIGHTS = {
  hunger: 0.3,
  hygiene: 0.2,
  appearance: 0.15,
  health: 0.35,
} as const;

/** Seuil sous lequel une jauge est affichée « critique ». */
export const GAUGE_CRITICAL_THRESHOLD = 20;

export const HOUSING = {
  starterApartment: {
    /** Loyer de l'appart de départ (prélevé à partir de la phase 2). */
    weeklyRentCents: 150 * CENTS_PER_EURO,
    /** Bonus de bonheur apporté par ce logement. */
    happinessBonus: 0,
    /** Nombre d'apparts par étage dans un immeuble de départ. */
    apartmentsPerLevel: 4,
  },
} as const;

/** Actions disponibles chez soi (phase 1). */
export const HOME_ACTIONS = {
  eat: {
    label: 'Manger',
    costCents: 8 * CENTS_PER_EURO,
    effects: { hunger: 60 },
  },
  shower: {
    label: 'Se doucher',
    costCents: 0,
    effects: { hygiene: 100 },
  },
  dress: {
    label: 'Se changer',
    costCents: 0,
    effects: { appearance: 40 },
  },
} as const;

export const MOVEMENT = {
  /** Vitesse de marche, en cases par seconde. */
  walkTilesPerSecond: 4,
  /** Distance max (en cases) à la porte pour agir « chez soi ». */
  homeInteractionRange: 1.5,
  /** Longueur max d'un trajet demandé, pour borner le coût de l'A*. */
  maxPathLength: 600,
} as const;

export const SERVER = {
  /** Fréquence de la boucle de simulation d'une room (ms). */
  roomTickMs: 100,
  /** Fréquence d'envoi des jauges au joueur connecté (ms). */
  selfSnapshotIntervalMs: 60_000,
} as const;
