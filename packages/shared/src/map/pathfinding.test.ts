import { describe, expect, it } from 'vitest';
import { findPath } from './pathfinding.js';
import { makeGrid } from './testGrid.js';


describe('findPath', () => {
  it('trouve un chemin en ligne droite', () => {
    const grid = makeGrid(['RRRRR']);
    expect(findPath(grid, { x: 0, y: 0 }, { x: 4, y: 0 })).toHaveLength(4);
  });

  it('contourne un bâtiment', () => {
    const grid = makeGrid([
      'RRRRR', //
      'RBBBR',
      'RRRRR',
    ]);
    const path = findPath(grid, { x: 0, y: 1 }, { x: 4, y: 1 })!;
    expect(path).not.toBeNull();
    for (const p of path) expect(grid.isWalkable(p.x, p.y)).toBe(true);
    expect(path.at(-1)).toEqual({ x: 4, y: 1 });
  });

  it('ne coupe pas les coins', () => {
    const grid = makeGrid([
      'RB', //
      'BR',
    ]);
    expect(findPath(grid, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });

  it('renvoie null pour une cible non marchable', () => {
    const grid = makeGrid(['RB']);
    expect(findPath(grid, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });

  it('renvoie [] si on est déjà arrivé', () => {
    const grid = makeGrid(['R']);
    expect(findPath(grid, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([]);
  });

  it('respecte la longueur max', () => {
    const grid = makeGrid(['RRRRRRRRRR']);
    expect(findPath(grid, { x: 0, y: 0 }, { x: 9, y: 0 }, 3)).toBeNull();
  });
});
