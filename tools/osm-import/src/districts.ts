/** Quartiers à générer. bbox = [minLon, minLat, maxLon, maxLat]. */
export interface DistrictSource {
  cityId: string;
  cityName: string;
  districtId: string;
  districtName: string;
  bbox: [number, number, number, number];
  /** Noms affichés à la place des noms OSM (ex. quartier → nom d'usage). */
  renames?: Record<string, string>;
  /** Cités (grands ensembles) : leurs îlots sont bâtis en barres et en tours. bbox comme ci-dessus. */
  estates?: { name: string; bbox: [number, number, number, number] }[];
  /** Adresse (rue) imposée pour des lieux OSM, par nom OSM : quand la rue la plus proche n'est pas la bonne. */
  addresses?: Record<string, string>;
  /** Rues commerçantes (noms OSM) : boutiques en rez-de-chaussée et foule de passants. */
  highStreets?: string[];
}

export const DISTRICTS: DistrictSource[] = [
  {
    cityId: 'noisy-le-sec',
    cityName: 'Noisy-le-Sec',
    districtId: 'centre-ville-mairie',
    districtName: 'Centre-Ville - Mairie',
    // Quartier OSM « Centre-Ville - Mairie » (relation 12593925), étendu au nord
    // jusqu'à la gare RER E et au terminus du tram T1, à l'ouest jusqu'à la rue
    // du Parc et au sud-est jusqu'à la cité du Londeau.
    bbox: [2.443, 48.883, 2.471, 48.899],
    renames: { Londeau: 'Cité du Londeau' },
    // Limites OSM du quartier Londeau (relation 12593930).
    estates: [{ name: 'Cité du Londeau', bbox: [2.4648, 48.8838, 2.4703, 48.8873] }],
    // Boucheries, restaurants, fast-foods, taxiphones… et beaucoup de monde.
    highStreets: ['Boulevard de la République'],
    // À l'angle du boulevard Gambetta, mais c'est « le Carrefour de la rue Jean-Jaurès ».
    addresses: { 'Carrefour Market': 'Rue Jean Jaurès' },
  },
];

export const osmFileName = (d: DistrictSource) => `${d.cityId}--${d.districtId}.osm`;
export const mapFileName = (d: DistrictSource) => `${d.cityId}--${d.districtId}.json`;
