/**
 * Cache-cache géant : tous les chiffres d'équilibrage du mode de jeu.
 * Durées en millisecondes réelles, distances en cases.
 */

export const HIDE_SEEK = {
  /** Quartier joué : un morceau de la carte OSM (coin haut-gauche + taille, en cases). */
  arena: {
    districtKey: 'noisy-le-sec:centre-ville-mairie',
    name: 'Centre-ville – Mairie',
    bounds: { x: 40, y: 54, width: 52, height: 48 },
    /** Point de départ de tout le monde (devant la mairie), en coordonnées de la carte d'origine. */
    start: { x: 65, y: 92 },
  },

  /** Déroulement d'une partie : 5 minutes au total. */
  phases: {
    /** Les cachés se cachent, les chercheurs ont les yeux fermés. */
    hidingMs: 60_000,
    /** Les chercheurs cherchent. */
    seekingMs: 240_000,
    /** Attente avant le début d'une partie (dès qu'un joueur est là). */
    lobbyMs: 15_000,
    /** Écran des résultats avant de revenir au salon. */
    resultsMs: 12_000,
  },

  /** Joueurs réels dans une room (au-delà, une autre partie s'ouvre). */
  maxPlayers: 16,

  roles: {
    /** Part des joueurs réels qui cherchent (arrondi), au moins 1 dès qu'il y a 2 joueurs. */
    seekerShare: 0.25,
    /** Nombre minimum de chercheurs : les bots complètent. */
    minSeekers: 2,
    /** Plafond de bots chercheurs. */
    maxBots: 4,
  },

  /** Distance max à une cachette pour y entrer. */
  enterRange: 1.6,
  /** Distance max à une cachette pour la fouiller. */
  searchRange: 2.2,
  /** Temps d'attente entre deux fouilles d'un même chercheur. */
  searchCooldownMs: 6_000,
  /** Portée de vue d'un chercheur (les bâtiments bloquent la vue). */
  sightRange: 7,
  /** Marge (cases) acceptée par le serveur quand on clique sur un caché qui vient de sortir de la vue. */
  tagTolerance: 0.75,
  /** Places dans une cachette. */
  spotCapacity: 1,

  hints: {
    /** Un indice sonore toutes les minutes de recherche. */
    everyMs: 60_000,
    /** Le son est émis à au plus tant de cases du caché (pas exactement sur lui). */
    maxOffset: 4,
    /** Rayon de la zone montrée aux chercheurs. */
    radius: 5,
    /** Durée d'affichage de l'indice. */
    visibleMs: 10_000,
  },

  /** Envoi des positions visibles (cachés à découvert) à chaque client. */
  sightSyncMs: 150,

  /** Cachettes générées depuis la carte : espacement minimal (cases) entre deux cachettes d'un même type. */
  spots: {
    trash: { spacing: 7, max: 22 },
    car: { spacing: 6, max: 16 },
    hall: { spacing: 4, max: 20 },
    stairwell: { spacing: 4, max: 14 },
    parking: { spacing: 10, max: 4 },
  },

  bots: {
    /** Vitesse des chercheurs bots, par rapport à la marche d'un joueur. */
    speedFactor: 0.9,
    /** Délai de réaction avant de « cliquer » sur un caché aperçu. */
    reactionMs: 1_200,
    /** Une cachette fouillée il y a moins de tant n'intéresse plus les bots. */
    researchAfterMs: 70_000,
    /** Après un indice, les bots visent les cachettes à moins de tant de cases. */
    hintFocusRadius: 9,
    /** Un indice reste intéressant pendant… */
    hintMemoryMs: 45_000,
    /** Les bots choisissent au hasard parmi les N meilleures cachettes (pour ne pas être prévisibles). */
    choiceAmong: 3,
    /** Nombre de cases max d'un trajet de bot. */
    maxPathLength: 160,
    /** Noms des chercheurs bots. */
    names: ['Inspecteur Momo', 'Agent Yasmine', 'Détective Kevin', 'Capitaine Inès', 'Sergent Bilal', 'Lieutenant Chloé'],
  },
} as const;

export type HidingSpotKind = keyof typeof HIDE_SEEK.spots;

/** Textes des cachettes (affichage). */
export const HIDING_SPOT_LABELS: Record<HidingSpotKind, { icon: string; name: string }> = {
  trash: { icon: '🗑️', name: 'Poubelle' },
  car: { icon: '🚗', name: 'Voiture garée' },
  hall: { icon: '🚪', name: "Hall d'immeuble" },
  stairwell: { icon: '🪜', name: "Cage d'escalier" },
  parking: { icon: '🅿️', name: 'Parking souterrain' },
};
