import { MOVEMENT, foodPlaceInReach, foodPlaces, getDistrictMap, type CharacterSelf, type DistrictMap, type MapPoi } from '@jeu-ville/shared';
import { CityView } from '../world/CityView.js';
import type { DistrictLink } from '../net/link.js';
import { el } from '../ui/dom.js';
import { Hud, type Destination } from '../ui/hud.js';
import { showTutorialOnce } from '../ui/tutorial.js';

export function showFatal(ui: HTMLElement, message: string, retry: () => void): void {
  const button = el('button', { class: 'primary', text: 'Réessayer' });
  const overlay = el('div', { class: 'overlay' }, [
    el('div', { class: 'card' }, [el('h1', { text: 'Oups' }), el('p', { text: message }), el('div', { class: 'actions' }, [button])]),
  ]);
  button.addEventListener('click', () => {
    overlay.remove();
    retry();
  });
  ui.append(overlay);
}

/** Lance la ville pour un personnage, quel que soit le lien (serveur ou démo locale). */
export function startGame(ui: HTMLElement, character: CharacterSelf, link: DistrictLink): void {
  const map = getDistrictMap(character.districtId);
  if (!map) return showFatal(ui, 'Quartier inconnu.', () => location.reload());

  let homeDoor = character.home?.door ?? null;
  const food = foodPlaces(map);
  const container = document.getElementById('game')!;
  const view = new CityView(container, {
    map,
    link,
    homeDoor,
    onLocalPosition: (x, y) => {
      const near = !!homeDoor && Math.hypot(x - homeDoor.x, y - homeDoor.y) <= MOVEMENT.homeInteractionRange;
      hud.setNearHome(near);
      hud.setNearFood(foodPlaceInReach(food, x, y));
      hud.setPosition(x, y);
    },
  });

  const hud = new Hud(
    ui,
    {
      onGoHome: () => homeDoor && view.requestMove(homeDoor),
      onGoTo: (point) => view.requestMove(point),
      onBusTo: (point) => link.rideBus(point),
      onHomeAction: (action) => link.homeAction(action),
      onBuyFood: (placeId, itemId) => link.buyFood(placeId, itemId),
      onRecenter: () => view.recenter(),
    },
    destinationsOf(map),
  );
  hud.setSelf(character);

  link.onSelf((self) => {
    homeDoor = self.home?.door ?? null;
    hud.setSelf(self);
  });
  link.onNotice((n) => hud.notify(n.text, n.level));
  link.onArrival((a) => view.playArrival(a));
  link.onDisconnected(() => showFatal(ui, 'Déconnecté du serveur.', () => location.reload()));

  const loading = el('div', { class: 'loading', text: `Chargement de ${map.cityName}…` });
  ui.append(loading);
  view
    .build()
    .catch((err) => showFatal(ui, `Impossible d'afficher la ville : ${(err as Error).message}`, () => location.reload()))
    .finally(() => loading.remove());

  showTutorialOnce(ui, map.cityName);
}

/** Catégories de « Aller à… », dans l'ordre d'affichage. */
const CATEGORIES = {
  transport: '🚉 Transports',
  food: '🍽️ Manger et courses',
  services: '🏛️ Services publics et santé',
  schools: '🏫 Écoles et sport',
  outdoor: '🌳 Parcs et places',
  worship: '⛪ Lieux de culte',
  quarters: '🏘️ Quartiers',
} as const;

const POI_INFO: Record<MapPoi['kind'], { icon: string; kind: string; category: keyof typeof CATEGORIES }> = {
  station: { icon: '🚉', kind: 'Gare RER E', category: 'transport' },
  tram: { icon: '🚋', kind: 'Arrêt de tram', category: 'transport' },
  bakery: { icon: '🥖', kind: 'Boulangerie', category: 'food' },
  fastfood: { icon: '🍔', kind: 'Restauration rapide', category: 'food' },
  supermarket: { icon: '🛒', kind: 'Grande surface', category: 'food' },
  market: { icon: '🧺', kind: 'Marché', category: 'food' },
  townhall: { icon: '🏛️', kind: 'Mairie', category: 'services' },
  police: { icon: '👮', kind: 'Police', category: 'services' },
  pharmacy: { icon: '💊', kind: 'Pharmacie', category: 'services' },
  school: { icon: '🏫', kind: 'École', category: 'schools' },
  gym: { icon: '🏟️', kind: 'Sport', category: 'schools' },
  park: { icon: '🌳', kind: 'Square', category: 'outdoor' },
  square: { icon: '⛲', kind: 'Place', category: 'outdoor' },
  worship: { icon: '⛪', kind: 'Lieu de culte', category: 'worship' },
  quarter: { icon: '🏘️', kind: 'Quartier', category: 'quarters' },
};

/** Lieux du quartier proposés dans « Aller à… ». */
function destinationsOf(map: DistrictMap): Destination[] {
  const order = Object.keys(CATEGORIES);
  return [...map.pois]
    .sort(
      (a, b) =>
        order.indexOf(POI_INFO[a.kind].category) - order.indexOf(POI_INFO[b.kind].category) || a.name.localeCompare(b.name, 'fr'),
    )
    .map((p) => {
      const info = POI_INFO[p.kind];
      return { icon: info.icon, name: p.name, kind: info.kind, category: CATEGORIES[info.category], point: p.entrance };
    });
}
