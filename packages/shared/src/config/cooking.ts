/**
 * Cuisine façon « Cooking Mama » : quand on tient soi-même son commerce de
 * bouche, chaque client commande un plat qu'on prépare par petits gestes
 * (couper, remuer, retourner au bon moment, verser, monter le plat…).
 * La note (1 à 3 étoiles) fait le pourboire et la réputation du commerce.
 */

/** Gestes possibles d'une étape de recette. */
export type CookGesture =
  /** Glisser le doigt à travers l'ingrédient, `count` fois. */
  | 'chop'
  /** Tourner en rond dans la marmite, `count` tours. */
  | 'stir'
  /** Toucher quand le curseur est dans la zone verte. */
  | 'timing'
  /** Maintenir pour verser, relâcher au niveau du trait. */
  | 'pour'
  /** Toucher les ingrédients dans le bon ordre (`layers`). */
  | 'assemble'
  /** Tapoter vite, `count` fois (pétrir, saler, secouer). */
  | 'mash';

export interface CookStep {
  gesture: CookGesture;
  /** Consigne affichée (« Coupe les pommes de terre »). */
  label: string;
  icon: string;
  /** Coupes, tours ou tapes à faire (chop, stir, mash). */
  count?: number;
  /** Ingrédients à empiler dans l'ordre (assemble). */
  layers?: readonly string[];
}

export interface Recipe {
  id: string;
  label: string;
  icon: string;
  steps: readonly CookStep[];
}

export const COOKING = {
  /** Temps accordé pour chaque étape (ms), selon le geste. */
  stepTimeMs: { chop: 7_000, stir: 8_000, timing: 6_000, pour: 6_000, assemble: 9_000, mash: 5_000 } satisfies Record<CookGesture, number>,
  /** Le client attend au plus ce temps avant de partir (ms). */
  customerTimeoutMs: 120_000,
  /** En dessous de ce temps par étape, le plat est jugé impossible (anti-triche, ms). */
  minStepMs: 800,
  /** Moyenne des étapes (0 à 1) nécessaire pour 2 puis 3 étoiles. */
  starThresholds: [0.55, 0.85],
  /** Part du pourboire versée selon les étoiles (index = étoiles − 1). */
  tipShareByStars: [0, 0.5, 1],
  /** Timing : demi-largeur de la zone verte (0 à 1 sur la jauge) et vitesse du curseur (allers par seconde). */
  timingZone: 0.09,
  timingSpeed: 0.7,
  /** Verser : niveau visé et tolérance (0 à 1). */
  pourTarget: 0.75,
  pourTolerance: 0.25,
  /** Verser : remplissage complet en ce temps (ms). */
  pourFillMs: 2_200,
  /** Couper : longueur minimale d'un geste (px). */
  chopMinPx: 50,
  /** Réputation du commerce (0 à 100) : se rapproche de la note de chaque plat servi. */
  reputation: {
    /** Réputation visée selon les étoiles (index = étoiles − 1). */
    targetByStars: [20, 60, 100],
    /** Vitesse à laquelle elle s'en rapproche (part de l'écart, par plat). */
    pull: 0.1,
    /** À 100 de réputation, la recette quotidienne du commerce augmente de ce pourcentage. */
    maxRevenueBonus: 0.25,
  },
} as const;

