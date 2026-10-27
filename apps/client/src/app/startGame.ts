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
    },
  });

  const hud = new Hud(
    ui,
    {
      onGoHome: () => homeDoor && view.requestMove(homeDoor),
      onGoTo: (point) => view.requestMove(point),
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
  link.onDisconnected(() => showFatal(ui, 'Déconnecté du serveur.', () => location.reload()));

  const loading = el('div', { class: 'loading', text: `Chargement de ${map.cityName}…` });
  ui.append(loading);
  view
    .build()
    .catch((err) => showFatal(ui, `Impossible d'afficher la ville : ${(err as Error).message}`, () => location.reload()))
    .finally(() => loading.remove());

  showTutorialOnce(ui, map.cityName);
}

const POI_INFO: Record<MapPoi['kind'], { icon: string; kind: string; order: number }> = {
  townhall: { icon: '🏛️', kind: 'Mairie', order: 0 },
  station: { icon: '🚉', kind: 'Gare RER E', order: 1 },
  tram: { icon: '🚋', kind: 'Arrêt de tram', order: 2 },
  police: { icon: '👮', kind: 'Police', order: 3 },
  pharmacy: { icon: '💊', kind: 'Pharmacie', order: 4 },
  supermarket: { icon: '🛒', kind: 'Grande surface', order: 5 },
  bakery: { icon: '🥖', kind: 'Boulangerie', order: 6 },
  fastfood: { icon: '🍔', kind: 'Restauration rapide', order: 7 },
  market: { icon: '🧺', kind: 'Marché', order: 8 },
  park: { icon: '🌳', kind: 'Square', order: 9 },
  worship: { icon: '⛪', kind: 'Lieu de culte', order: 10 },
  school: { icon: '🏫', kind: 'École', order: 11 },
  square: { icon: '⛲', kind: 'Place', order: 12 },
  gym: { icon: '🏟️', kind: 'Sport', order: 13 },
  quarter: { icon: '🏘️', kind: 'Quartier', order: 14 },
};

/** Lieux du quartier proposés dans « Aller à… ». */
function destinationsOf(map: DistrictMap): Destination[] {
  return [...map.pois]
    .sort((a, b) => POI_INFO[a.kind].order - POI_INFO[b.kind].order || a.name.localeCompare(b.name, 'fr'))
    .map((p) => ({ icon: POI_INFO[p.kind].icon, name: p.name, kind: POI_INFO[p.kind].kind, point: p.entrance }));
}
