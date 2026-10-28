import { describe, expect, it } from 'vitest';
import { PETS, VEHICLES } from '../config/balance.js';
import { REAL_MS_PER_HOUR } from '../time/index.js';
import { adoptPet, feedPet, isPetNeglected, petGauges, petHappinessBonus, walkPet } from './pets.js';
import { drainBattery, speedFactor } from './vehicles.js';

const H = REAL_MS_PER_HOUR;

describe('animaux', () => {
  const pet = adoptPet('dog', () => 0, 0);

  it('a faim avec le temps, même hors ligne', () => {
    expect(petGauges(pet, 12 * H).hunger).toBeCloseTo(100 - 12 * PETS.hungerDecayPerRealHour);
  });

  it('croquettes et promenade le remettent en forme', () => {
    expect(feedPet({ ...pet, hunger: 10 }, 0).hunger).toBe(10 + PETS.kibble.hunger);
    expect(walkPet({ ...pet, happiness: 50 }, 20, 0).happiness).toBe(50 + 20 * PETS.walkHappinessPerTile);
  });

  it('part au refuge seulement après des jours le ventre vide', () => {
    const emptyAfter = 100 / PETS.hungerDecayPerRealHour;
    expect(isPetNeglected(pet, (emptyAfter + PETS.neglectHours - 1) * H)).toBe(false);
    expect(isPetNeglected(pet, (emptyAfter + PETS.neglectHours + 1) * H)).toBe(true);
  });

  it('rend heureux, et le perdre attriste quelques jours', () => {
    expect(petHappinessBonus(pet, null, 0)).toBe(PETS.happinessBonus);
    expect(petHappinessBonus(null, 0, H)).toBe(PETS.lossPenalty);
    expect(petHappinessBonus(null, 0, (PETS.lossPenaltyHours + 1) * H)).toBe(0);
  });
});

describe('véhicules', () => {
  it('vont plus vite que la marche', () => {
    expect(speedFactor('')).toBe(1);
    expect(speedFactor('bike')).toBe(VEHICLES.bike.speedFactor);
  });

  it('seule la trottinette a une batterie', () => {
    expect(drainBattery({ kind: 'bike', battery: 100 }, 1000).battery).toBe(100);
    expect(drainBattery({ kind: 'scooter', battery: 10 }, 1000).battery).toBe(0);
  });
});
