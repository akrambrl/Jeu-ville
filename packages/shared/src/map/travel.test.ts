import { describe, expect, it } from 'vitest';
import { busDropOff, isTravelDestination } from './travel.js';
import { makeGrid } from './testGrid.js';
import type { DistrictMap } from './types.js';

describe('bus', () => {
  const grid = makeGrid(['PPPPP', 'RRRRR', 'PPPPP', 'GGGGG']);

  it("ne va qu'aux lieux connus ou chez soi", () => {
    const map: DistrictMap = { ...grid.map, pois: [{ kind: 'park', name: 'Square', x: 4, y: 3, entrance: { x: 4, y: 3 } }] };
    expect(isTravelDestination(map, { x: 4, y: 3 }, null)).toBe(true);
    expect(isTravelDestination(map, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true);
    expect(isTravelDestination(map, { x: 2, y: 2 }, null)).toBe(false);
  });

  it('dépose sur le trottoir, à côté de la chaussée la plus proche', () => {
    const drop = busDropOff(grid, { x: 2, y: 3 });
    expect(drop.curb).toEqual({ x: 2, y: 1 });
    expect(drop.door).toEqual({ x: 2, y: 2 });
  });
});
