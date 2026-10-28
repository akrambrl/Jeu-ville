import { describe, expect, it } from 'vitest';
import { TileOccupancy } from './occupancy.js';
import { reachableTiles, spawnPasserby, updatePasserby } from './passersby.js';
import { MapGrid } from './grid.js';
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

  it('un flâneur de rue commerçante reste sur ses trottoirs', () => {
    const rows = ['PPPPPPPPPPPPPPPPPPPP', 'PBBBBBBBBBBBBBBBBBBP', 'PPPPPPPPPPPPPPPPPPPP'];
    const sidewalks = Array.from({ length: 20 }, (_, x) => ({ x, y: 0 }));
    const g = new MapGrid({ ...makeGrid(rows).map, busyStreets: [{ name: 'Rue', sidewalks }] });
    const occ = new TileOccupancy();
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const b = spawnPasserby('a', occ, sidewalks, 0, rand, 0);
    for (let t = 0; t < 600; t++) {
      updatePasserby(g, occ, b, 100, t * 100, rand);
      expect(b.tile.y).toBe(0);
    }
  });
});
