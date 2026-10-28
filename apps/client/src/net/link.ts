import type { Arrival, CharacterSelf, HomeActionId, Notice, TilePoint, VehicleKind } from '@jeu-ville/shared';

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
  /** Quelqu'un (soi compris) arrive en bus : jouer la cinématique. */
  onArrival(cb: (arrival: Arrival) => void): void;
  /** Les joueurs déjà présents sont annoncés immédiatement via `added`. */
  subscribePlayers(handlers: PlayerHandlers): void;
  onSelf(cb: (self: CharacterSelf) => void): void;
  onNotice(cb: (notice: Notice) => void): void;
  onDisconnected(cb: () => void): void;
}
