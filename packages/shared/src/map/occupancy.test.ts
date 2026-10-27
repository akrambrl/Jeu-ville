import { describe, expect, it } from 'vitest';
import { MOVEMENT } from '../config/balance.js';
import { TileOccupancy, advanceAvoiding, nearestFreeTile, stepWalker, type Walker } from './occupancy.js';
import { makeGrid } from './testGrid.js';

const walker = (id: string, x: number, y: number, path: { x: number; y: number }[] = []): Walker => ({
  id,
  x,
  y,
  dir: 0,
  path,
  tile: { x, y },
  blockedMs: 0,
});

describe('TileOccupancy', () => {
  it('une case ne peut être tenue que par une personne', () => {
    const occ = new TileOccupancy();
    expect(occ.tryHold('a', 1, 1)).toBe(true);
    expect(occ.tryHold('b', 1, 1)).toBe(false);
    expect(occ.isFree(1, 1, 'a')).toBe(true);
    occ.releaseAll('a');
    expect(occ.tryHold('b', 1, 1)).toBe(true);
  });

  it('les stands des marchands sont toujours occupés', () => {
    const occ = new TileOccupancy();
    occ.block(2, 2);
    expect(occ.tryHold('a', 2, 2)).toBe(false);
  });
});

describe('advanceAvoiding', () => {
  it("attend devant une case occupée sans y entrer", () => {
    const occ = new TileOccupancy();
    const a = walker('a', 0, 0, [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    occ.tryHold('a', 0, 0);
    occ.tryHold('b', 1, 0);
    expect(advanceAvoiding(a, 1, occ)).toBe(true);
    expect(a).toMatchObject({ x: 0, y: 0, tile: { x: 0, y: 0 } });
  });

  it('libère la case quittée et tient la nouvelle', () => {
    const occ = new TileOccupancy();
    const a = walker('a', 0, 0, [{ x: 1, y: 0 }]);
    occ.tryHold('a', 0, 0);
    expect(advanceAvoiding(a, 1, occ)).toBe(false);
    expect(a.tile).toEqual({ x: 1, y: 0 });
    expect(occ.isFree(0, 0, 'b')).toBe(true);
    expect(occ.isFree(1, 0, 'b')).toBe(false);
  });
});

describe('stepWalker', () => {
  it('contourne quelqu’un qui ne bouge pas', () => {
    const grid = makeGrid(['RRRRR', 'RRRRR']);
    const occ = new TileOccupancy();
    const a = walker('a', 0, 0, [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]);
    occ.tryHold('a', 0, 0);
    occ.tryHold('b', 1, 0);
    for (let t = 0; t < 40; t++) stepWalker(grid, occ, a, 0.4, 100);
    expect(a.tile).toEqual({ x: 3, y: 0 });
    expect(occ.isFree(1, 0, 'a')).toBe(false);
  });

  it('abandonne quand le passage reste bouché', () => {
    const grid = makeGrid(['RRR']);
    const occ = new TileOccupancy();
    const a = walker('a', 0, 0, [{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    occ.tryHold('a', 0, 0);
    occ.tryHold('b', 1, 0);
    for (let t = 0; t <= MOVEMENT.blockedGiveUpMs / 100; t++) stepWalker(grid, occ, a, 0.4, 100);
    expect(a.path).toEqual([]);
    expect(a.tile).toEqual({ x: 0, y: 0 });
  });
});

describe('nearestFreeTile', () => {
  it('propose la case libre la plus proche', () => {
    const grid = makeGrid(['RRR']);
    const occ = new TileOccupancy();
    occ.tryHold('b', 1, 0);
    const p = nearestFreeTile(grid, occ, { x: 1, y: 0 }, 'a');
    expect(p && Math.abs(p.x - 1)).toBe(1);
  });
});
