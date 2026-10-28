/**
 * Contrat client ↔ serveur. Toute entrée client est validée avec ces schémas
 * côté serveur : le client envoie des INTENTIONS, jamais des résultats.
 */
import { z } from 'zod';
import { HOME_ACTIONS } from '../config/balance.js';
import { BASE_LOOKS, BODY_TYPES, HAIR_COLORS, PSEUDO_RULES, SEXES, SKIN_TONES } from '../config/characters.js';
import type { GaugeSnapshot } from '../formulas/gauges.js';
import type { HomeActionId } from '../formulas/homeActions.js';
import type { StoredPet } from '../formulas/pets.js';
import type { OwnedVehicle, VehicleKind } from '../formulas/vehicles.js';
import { BUSINESS_TYPES, VEHICLES } from '../config/balance.js';
import type { BusinessType } from '../formulas/realEstate.js';
import type { JobType } from '../formulas/jobs.js';
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
  /** Appart de départ (`<quartier>:<bâtiment>:<n°>`) ou bien de l'agence (`<quartier>:<id du bien>`). */
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
  vehicles: OwnedVehicle[];
  /** Véhicule utilisé en ce moment ('' = à pied). */
  activeVehicle: VehicleKind | '';
  pet: StoredPet | null;
  /** Bonus (ou malus) de bonheur hors jauges : logement, animal, chagrin… */
  happinessBonus: number;
  /** Biens achetés ou loués via l'agence immobilière. */
  properties: OwnedProperty[];
  /** Dernier déménagement (ms), pour la règle « une fois toutes les deux semaines ». */
  movedAt: number | null;
  /** Emploi actuel (agence pour l'emploi). */
  job: { employerId: string; employerName: string; jobType: JobType } | null;
  /** Expérience par métier. */
  jobXp: Partial<Record<JobType, number>>;
  /** Instant serveur du calcul (ms epoch). */
  computedAt: number;
}

export interface OwnedProperty {
  /** Identifiant du bien sur la carte (PropertySpot.id). */
  spotId: string;
  relation: 'owner' | 'tenant';
  business: { type: BusinessType; name: string } | null;
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
  rideBus: 'rideBus',
  buyItem: 'buyItem',
  setVehicle: 'setVehicle',
  chargeScooter: 'chargeScooter',
  feedPet: 'feedPet',
  /** Demander à l'agence quels biens sont déjà pris (réponse : ServerMessage.listings). */
  listings: 'listings',
  buyProperty: 'buyProperty',
  rentProperty: 'rentProperty',
  moveIn: 'moveIn',
  /** Rendre un bien loué, ou revendre un bien acheté à l'agence. */
  releaseProperty: 'releaseProperty',
  openBusiness: 'openBusiness',
  applyJob: 'applyJob',
  quitJob: 'quitJob',
  /** Commencer / arrêter un service (devant son employeur). */
  startShift: 'startShift',
  stopShift: 'stopShift',
  /** Comptoir : servir ces articles au client actuel. */
  serve: 'serve',
  /** Parler à un passant (bot) : il s'arrête et se tourne vers le joueur. */
  talk: 'talk',
} as const;

export const talkSchema = z.object({
  botId: z.string().min(1).max(32),
});
export type TalkMessage = z.infer<typeof talkSchema>;

export const applyJobSchema = z.object({
  employerId: z.string().min(1).max(64),
});
export type ApplyJobMessage = z.infer<typeof applyJobSchema>;

export const serveSchema = z.object({
  items: z.array(z.string().min(1).max(16)).max(8),
});
export type ServeMessage = z.infer<typeof serveSchema>;

/** Acheter ou louer un bien ; `requestId` rend le clic idempotent (double clic, réseau). */
export const propertyDealSchema = z.object({
  spotId: z.string().min(1).max(64),
  requestId: z.string().uuid(),
});
export type PropertyDealMessage = z.infer<typeof propertyDealSchema>;

export const propertySchema = z.object({
  spotId: z.string().min(1).max(64),
});
export type PropertyMessage = z.infer<typeof propertySchema>;

const BUSINESS_TYPE_IDS = Object.keys(BUSINESS_TYPES) as BusinessType[];

/** Nom de commerce affiché sur l'enseigne : visible de tous, donc très encadré. */
export const BUSINESS_NAME_RULES = { minLength: 3, maxLength: 18, pattern: /^[\p{L}\p{N}' &-]+$/u } as const;

export const openBusinessSchema = z.object({
  spotId: z.string().min(1).max(64),
  type: z.enum(BUSINESS_TYPE_IDS as [BusinessType, ...BusinessType[]]),
  name: z
    .string()
    .trim()
    .min(BUSINESS_NAME_RULES.minLength, `Le nom doit faire au moins ${BUSINESS_NAME_RULES.minLength} caractères.`)
    .max(BUSINESS_NAME_RULES.maxLength, `Le nom doit faire au plus ${BUSINESS_NAME_RULES.maxLength} caractères.`)
    .regex(BUSINESS_NAME_RULES.pattern, 'Lettres, chiffres, espaces, apostrophes, & et - uniquement'),
});
export type OpenBusinessMessage = z.infer<typeof openBusinessSchema>;

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

/** Prendre le bus jusqu'à l'entrée d'un lieu du quartier (ou chez soi). */
export const rideBusSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});
export type RideBusMessage = z.infer<typeof rideBusSchema>;

/** Acheter `itemId` dans une boutique (cycles, animalerie) ; il faut être devant. */
export const buyItemSchema = z.object({
  placeId: z.string().min(1).max(64),
  itemId: z.string().min(1).max(32),
});
export type BuyItemMessage = z.infer<typeof buyItemSchema>;

const VEHICLE_KINDS = Object.keys(VEHICLES) as VehicleKind[];

/** Monter sur un de ses véhicules, ou descendre (''). */
export const setVehicleSchema = z.object({
  vehicle: z.enum(['', ...VEHICLE_KINDS] as ['', ...VehicleKind[]]),
});
export type SetVehicleMessage = z.infer<typeof setVehicleSchema>;

export const ServerMessage = {
  /** Vue privée du personnage (CharacterSelf). */
  self: 'self',
  /** Message d'information/erreur à afficher (Notice). */
  notice: 'notice',
  /** Un joueur arrive quelque part en bus (Arrival), pour la cinématique. */
  arrival: 'arrival',
  /** Biens déjà pris (Listings), en réponse à ClientMessage.listings. */
  listings: 'listings',
  /** Mission en cours pendant un service (MissionView). */
  mission: 'mission',
} as const;

/** Ce que le joueur voit de sa mission ; c'est le serveur qui vérifie et qui paie. */
export type MissionView =
  | { kind: 'courier'; index: number; total: number; target: TilePoint; address: string; remainingMs: number; earnedCents: number }
  | { kind: 'counter'; index: number; total: number; order: string[]; remainingMs: number; earnedCents: number }
  | { kind: 'done'; earnedCents: number; succeeded: number; total: number };

export interface Listings {
  /** Biens achetés ou loués par des joueurs (PropertySpot.id). */
  taken: string[];
}

export interface Arrival {
  /** Identifiant du joueur dans le quartier (sessionId). */
  playerId: string;
  via: 'bus';
  /** Case où il se retrouve. */
  at: TilePoint;
  /** Chaussée où le bus s'arrête et d'où il descend. */
  curb: TilePoint;
}

export interface Notice {
  level: 'info' | 'error';
  text: string;
}
