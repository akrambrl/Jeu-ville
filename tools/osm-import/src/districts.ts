/** Quartiers à générer. bbox = [minLon, minLat, maxLon, maxLat]. */
export interface DistrictSource {
  cityId: string;
  cityName: string;
  districtId: string;
  districtName: string;
  bbox: [number, number, number, number];
}

export const DISTRICTS: DistrictSource[] = [
  {
    cityId: 'noisy-le-sec',
    cityName: 'Noisy-le-Sec',
    districtId: 'centre-ville-mairie',
    districtName: 'Centre-Ville - Mairie',
    // Emprise du quartier OSM « Centre-Ville - Mairie » (relation 12593925).
    bbox: [2.447, 48.887, 2.4611, 48.8934],
  },
];

export const osmFileName = (d: DistrictSource) => `${d.cityId}--${d.districtId}.osm`;
export const mapFileName = (d: DistrictSource) => `${d.cityId}--${d.districtId}.json`;
