import { describe, expect, it } from 'vitest';
import { ERRANDS, ERRAND_TYPES } from '../config/errands.js';
import { DEFAULT_DISTRICT_KEY, getDistrictMap } from '../map/registry.js';
import { MapGrid } from '../map/grid.js';
import { reachableTiles } from '../map/passersby.js';
import { REAL_MS_PER_HOUR } from '../time/index.js';
import { Errand, addKindness, dailyErrandOffers, kindnessAt, type ErrandOffer } from './errands.js';

const map = getDistrictMap(DEFAULT_DISTRICT_KEY)!;
const walkable = reachableTiles(new MapGrid(map), map.spawn);

describe('missions du quotidien', () => {
  it('les mêmes demandes pour tout le monde le même jour, d’autres le lendemain', () => {
    const today = dailyErrandOffers(map, walkable, '2026-10-28');
    expect(today).toHaveLength(ERRANDS.offersPerDistrict);
    expect(dailyErrandOffers(map, walkable, '2026-10-28')).toEqual(today);
    expect(dailyErrandOffers(map, walkable, '2026-10-29')).not.toEqual(today);
    // Chaque type est proposé, et deux demandeurs ne sont jamais sur la même case.
    expect(new Set(today.map((o) => o.type)).size).toBe(4);
    expect(new Set(today.map((o) => `${o.giver.x},${o.giver.y}`)).size).toBe(today.length);
  });

  it('chien perdu : trouver le chien, puis le ramener', () => {
    const offer: ErrandOffer = {
      id: 'j:0',
      type: 'lostDog',
      giver: { x: 0, y: 0, name: 'Kevin', sex: 'male', baseLook: 0, skinTone: 0, hairColor: 0 },
      spot: { x: 10, y: 0 },
    };
    const e = new Errand(offer, null, 0);
    const v = e.view(0);
    expect(v.kind === 'active' && v.target).toBeNull();
    expect(v.kind === 'active' && v.hidden).toEqual({ kind: 'dog', at: { x: 10, y: 0 } });
    expect(e.tick({ x: 5, y: 0 }, 1000)).toBeNull();
    expect(e.tick({ x: 10, y: 0 }, 2000)).toBeNull();
    const back = e.view(2000);
    expect(back.kind === 'active' && back.carry).toBe('dog');
    expect(back.kind === 'active' && back.target).toEqual({ x: 0, y: 0 });
    expect(e.tick({ x: 0, y: 1 }, 3000)).toBe('done');
  });

  it('trop tard : la mission échoue', () => {
    const offer: ErrandOffer = {
      id: 'j:1',
      type: 'groceries',
      giver: { x: 0, y: 0, name: 'Mamie Rose', sex: 'female', baseLook: 4, skinTone: 0, hairColor: 5 },
      spot: { x: 9, y: 9 },
    };
    const e = new Errand(offer, null, 0);
    expect(e.tick({ x: 0, y: 0 }, ERRANDS.timeLimitMs + 1)).toBe('failed');
  });

  it('outils : passer chez soi, puis chez le voisin', () => {
    const offer: ErrandOffer = { id: 'j:2', type: 'tools', giver: { x: 3, y: 3, name: 'M. Diallo', sex: 'male', baseLook: 5, skinTone: 1, hairColor: 0 }, spot: null };
    const e = new Errand(offer, { x: 20, y: 3 }, 0);
    expect(e.tick({ x: 3, y: 3 }, 10)).toBeNull();
    expect(e.tick({ x: 20, y: 3 }, 20)).toBeNull();
    expect(e.tick({ x: 3, y: 3 }, 30)).toBe('done');
    expect(ERRAND_TYPES.tools.rewardCents).toBeGreaterThan(0);
  });

  it('la bonté s’estompe et reste plafonnée', () => {
    const k = addKindness(0, 0, 0, 20);
    expect(k).toBe(20);
    expect(kindnessAt(k, 0, 24 * REAL_MS_PER_HOUR)).toBeLessThan(20);
    expect(addKindness(ERRANDS.kindness.max, 0, 0, 50)).toBe(ERRANDS.kindness.max);
  });
});
