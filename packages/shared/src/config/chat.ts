/** Chat général (tous les joueurs connectés au serveur) : limites et anti-flood. */
export const CHAT = {
  maxLength: 200,
  /** Messages gardés en mémoire et envoyés à qui se connecte. */
  historySize: 60,
  /** Délai minimum entre deux messages d'un même joueur (ms). */
  minIntervalMs: 1_500,
  /** Au plus `burstMessages` messages par fenêtre de `burstWindowMs`. */
  burstMessages: 5,
  burstWindowMs: 20_000,
  /** Joueurs qu'on peut bloquer au maximum. */
  maxBlocked: 200,
  /** Démo solo : un bot du quartier parle toutes les [min, max] ms. */
  demoBotEveryMs: [18_000, 40_000],
} as const;

/** Démo solo : ce que les bots du quartier écrivent dans le chat (marqués comme bots). */
export const DEMO_CHAT_LINES = [
  'Quelqu’un sait où acheter un vélo ?',
  'Le kebab du boulevard est trop bon 😋',
  'Je cherche une coloc près de la gare !',
  'Qui vient au square Jean Jaurès ?',
  'Bonne journée à tous 👋',
  'Le bus est passé avec 5 minutes de retard, encore 😅',
  'Je viens d’ouvrir mon snack, passez me voir !',
  'Il fait beau aujourd’hui à Noisy ☀️',
  'Quelqu’un a vu un chien perdu vers la mairie ?',
  'L’agence pour l’emploi cherche des livreurs, j’ai été pris !',
] as const;
