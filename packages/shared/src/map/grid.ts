import { BUILDING_TILES, WALKABLE_TILES, type DistrictMap, type TilePoint } from './types.js';

/** Accès rapide aux cases d'une carte de quartier. */
export class MapGrid {
  readonly width: number;
  readonly height: number;
  private readonly walkable: Uint8Array;

  constructor(readonly map: DistrictMap) {
    this.width = map.width;
    this.height = map.height;
    this.walkable = new Uint8Array(this.width * this.height);
    for (let y = 0; y < this.height; y++) {
      const row = map.tiles[y] ?? '';
      for (let x = 0; x < this.width; x++) {
        this.walkable[y * this.width + x] = WALKABLE_TILES.has(row[x] ?? '') ? 1 : 0;
      }
    }
  }

  inBounds(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  tileAt(x: number, y: number): string {
    return this.map.tiles[y]?.[x] ?? '';
  }

  decorAt(x: number, y: number): string {
    return this.map.decor[y]?.[x] ?? '.';
  }

  shapeAt(x: number, y: number): string {
    return this.map.shapes[y]?.[x] ?? '.';
  }

  levelsAt(x: number, y: number): number {
    return Number(this.map.levels[y]?.[x] ?? '0');
  }

  isWalkable(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.walkable[y * this.width + x] === 1;
  }

  isBuilding(x: number, y: number): boolean {
    return BUILDING_TILES.has(this.tileAt(x, y));
  }

  /** Case marchable la plus proche (recherche en spirale), ou null. */
  nearestWalkable(p: TilePoint, maxRadius = 20): TilePoint | null {
    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
    if (this.isWalkable(cx, cy)) return { x: cx, y: cy };
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.isWalkable(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
        }
      }
    }
    return null;
  }
}
