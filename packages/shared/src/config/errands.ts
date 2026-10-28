/**
 * Missions du quotidien (« coups de main ») : des habitants du quartier
 * demandent de l'aide. Nouvelles demandes chaque jour ; récompense en argent
 * et/ou en bonté (bonus de bonheur qui s'estompe avec le temps).
 */
import { CENTS_PER_EURO } from './balance.js';

export const ERRANDS = {
  /** Demandes affichées par quartier et par jour. */
  offersPerDistrict: 6,
  /** Missions qu'un joueur peut faire par jour. */
  perDay: 4,
  /** Distance (cases) à laquelle on atteint une cible (chien, porte…). */
  reach: 1.6,
  /** L'objet cherché (chien, portefeuille) se voit à moins de tant de cases. */
  revealRadius: 7,
  /** Rayon (cases) de la zone de recherche indiquée, autour de l'objet. */
  searchRadius: 5,
  /** Temps pour finir une mission une fois acceptée (ms). */
  timeLimitMs: 15 * 60_000,
  /** Bonté : bonus de bonheur, qui baisse de `decayPerRealHour` par heure réelle. */
  kindness: { max: 30, decayPerRealHour: 30 / 24 },
} as const;

export type ErrandType = 'lostDog' | 'groceries' | 'tools' | 'wallet';

export interface ErrandTypeConfig {
  icon: string;
  title: string;
  rewardCents: number;
  /** Points de bonté (bonus de bonheur). */
  kindness: number;
  /** Distance (cases) entre le demandeur et ce qu'il faut atteindre. */
  distance: [number, number];
  /** Qui demande de l'aide (un au hasard), et sa tenue (BASE_LOOKS). */
  givers: { name: string; sex: 'male' | 'female' }[];
  baseLook: number;
  hairColor?: number;
  /** Ce que dit le demandeur pour expliquer. */
  ask: string[];
  /** Instruction affichée à chaque étape. */
  steps: string[];
  thanks: string[];
}

export const ERRAND_TYPES: Record<ErrandType, ErrandTypeConfig> = {
  lostDog: {
    icon: '🐶',
    title: 'Le chien perdu',
    rewardCents: 20 * CENTS_PER_EURO,
    kindness: 10,
    distance: [10, 20],
    givers: [{ name: 'Kevin', sex: 'male' }, { name: 'Nadia', sex: 'female' }, { name: 'Julien', sex: 'male' }, { name: 'Mariam', sex: 'female' }],
    baseLook: 0,
    ask: ['Mon chien s’est échappé pendant la balade… 😢', 'Il ne doit pas être loin. Tu peux m’aider à le retrouver ?'],
    steps: ['Cherche le chien dans la zone indiquée.', 'Ramène le chien à la personne qui le cherche.'],
    thanks: ['Tu l’as retrouvé ! Merci, merci !', 'Tiens, c’est pour toi. Tu es quelqu’un de bien.'],
  },
  groceries: {
    icon: '🛍️',
    title: 'Les courses de mamie',
    rewardCents: 0,
    kindness: 15,
    distance: [8, 18],
    givers: [{ name: 'Mamie Jeanne', sex: 'female' }, { name: 'Mamie Fatima', sex: 'female' }, { name: 'Mamie Rose', sex: 'female' }, { name: 'Mamie Yvette', sex: 'female' }],
    baseLook: 4,
    hairColor: 5,
    ask: ['Oh mon petit, ces sacs sont bien lourds pour mes vieux bras…', 'Tu veux bien m’aider à les porter jusque chez moi ?'],
    steps: ['Raccompagne mamie jusqu’à sa porte.'],
    thanks: ['Nous voilà arrivés ! Que tu es serviable.', 'Ça fait chaud au cœur, des jeunes comme toi.'],
  },
  tools: {
    icon: '🧰',
    title: 'Les outils du voisin',
    rewardCents: 5 * CENTS_PER_EURO,
    kindness: 8,
    distance: [0, 0],
    givers: [{ name: 'M. Diallo', sex: 'male' }, { name: 'M. Martin', sex: 'male' }, { name: 'Mme Benali', sex: 'female' }, { name: 'M. Nguyen', sex: 'male' }],
    baseLook: 5,
    ask: ['Salut voisin ! Mon étagère s’est effondrée…', 'Tu aurais une caisse à outils à me prêter ?'],
    steps: ['Va chercher ta caisse à outils chez toi.', 'Apporte la caisse à outils au voisin.'],
    thanks: ['Parfait, c’est exactement ce qu’il me fallait !', 'Je te la rends dès que j’ai fini. Merci !'],
  },
  wallet: {
    icon: '👛',
    title: 'Le portefeuille perdu',
    rewardCents: 30 * CENTS_PER_EURO,
    kindness: 5,
    distance: [8, 16],
    givers: [{ name: 'Sonia', sex: 'female' }, { name: 'Karim', sex: 'male' }, { name: 'Inès', sex: 'female' }, { name: 'Thomas', sex: 'male' }],
    baseLook: 2,
    ask: ['J’ai perdu mon portefeuille en marchant par là…', 'Tous mes papiers sont dedans. Tu peux m’aider à le chercher ?'],
    steps: ['Cherche le portefeuille dans la zone indiquée.', 'Rapporte le portefeuille à la personne qui l’a perdu.'],
    thanks: ['Mon portefeuille ! Tout est là, quel soulagement.', 'Prends ça, pour te remercier de ton honnêteté.'],
  },
};

/** Phrases quand on reparle au demandeur. */
export const ERRAND_LINES = {
  alreadyHelped: ['Encore merci pour tout à l’heure !'],
  dailyLimit: ['Tu as déjà beaucoup aidé aujourd’hui.', 'Repose-toi, et reviens demain : il y aura d’autres gens à aider !'],
  busy: ['Tu es déjà en train d’aider quelqu’un.', 'Finis d’abord, puis reviens me voir.'],
  noHome: ['Il te faut un logement pour avoir des outils…'],
  declined: ['Pas de souci, une autre fois peut-être.'],
} as const;
