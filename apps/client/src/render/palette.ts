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
};

/** Couleur des bâtiments par code de case. */
export const BUILDING_COLORS: Record<string, number> = {
  [TILE.building]: 0xe8d3b0,
  [TILE.house]: 0xf1c9a5,
  [TILE.apartments]: 0xd9dde4,
  [TILE.commercial]: 0xf0b86e,
  [TILE.civic]: 0xb9d6f2,
  [TILE.industrial]: 0xb7aea3,
  [TILE.starter]: 0x7fcfc0,
};

export const ROOF_COLORS: Record<string, number> = {
  [TILE.house]: 0xc8664a,
};

export const WINDOW_COLOR = 0x4b5f7a;
export const BACKGROUND_COLOR = 0xa9c98e;
