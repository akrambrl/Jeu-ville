import { MOVEMENT, employers, foodPlaceInReach, foodPlaces, getDistrictMap, shopInReach, shopPlaces, type CharacterSelf, type DistrictMap, type MapPoi, type Religion } from '@jeu-ville/shared';
import { CityView } from '../world/CityView.js';
import type { DistrictLink } from '../net/link.js';
import { el } from '../ui/dom.js';
import { AgencySheet } from '../ui/agency.js';
import { JobCenterSheet, MissionPanel } from '../ui/jobs.js';
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
  const shops = shopPlaces(map);
  const agencyDoor = map.pois.find((p) => p.kind === 'realestate')?.entrance ?? null;
  const jobCenterDoor = map.pois.find((p) => p.kind === 'jobcenter')?.entrance ?? null;
  const allEmployers = employers(map);
  let inShift = false;
  const isNear = (p: { x: number; y: number } | null | undefined, x: number, y: number) =>
    !!p && Math.hypot(x - p.x, y - p.y) <= MOVEMENT.foodInteractionRange;
  let position = { x: 0, y: 0 };
  let current = character;
  const container = document.getElementById('game')!;
  const view = new CityView(container, {
    map,
    link,
    homeDoor,
    onLocalPosition: (x, y) => {
      const near = !!homeDoor && Math.hypot(x - homeDoor.x, y - homeDoor.y) <= MOVEMENT.homeInteractionRange;
      hud.setNearHome(near);
      hud.setNearFood(foodPlaceInReach(food, x, y));
      hud.setNearShop(shopInReach(shops, x, y));
      hud.setPosition(x, y);
      position = { x, y };
      hud.setNearAgency(isNear(agencyDoor, x, y));
      hud.setNearJobCenter(isNear(jobCenterDoor, x, y));
      const work = allEmployers.find((e) => e.id === current.job?.employerId);
      hud.setCanStartShift(!inShift && isNear(work?.door, x, y));
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
      onBuyItem: (placeId, itemId) => link.buyItem(placeId, itemId),
      onSetVehicle: (vehicle) => link.setVehicle(vehicle),
      onChargeScooter: () => link.chargeScooter(),
      onFeedPet: () => link.feedPet(),
      onOpenAgency: () => void agency.open(current, position),
      onOpenJobCenter: () => jobCenter.open(current, position),
      onStartShift: () => link.startShift(),
      onRecenter: () => view.recenter(),
    },
    destinationsOf(map),
  );
  hud.setSelf(character);

  const agency = new AgencySheet(map, {
    listings: () => link.requestListings(),
    buy: (id) => link.buyProperty(id),
    rent: (id) => link.rentProperty(id),
    moveIn: (id) => link.moveIn(id),
    release: (id) => link.releaseProperty(id),
    openBusiness: (id, type, name) => link.openBusiness(id, type, name),
    visit: (point) => view.requestMove(point),
  });
  ui.append(agency.root);
  const jobCenter = new JobCenterSheet(map, {
    apply: (id) => link.applyJob(id),
    quit: () => link.quitJob(),
    goTo: (point) => view.requestMove(point),
  });
  ui.append(jobCenter.root);
  const mission = new MissionPanel({
    goTo: (point) => view.requestMove(point),
    serve: (items) => link.serve(items),
    stop: () => link.stopShift(),
    showTarget: (point) => view.setMissionTarget(point),
  });
  ui.append(mission.root);
  link.onMission((m) => {
    inShift = m.kind !== 'done';
    mission.show(m);
    if (m.kind === 'done') hud.notify(`Service terminé : ${m.succeeded}/${m.total} missions réussies, +${m.earnedCents / 100} €.`);
  });

  link.onSelf((self) => {
    current = self;
    agency.update(self);
    jobCenter.update(self);
    homeDoor = self.home?.door ?? null;
    view.setHomeDoor(homeDoor);
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
  worship: '🛐 Lieux de culte',
  quarters: '🏘️ Quartiers',
  shops: '🛍️ Boutiques et agences',
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
  cycles: { icon: '🚲', kind: 'Vélos et trottinettes', category: 'shops' },
  petshop: { icon: '🐾', kind: 'Animaux de compagnie', category: 'shops' },
  realestate: { icon: '🔑', kind: 'Acheter ou louer', category: 'shops' },
  jobcenter: { icon: '💼', kind: 'Offres d’emploi', category: 'shops' },
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
      const worship = p.religion ? WORSHIP_INFO[p.religion] : null;
      return { icon: worship?.icon ?? info.icon, name: p.name, kind: worship?.kind ?? info.kind, category: CATEGORIES[info.category], point: p.entrance };
    });
}

/** Lieux de culte : icône et type selon la religion. */
const WORSHIP_INFO: Record<Religion, { icon: string; kind: string }> = {
  christian: { icon: '⛪', kind: 'Église' },
  muslim: { icon: '🕌', kind: 'Mosquée' },
  jewish: { icon: '🕍', kind: 'Synagogue' },
  buddhist: { icon: '☸️', kind: 'Temple bouddhiste' },
  other: { icon: '🛐', kind: 'Lieu de culte' },
};
