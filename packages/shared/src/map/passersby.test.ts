import { describe, expect, it } from 'vitest';
import { TileOccupancy } from './occupancy.js';
import { reachableTiles, spawnPasserby } from './passersby.js';
import { makeGrid } from './testGrid.js';

describe('passants', () => {
  const grid = makeGrid(['PPPB', 'PBPB', 'PPPB']);

  it('ne considère que les cases reliées entre elles', () => {
    expect(reachableTiles(grid, { x: 0, y: 0 })).toHaveLength(8);
  });

  it('chaque passant apparaît sur sa propre case', () => {
    const occ = new TileOccupancy();
    const tiles = reachableTiles(grid, { x: 0, y: 0 });
    const a = spawnPasserby('a', occ, tiles, 0, () => 0);
    const b = spawnPasserby('b', occ, tiles, 0, () => 0.0001);
    expect(a.tile).not.toEqual(b.tile);
    expect(occ.isFree(a.tile.x, a.tile.y, 'b')).toBe(false);
  });
});
