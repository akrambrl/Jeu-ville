import { describe, expect, it } from 'vitest';
import { advance, directionOf, type Mover } from './movement.js';

describe('advance', () => {
  it('avance partiellement vers la prochaine case', () => {
    const m: Mover = { x: 0, y: 0, dir: 0, path: [{ x: 1, y: 0 }] };
    advance(m, 0.5);
    expect(m.x).toBeCloseTo(0.5);
    expect(m.path).toHaveLength(1);
  });

  it('enchaîne plusieurs cases dans un même pas', () => {
    const m: Mover = { x: 0, y: 0, dir: 0, path: [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }] };
    advance(m, 2.5);
    expect(m.x).toBe(2);
    expect(m.y).toBeCloseTo(0.5);
    expect(m.path).toHaveLength(1);
    expect(m.dir).toBe(2);
  });

  it("s'arrête au bout du chemin", () => {
    const m: Mover = { x: 0, y: 0, dir: 0, path: [{ x: 1, y: 1 }] };
    advance(m, 10);
    expect(m).toMatchObject({ x: 1, y: 1, path: [] });
  });
});

describe('directionOf', () => {
  it('garde la direction précédente sans mouvement', () => {
    expect(directionOf(0, 0, 5)).toBe(5);
  });
  it('gère les 8 directions', () => {
    expect(directionOf(1, 0, 0)).toBe(0);
    expect(directionOf(1, 1, 0)).toBe(1);
    expect(directionOf(0, 1, 0)).toBe(2);
    expect(directionOf(-1, 0, 0)).toBe(4);
    expect(directionOf(0, -1, 0)).toBe(6);
  });
});
