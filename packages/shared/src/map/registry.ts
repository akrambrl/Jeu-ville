/** Cartes de quartier disponibles (générées par `pnpm map:build`). */
import noisyCentre from '../../maps/noisy-le-sec--centre-ville-mairie.json';
import type { DistrictMap } from './types.js';

/** Identifiant global d'un quartier : `<ville>:<quartier>`. */
export function districtKey(map: Pick<DistrictMap, 'cityId' | 'districtId'>): string {
  return `${map.cityId}:${map.districtId}`;
}

const maps = [noisyCentre as DistrictMap];

export const DISTRICT_MAPS: Readonly<Record<string, DistrictMap>> = Object.fromEntries(
  maps.map((m) => [districtKey(m), m]),
);

/** Quartier où démarrent les nouveaux personnages (prototype : une seule ville). */
export const DEFAULT_DISTRICT_KEY = 'noisy-le-sec:centre-ville-mairie';

export function getDistrictMap(key: string): DistrictMap | undefined {
  return DISTRICT_MAPS[key];
}
