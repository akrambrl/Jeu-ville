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

export interface FoodItem {
  id: string;
  label: string;
  icon: string;
  costCents: number;
  effects: Partial<Record<'hunger' | 'hygiene' | 'appearance' | 'health', number>>;
}

/**
 * Ce qu'on peut manger dehors, par type de lieu : marchands ambulants (maïs,
 * marrons), boulangeries, fast-foods, grandes surfaces. Manger chez soi reste
 * le meilleur rapport qualité-prix (voir HOME_ACTIONS.eat).
 */
export const FOOD_MENUS = {
  corn: [{ id: 'corn', label: 'Maïs grillé', icon: '🌽', costCents: 2 * CENTS_PER_EURO, effects: { hunger: 20 } }],
  chestnut: [{ id: 'chestnuts', label: 'Cornet de marrons', icon: '🌰', costCents: 3 * CENTS_PER_EURO, effects: { hunger: 25 } }],
  bakery: [
    { id: 'croissant', label: 'Croissant', icon: '🥐', costCents: 1.5 * CENTS_PER_EURO, effects: { hunger: 10 } },
    { id: 'sandwich', label: 'Sandwich', icon: '🥖', costCents: 5 * CENTS_PER_EURO, effects: { hunger: 35 } },
  ],
  fastfood: [
    { id: 'snack', label: 'Snack', icon: '🌯', costCents: 7 * CENTS_PER_EURO, effects: { hunger: 45 } },
    { id: 'menu', label: 'Menu complet', icon: '🍔', costCents: 10 * CENTS_PER_EURO, effects: { hunger: 65 } },
  ],
  supermarket: [
    { id: 'fruit', label: 'Fruits', icon: '🍎', costCents: 2 * CENTS_PER_EURO, effects: { hunger: 12, health: 2 } },
    { id: 'ready-meal', label: 'Plat à emporter', icon: '🥡', costCents: 6 * CENTS_PER_EURO, effects: { hunger: 45 } },
  ],
} as const satisfies Record<string, readonly FoodItem[]>;

/** Déplacements payants dans la ville (entre villes, la téléportation est gratuite). */
export const TRAVEL = {
  /** Ticket de bus pour aller directement à un lieu du quartier. */
  busFareCents: 2 * CENTS_PER_EURO,
  /** En dessous de cette distance (cases), on y va à pied. */
  minBusDistance: 15,
  /** Rayon (cases) où chercher la chaussée où le bus dépose le joueur. */
  curbSearchRadius: 14,
  /** Cinématique : le bus arrive, s'arrête (on descend), puis repart (ms). */
  busArriveMs: 2_400,
  busStopMs: 1_400,
  busLeaveMs: 2_000,
} as const;

/** Passants (bots) qui se promènent dans le quartier, serveur comme démo solo. */
export const PASSERBY = {
  countPerDistrict: 30,
  /** Ils marchent un peu moins vite que les joueurs. */
  speedFactor: 0.6,
  maxPathLength: 80,
  /** Rayon (cases) dans lequel un passant choisit sa prochaine destination. */
  targetRadius: 25,
  /** Part des passants qui promènent leur chien. */
  dogShare: 0.3,
  /** Pause (ms) avant de repartir, après être arrivé. */
  restMs: [1_000, 6_000],
} as const;

/** Véhicules légers (magasin de cycles) : plus rapides que la marche. */
export const VEHICLES = {
  bike: { label: 'Vélo', icon: '🚲', priceCents: 250 * CENTS_PER_EURO, speedFactor: 2 },
  scooter: {
    label: 'Trottinette électrique',
    icon: '🛴',
    priceCents: 450 * CENTS_PER_EURO,
    speedFactor: 2.5,
    /** Batterie consommée (%) par case parcourue ; rechargée chez soi. */
    batteryPerTile: 0.25,
  },
} as const;

/** Animaux de compagnie (animalerie). Il faut s'en occuper, sinon un refuge les recueille. */
export const PETS = {
  species: {
    dog: { label: 'Chien', icon: '🐶', priceCents: 300 * CENTS_PER_EURO, names: ['Rex', 'Moka', 'Filou', 'Oreo', 'Simba', 'Pistache'] },
    cat: { label: 'Chat', icon: '🐱', priceCents: 200 * CENTS_PER_EURO, names: ['Minou', 'Caramel', 'Nala', 'Pacha', 'Choupette', 'Tigrou'] },
  },
  /** Robes disponibles par espèce (rendu côté client). */
  coats: 4,
  maxPerCharacter: 1,
  /** Faim de l'animal : vide en 24 h réelles ; son bonheur baisse en 48 h. */
  hungerDecayPerRealHour: 100 / 24,
  happinessDecayPerRealHour: 100 / 48,
  kibble: { label: 'Croquettes', icon: '🦴', costCents: 3 * CENTS_PER_EURO, hunger: 60 },
  /** Bonheur gagné par case de promenade avec son animal. */
  walkHappinessPerTile: 0.5,
  /** Ventre vide depuis plus longtemps que ça (h réelles) : recueilli par un refuge… */
  neglectHours: 48,
  /** … avec une amende. */
  shelterFineCents: 150 * CENTS_PER_EURO,
  /** Bonheur du joueur : jusqu'à +8 avec un animal heureux, −15 pendant 3 jours après l'avoir perdu. */
  happinessBonus: 8,
  lossPenalty: -15,
  lossPenaltyHours: 72,
} as const;

export const MOVEMENT = {
  /** Vitesse de marche, en cases par seconde. */
  walkTilesPerSecond: 4,
  /** Distance max (en cases) à la porte pour agir « chez soi ». */
  homeInteractionRange: 1.5,
  /** Distance max (en cases) à un marchand ou à l'entrée d'un commerce pour acheter à manger. */
  foodInteractionRange: 1.6,
  /** Longueur max d'un trajet demandé, pour borner le coût de l'A*. */
  maxPathLength: 600,
  /** Bloqué par quelqu'un sur la case suivante : on cherche un autre chemin au bout de… (ms). */
  blockedRepathMs: 500,
  /** … et on abandonne le trajet si l'on est encore bloqué au bout de (ms). */
  blockedGiveUpMs: 3000,
  /** Rayon (cases) de recherche d'une case libre quand la destination est occupée. */
  freeTileSearchRadius: 4,
} as const;

export const SERVER = {
  /** Fréquence de la boucle de simulation d'une room (ms). */
  roomTickMs: 100,
  /** Fréquence d'envoi des jauges au joueur connecté (ms). */
  selfSnapshotIntervalMs: 60_000,
} as const;

/**
 * Commerces rares : nombre maximum par ville (cahier des charges §10).
 * Médecins et pharmacies sont tenus par des bots uniquement.
 */
export const CITY_LIMITS = {
  pharmacies: 2,
  doctors: 2,
  /** Un commissariat par ville. */
  policeStations: 1,
  /** Une agence immobilière par ville, tenue par un bot. */
  realEstateAgencies: 1,
  /** Une agence pour l'emploi par ville. */
  jobCenters: 1,
} as const;
