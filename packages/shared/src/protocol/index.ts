/**
 * Contrat client ↔ serveur. Toute entrée client est validée avec ces schémas
 * côté serveur : le client envoie des INTENTIONS, jamais des résultats.
 */
import { z } from 'zod';
import { CARD_GAME } from '../config/cards.js';
import { PSEUDO_RULES } from '../config/players.js';
import { containsBannedWord } from '../formulas/moderation.js';
import { CATEGORY_IDS, type CategoryId } from '../cards/categories.js';

// Messages de validation en français.
z.config(z.locales.fr());

// ---------- REST ----------

export const createSessionSchema = z.object({
  pseudo: z
    .string()
    .trim()
    .min(PSEUDO_RULES.minLength, `Ton pseudo doit faire au moins ${PSEUDO_RULES.minLength} caractères.`)
    .max(PSEUDO_RULES.maxLength, `Ton pseudo doit faire au plus ${PSEUDO_RULES.maxLength} caractères.`)
    .regex(PSEUDO_RULES.pattern, 'Lettres, chiffres, - et _ uniquement')
    .refine((p) => !containsBannedWord(p), 'Ce pseudo n’est pas autorisé : choisis-en un autre.'),
});
export type CreateSessionRequest = z.infer<typeof createSessionSchema>;

export interface SessionResponse {
  token: string;
  playerId: string;
  pseudo: string;
}

export interface MeResponse {
  playerId: string;
  pseudo: string;
}

export interface ApiError {
  error: string;
}

/** Plantage signalé par un joueur (message et pile d'appels, sans donnée personnelle). */
export const clientErrorSchema = z.object({
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
  where: z.string().max(200).optional(),
  version: z.string().max(40).optional(),
});
export type ClientErrorReport = z.infer<typeof clientErrorSchema>;

// ---------- Temps réel : une room = une table ----------

export const ROOM_CARDS = 'cards';

export const cardsJoinSchema = z.object({
  token: z.string().min(1),
  /** Créer une table privée (on y entre avec son code, partagé entre amis). */
  private: z.boolean().optional(),
});
export type CardsJoinOptions = z.infer<typeof cardsJoinSchema>;

export const CardClientMessage = {
  /** Pendant un duel : un mot dans une des deux catégories de sa carte. */
  answer: 'answer',
} as const;

export const answerSchema = z.object({
  /** Absente : le mot vaut dans n'importe quelle catégorie commune du duel. */
  category: z.enum(CATEGORY_IDS as [CategoryId, ...CategoryId[]]).nullable().default(null),
  text: z.string().max(CARD_GAME.answer.maxLength),
});
export type AnswerMessage = z.infer<typeof answerSchema>;

export const CardServerMessage = {
  /** État visible de la table (GameView), à chaque changement. */
  view: 'view',
  /** Événement de la partie (GameEvent), pour les animations. */
  event: 'event',
  /** Message d'information/erreur pour ce joueur (Notice). */
  notice: 'notice',
} as const;

export interface Notice {
  level: 'info' | 'error';
  text: string;
}
