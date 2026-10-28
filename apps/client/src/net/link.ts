import type { Arrival, ErrandView, BusinessType, CharacterSelf, HomeActionId, MissionView, Notice, TilePoint, VehicleKind } from '@jeu-ville/shared';

/** Ce que tous les joueurs voient d'un personnage (voir apps/server/src/rooms/state.ts). */
export interface PlayerView {
  id: string;
  name: string;
  x: number;
  y: number;
  dir: number;
  moving: boolean;
  sex: string;
  baseLook: number;
  skinTone: number;
  hairColor: number;
  bodyType: number;
  /** Animal qui suit le perso (« dog:2 »), ou '' (voir Passerby.pet). */
  pet: string;
  /** Véhicule utilisé (« bike », « scooter ») ou ''. */
  vehicle: string;
}

export interface BusinessView {
  type: string;
  name: string;
}

export interface BusinessHandlers {
  opened: (spotId: string, b: BusinessView) => void;
  closed: (spotId: string) => void;
}

export interface PlayerHandlers {
  added: (id: string, p: PlayerView) => void;
  changed: (id: string, p: PlayerView) => void;
  removed: (id: string) => void;
}

/**
 * Lien entre l'affichage et la simulation du quartier : le serveur (Colyseus)
 * en jeu normal, ou une simulation locale pour la démo solo.
 */
export interface DistrictLink {
  /** Identifiant du joueur local parmi les joueurs du quartier. */
  readonly sessionId: string;
  move(to: TilePoint): void;
  homeAction(action: HomeActionId): void;
  /** Acheter `itemId` à l'endroit `placeId` (marchand, commerce) : il faut y être. */
  buyFood(placeId: string, itemId: string): void;
  /** Prendre le bus (payant) jusqu'à l'entrée d'un lieu, ou chez soi. */
  rideBus(to: TilePoint): void;
  /** Acheter dans une boutique (vélo, trottinette, adopter un animal) : il faut être devant. */
  buyItem(placeId: string, itemId: string): void;
  /** Monter sur un de ses véhicules, ou descendre (''). */
  setVehicle(vehicle: VehicleKind | ''): void;
  /** Recharger la trottinette (chez soi). */
  chargeScooter(): void;
  /** Donner des croquettes à son animal. */
  feedPet(): void;
  /** On parle à un passant : il s'arrête et se tourne vers nous. */
  talk(botId: string): void;
  /** Agence immobilière : biens déjà pris par des joueurs (PropertySpot.id). */
  requestListings(): Promise<string[]>;
  buyProperty(spotId: string): void;
  rentProperty(spotId: string): void;
  moveIn(spotId: string): void;
  /** Rendre un bien loué, ou le revendre à l'agence. */
  releaseProperty(spotId: string): void;
  openBusiness(spotId: string, type: BusinessType, name: string): void;
  /** Enseignes des commerces de joueurs (ajout, changement, fermeture). */
  subscribeBusinesses(handlers: BusinessHandlers): void;
  /** Agence pour l'emploi et services. */
  applyJob(employerId: string): void;
  quitJob(): void;
  startShift(): void;
  stopShift(): void;
  serve(items: string[]): void;
  onMission(cb: (mission: MissionView) => void): void;
  /** Missions du quotidien : aider un habitant (il faut être à côté de lui). */
  acceptErrand(offerId: string): void;
  abandonErrand(): void;
  onErrand(cb: (errand: ErrandView) => void): void;
  /** Quelqu'un (soi compris) arrive en bus : jouer la cinématique. */
  onArrival(cb: (arrival: Arrival) => void): void;
  /** Les joueurs déjà présents sont annoncés immédiatement via `added`. */
  subscribePlayers(handlers: PlayerHandlers): void;
  onSelf(cb: (self: CharacterSelf) => void): void;
  onNotice(cb: (notice: Notice) => void): void;
  onDisconnected(cb: () => void): void;
}