/** Plats de chaque commerce de bouche (clés de BUSINESS_FOOD). */
export const RECIPES = {
  fastfood: [
    {
      id: 'burger',
      label: 'Burger',
      icon: '🍔',
      steps: [
        { gesture: 'timing', label: 'Retourne le steak au bon moment', icon: '🥩' },
        { gesture: 'assemble', label: 'Monte le burger', icon: '🍔', layers: ['🍞', '🥬', '🥩', '🧀', '🍅', '🍞'] },
      ],
    },
    {
      id: 'fries',
      label: 'Frites',
      icon: '🍟',
      steps: [
        { gesture: 'chop', label: 'Coupe les pommes de terre', icon: '🥔', count: 5 },
        { gesture: 'timing', label: 'Sors les frites de l’huile', icon: '🍟' },
        { gesture: 'mash', label: 'Sale les frites', icon: '🧂', count: 10 },
      ],
    },
  ],
  coffee: [
    {
      id: 'espresso',
      label: 'Expresso',
      icon: '☕',
      steps: [
        { gesture: 'stir', label: 'Mouds le café', icon: '🫘', count: 3 },
        { gesture: 'pour', label: 'Verse l’expresso jusqu’au trait', icon: '☕' },
      ],
    },
    {
      id: 'latte',
      label: 'Latte',
      icon: '🥛',
      steps: [
        { gesture: 'pour', label: 'Verse l’expresso', icon: '☕' },
        { gesture: 'stir', label: 'Fais mousser le lait', icon: '🥛', count: 4 },
        { gesture: 'pour', label: 'Verse le lait en dessinant un cœur', icon: '🤍' },
      ],
    },
  ],
  snack: [
    {
      id: 'kebab',
      label: 'Sandwich kebab',
      icon: '🥙',
      steps: [
        { gesture: 'chop', label: 'Découpe la viande', icon: '🍖', count: 6 },
        { gesture: 'assemble', label: 'Garnis le pain', icon: '🥙', layers: ['🫓', '🍖', '🥬', '🍅', '🧅'] },
        { gesture: 'pour', label: 'Mets la sauce blanche', icon: '🥛' },
      ],
    },
    {
      id: 'tacos',
      label: 'Tacos',
      icon: '🌯',
      steps: [
        { gesture: 'assemble', label: 'Garnis la galette', icon: '🌯', layers: ['🫓', '🍗', '🍟', '🧀'] },
        { gesture: 'pour', label: 'Verse la sauce fromagère', icon: '🧀' },
        { gesture: 'timing', label: 'Sors le tacos du grill', icon: '🔥' },
      ],
    },
  ],
  restaurant: [
    {
      id: 'steak-frites',
      label: 'Steak-frites',
      icon: '🥩',
      steps: [
        { gesture: 'chop', label: 'Coupe les pommes de terre', icon: '🥔', count: 5 },
        { gesture: 'timing', label: 'Cuis le steak à point', icon: '🥩' },
        { gesture: 'assemble', label: 'Dresse l’assiette', icon: '🍽️', layers: ['🍽️', '🥩', '🍟', '🥗'] },
      ],
    },
    {
      id: 'couscous',
      label: 'Couscous',
      icon: '🍲',
      steps: [
        { gesture: 'chop', label: 'Coupe les légumes', icon: '🥕', count: 6 },
        { gesture: 'stir', label: 'Égraine la semoule', icon: '🍚', count: 3 },
        { gesture: 'assemble', label: 'Sers le couscous', icon: '🍲', layers: ['🍚', '🥕', '🫘', '🍗', '🌶️'] },
      ],
    },
    {
      id: 'pizza',
      label: 'Pizza',
      icon: '🍕',
      steps: [
        { gesture: 'mash', label: 'Pétris la pâte', icon: '🫓', count: 12 },
        { gesture: 'assemble', label: 'Garnis la pizza', icon: '🍕', layers: ['🍅', '🧀', '🍄', '🫒'] },
        { gesture: 'timing', label: 'Sors la pizza du four', icon: '🔥' },
      ],
    },
    {
      id: 'mafe',
      label: 'Mafé',
      icon: '🍛',
      steps: [
        { gesture: 'chop', label: 'Coupe la viande', icon: '🍖', count: 5 },
        { gesture: 'stir', label: 'Remue la sauce d’arachide', icon: '🥜', count: 4 },
        { gesture: 'pour', label: 'Nappe le riz de sauce', icon: '🍛' },
      ],
    },
  ],
} as const satisfies Record<string, readonly Recipe[]>;
