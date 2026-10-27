import { describe, expect, it } from 'vitest';
import { assembleRings, fillRings, strokeLine } from './raster.js';

describe('fillRings', () => {
  it('remplit un carré', () => {
    const cells: string[] = [];
    const square = [
      { x: 1, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 4 },
      { x: 1, y: 4 },
    ];
    fillRings([square], 10, 10, (x, y) => cells.push(`${x},${y}`));
    expect(cells).toHaveLength(9);
    expect(cells).toContain('1,1');
    expect(cells).toContain('3,3');
  });

  it('respecte les trous', () => {
    let n = 0;
    const outer = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ];
    const hole = [
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
    ];
    fillRings([outer, hole], 10, 10, () => n++);
    expect(n).toBe(24);
  });
});

describe('strokeLine', () => {
  it('trace une ligne diagonale connexe en 4 directions', () => {
    const set = new Set<string>();
    strokeLine(
      [
        { x: 0.5, y: 0.5 },
        { x: 8.5, y: 8.5 },
      ],
      1,
      10,
      10,
      (x, y) => set.add(`${x},${y}`),
    );
    for (let i = 0; i < 8; i++) {
      expect(set.has(`${i + 1},${i}`) || set.has(`${i},${i + 1}`)).toBe(true);
    }
  });
});

describe('assembleRings', () => {
  it('relie des morceaux, même inversés', () => {
    const rings = assembleRings([
      ['a', 'b', 'c'],
      ['a', 'd', 'c'],
    ]);
    expect(rings).toEqual([['a', 'b', 'c', 'd', 'a']]);
  });
});
