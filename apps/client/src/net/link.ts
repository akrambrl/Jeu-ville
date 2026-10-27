import type { CharacterSelf, HomeActionId, Notice, TilePoint } from '@jeu-ville/shared';

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
  /** Acheter à manger au marchand ambulant `vendorId` (il faut être à côté). */
  buyStreetFood(vendorId: string): void;
  /** Les joueurs déjà présents sont annoncés immédiatement via `added`. */
  subscribePlayers(handlers: PlayerHandlers): void;
  onSelf(cb: (self: CharacterSelf) => void): void;
  onNotice(cb: (notice: Notice) => void): void;
  onDisconnected(cb: () => void): void;
}
