import { TILE } from '@jeu-ville/shared';

/** Couleurs du sol par code de case. */
export const GROUND_COLORS: Record<string, number> = {
  [TILE.ground]: 0xcfd8a8,
  [TILE.grass]: 0x8cc66a,
  [TILE.pedestrian]: 0xe6dcc6,
  [TILE.road]: 0x6f7480,
  [TILE.majorRoad]: 0x5a5f6b,
  [TILE.water]: 0x5fb3e0,
  [TILE.rail]: 0x9c8a74,
  [TILE.yard]: 0xb9bec7,
  [TILE.platform]: 0xd4d0c8,
};

/** Couleur des bâtiments par code de case. */
export const BUILDING_COLORS: Record<string, number> = {
  [TILE.building]: 0xe8d3b0,
  [TILE.house]: 0xf1c9a5,
  [TILE.apartments]: 0xd9dde4,
  [TILE.commercial]: 0xf0b86e,
  [TILE.civic]: 0xf6e3b4,
  [TILE.townhall]: 0xf3e9d2,
  [TILE.worship]: 0xd9cdb4,
  [TILE.industrial]: 0xb7aea3,
  [TILE.starter]: 0x7fcfc0,
  [TILE.station]: 0xe7d8bf,
  [TILE.police]: 0xeef1f5,
  [TILE.supermarket]: 0xf1efe8,
};

export const ROOF_COLORS: Record<string, number> = {
  [TILE.house]: 0xc8664a,
  /** Toit en ardoise bleue, comme les mairies françaises. */
  [TILE.townhall]: 0x4a6a8c,
  [TILE.worship]: 0x5b6470,
};

export const WINDOW_COLOR = 0x4b5f7a;
export const BACKGROUND_COLOR = 0xa9c98e;
