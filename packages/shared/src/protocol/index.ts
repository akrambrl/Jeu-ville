/**
 * Contrat client ↔ serveur. Toute entrée client est validée avec ces schémas
 * côté serveur : le client envoie des INTENTIONS, jamais des résultats.
 */
import { z } from 'zod';
import { HOME_ACTIONS } from '../config/balance.js';
import { BASE_LOOKS, BODY_TYPES, HAIR_COLORS, PSEUDO_RULES, SEXES, SKIN_TONES } from '../config/characters.js';
import type { GaugeSnapshot } from '../formulas/gauges.js';
import type { HomeActionId } from '../formulas/homeActions.js';
import type { TilePoint } from '../map/types.js';

// Messages de validation en français.
z.config(z.locales.fr());

const indexOf = (list: readonly unknown[]) => z.number().int().min(0).max(list.length - 1);

// ---------- REST ----------

export const createSessionSchema = z.object({
  pseudo: z
    .string()
    .trim()
    .min(PSEUDO_RULES.minLength, `Ton pseudo doit faire au moins ${PSEUDO_RULES.minLength} caractères.`)
    .max(PSEUDO_RULES.maxLength, `Ton pseudo doit faire au plus ${PSEUDO_RULES.maxLength} caractères.`)
    .regex(PSEUDO_RULES.pattern, 'Lettres, chiffres, - et _ uniquement'),
});
export type CreateSessionRequest = z.infer<typeof createSessionSchema>;

export interface SessionResponse {
  token: string;
  playerId: string;
  pseudo: string;
}

export const createCharacterSchema = z.object({
  sex: z.enum(SEXES),
  baseLook: indexOf(BASE_LOOKS),
  skinTone: indexOf(SKIN_TONES),
  hairColor: indexOf(HAIR_COLORS),
  bodyType: indexOf(BODY_TYPES),
});
export type CreateCharacterRequest = z.infer<typeof createCharacterSchema>;

export interface CharacterLook {
  sex: (typeof SEXES)[number];
  baseLook: number;
  skinTone: number;
  hairColor: number;
  bodyType: number;
}

export interface HomeInfo {
  dwellingId: string;
  buildingName: string;
  door: TilePoint;
}

/** Vue privée d'un personnage, envoyée uniquement à son propriétaire. */
export interface CharacterSelf {
  id: string;
  name: string;
  look: CharacterLook;
  cityId: string;
  districtId: string;
  moneyCents: number;
  gauges: GaugeSnapshot;
  age: { years: number; dayOfYear: number };
  home: HomeInfo | null;
  /** Instant serveur du calcul (ms epoch). */
  computedAt: number;
}

export interface MeResponse {
  playerId: string;
  pseudo: string;
  character: CharacterSelf | null;
}

export interface ApiError {
  error: string;
}

// ---------- Temps réel (rooms Colyseus) ----------

export const ROOM_DISTRICT = 'district';

export const districtJoinSchema = z.object({
  token: z.string().min(1),
  districtId: z.string().min(1),
});
export type DistrictJoinOptions = z.infer<typeof districtJoinSchema>;

export const ClientMessage = {
  move: 'move',
  homeAction: 'homeAction',
  buyFood: 'buyFood',
} as const;

export const moveSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});
export type MoveMessage = z.infer<typeof moveSchema>;

export const HOME_ACTION_IDS = Object.keys(HOME_ACTIONS) as HomeActionId[];

export const homeActionSchema = z.object({
  action: z.enum(HOME_ACTION_IDS as [HomeActionId, ...HomeActionId[]]),
});
export type HomeActionMessage = z.infer<typeof homeActionSchema>;

/** Acheter `itemId` à l'endroit `placeId` (marchand, commerce) ; le serveur vérifie qu'on y est. */
export const buyFoodSchema = z.object({
  placeId: z.string().min(1).max(64),
  itemId: z.string().min(1).max(32),
});
export type BuyFoodMessage = z.infer<typeof buyFoodSchema>;

export const ServerMessage = {
  /** Vue privée du personnage (CharacterSelf). */
  self: 'self',
  /** Message d'information/erreur à afficher (Notice). */
  notice: 'notice',
} as const;

export interface Notice {
  level: 'info' | 'error';
  text: string;
}
