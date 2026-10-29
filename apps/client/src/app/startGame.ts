import { BUSINESS_FOOD, businessFoodPlaces, type FoodPlace, ERRAND_TYPES, MapGrid, MOVEMENT, dailyErrandOffers, realDayKey, reachableTiles, type ErrandOffer, type ErrandView, employers, foodPlaceInReach, foodPlaces, getDistrictMap, shopInReach, shopPlaces, type CharacterSelf, type DistrictMap, type MapPoi, type Religion, weeklyRentCents } from '@jeu-ville/shared';
import { CityView } from '../world/CityView.js';
import type { DistrictLink } from '../net/link.js';
import { el, formatMoney } from '../ui/dom.js';
import { AgencySheet } from '../ui/agency.js';
import { JobCenterSheet, MissionPanel } from '../ui/jobs.js';
import { Hud, type Destination } from '../ui/hud.js';
import { showTutorialOnce } from '../ui/tutorial.js';
import { DialogueBox } from '../ui/dialogue.js';
import { Conversations } from './conversations.js';
import { ChatPanel } from '../ui/chat.js';
import { FriendsSheet } from '../ui/friends.js';
import { ErrandPanel, rewardText } from '../ui/errands.js';
import type { ChatLink } from '../net/chat.js';

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
export function startGame(
  ui: HTMLElement,
  character: CharacterSelf,
  link: DistrictLink,
  /** Chat général (null : indisponible). Reçoit la vue, pour la démo qui fait parler les passants. */
  makeChat: (view: CityView) => ChatLink | null,
): void {
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
  /** Commerces de bouche tenus par des joueurs (on peut y manger). */
  let playerFood: FoodPlace[] = [];
  /** Local devant lequel on se tient, si c'est son propre commerce de bouche. */
  let ownCounterSpot: string | null = null;
  const myCounters = () =>
    current.properties
      .filter((p) => p.business && p.business.type in BUSINESS_FOOD)
      .flatMap((p) => {
        const spot = map.properties.find((s) => s.id === p.spotId);
        return spot ? [{ spotId: p.spotId, door: spot.door }] : [];
      });
  let current = character;
  // Missions du quotidien : les demandes du jour se calculent comme sur le serveur.
  const walkable = reachableTiles(new MapGrid(map), map.spawn);
  let offersDay = '';
  let offers: ErrandOffer[] = [];
  const todaysOffers = () => {
    const day = realDayKey(Date.now());
    if (day !== offersDay) [offersDay, offers] = [day, dailyErrandOffers(map, walkable, day)];
    return offers;
  };
  const container = document.getElementById('game')!;
  const view = new CityView(container, {
    map,
    link,
    homeDoor,
    onLocalPosition: (x, y) => {
      const near = !!homeDoor && Math.hypot(x - homeDoor.x, y - homeDoor.y) <= MOVEMENT.homeInteractionRange;
      hud.setNearHome(near);
      hud.setNearFood(foodPlaceInReach([...food, ...playerFood], x, y));
      hud.setNearShop(shopInReach(shops, x, y));
      hud.setPosition(x, y);
      position = { x, y };
      hud.setNearAgency(isNear(agencyDoor, x, y));
      hud.setNearJobCenter(isNear(jobCenterDoor, x, y));
      const work = allEmployers.find((e) => e.id === current.job?.employerId);
      // Devant son propre commerce de bouche : on peut tenir le comptoir.
      const counter = myCounters().find((c) => isNear(c.door, x, y));
      ownCounterSpot = counter?.spotId ?? null;
      if (counter) hud.setCanStartShift(!inShift, '👩‍🍳 Cuisiner pour mes clients');
      else hud.setCanStartShift(!inShift && isNear(work?.door, x, y));
      conversations.update(position);
    },
    onPersonTap: (person) => conversations.tap(person, position),
    onBusinesses: (open) => {
      playerFood = businessFoodPlaces(map, open);
    },
    onGroundTap: () => conversations.cancel(),
  });
  const dialogue = new DialogueBox();
  ui.append(dialogue.root);
  const chatLink = makeChat(view);
  let friends: FriendsSheet | null = null;
  const chat = chatLink
    ? new ChatPanel(chatLink, {
        onLine: (line) => view.showBubbleFor(line.characterId, line.text),
        notify: (n) => hud.notify(n.text, n.level),
        friendship: (id) => (friends?.isFriend(id) ? 'friend' : friends?.isPending(id) ? 'pending' : 'none'),
      })
    : null;
  if (chat && chatLink) {
    friends = new FriendsSheet(chatLink, (name) => chat.mention(name));
    ui.append(chat.root, chat.toggle, friends.toggle, friends.root);
    chatLink.subscribeFriends({
      friends: (v) => friends!.update(v),
      event: (e) =>
        hud.notify(
          e.kind === 'online'
            ? `🟢 Ton ami ${e.name} vient de se connecter !`
            : e.kind === 'request'
              ? `👋 ${e.name} veut être ton ami (👥 pour répondre).`
              : `🤝 ${e.name} a accepté ta demande d’ami !`,
        ),
    });
  }
  let errand: ErrandView | null = null;
  /** « ❗ » au-dessus de ceux qui ont encore besoin d'aide aujourd'hui. */
  const refreshMarks = () => {
    const done = new Set(current.errandsDoneToday);
    view.setMarks(new Map(todaysOffers().map((o) => [`giver-${o.id}`, done.has(o.id) ? null : '❗'])));
  };
  const errandPanel = new ErrandPanel({
    goTo: (point) => view.requestMove(point),
    abandon: () => link.abandonErrand(),
  });
  ui.append(errandPanel.root);
  link.onErrand((e) => {
    const offer = e.kind === 'none' ? undefined : todaysOffers().find((o) => o.id === e.offerId);
    errand = e.kind === 'active' ? e : null;
    errandPanel.show(e);
    view.setErrand(e, offer);
    if (e.kind === 'done') {
      const cfg = ERRAND_TYPES[e.type];
      dialogue.open(offer?.giver.name ?? cfg.title, [...cfg.thanks, `🎉 ${rewardText(e.type)}`]);
    } else if (e.kind === 'failed') {
      hud.notify(`${ERRAND_TYPES[e.type].title} : ${e.reason}`, 'error');
    }
    refreshMarks();
  });
  const conversations = new Conversations(
    map,
    link,
    view,
    dialogue,
    (name, characterId) => {
      if (!chat || !chatLink) return dialogue.open(name, [`${name} est un vrai joueur, comme toi !`]);
      const isFriend = friends?.isFriend(characterId) ?? false;
      const pending = friends?.isPending(characterId) ?? false;
      dialogue.open(name, [isFriend ? `${name} est ton ami 🤝` : `${name} est un vrai joueur, comme toi !`], undefined, [
        { label: '💬 Lui écrire', primary: true, act: () => chat.mention(name) },
        ...(isFriend || pending ? [] : [{ label: '👋 Ajouter en ami', act: () => chatLink.requestFriend({ characterId }) }]),
      ]);
    },
    {
      offers: todaysOffers,
      active: () => errand,
      doneToday: () => current.errandsDoneToday,
      accept: (offerId) => link.acceptErrand(offerId),
    },
  );
  refreshMarks();

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
      onStartShift: () => (ownCounterSpot ? link.startOwnShift(ownCounterSpot) : link.startShift()),
      onRecenter: () => view.recenter(),
    },
    [...helpDestinations(todaysOffers()), ...destinationsOf(map)],
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
    cook: (dish, scores) => link.cook(dish, scores),
    stop: () => link.stopShift(),
    showTarget: (point) => view.setMissionTarget(point),
  });
  ui.append(mission.root, mission.kitchen.root);
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
    refreshMarks();
    // On vient de louer, d'acheter ou de rendre un local : les panneaux changent.
    const mine = self.properties.map((p) => p.spotId).join();
    if (mine !== myProperties) {
      myProperties = mine;
      void refreshForRent();
    }
  });

  // Locaux libres visibles dans la ville (panneaux « À LOUER »), rafraîchis régulièrement.
  let myProperties = (character.properties ?? []).map((p) => p.spotId).join();
  let freeLocals = '';
  let viewReady = false;
  const refreshForRent = async () => {
    if (!viewReady) return;
    const taken = new Set(await link.requestListings());
    for (const p of current?.properties ?? []) taken.add(p.spotId);
    const free = map.properties.filter((p) => p.kind === 'local' && !taken.has(p.id));
    const key = free.map((p) => p.id).join();
    if (key === freeLocals) return;
    freeLocals = key;
    view.setForRent(
      free.map((spot) => ({ spot, label: `🏪 À louer · ${formatMoney(weeklyRentCents(spot))} / sem.` })),
      () => void agency.open(current, position, 'local'),
    );
  };
  window.setInterval(() => void refreshForRent(), FOR_RENT_REFRESH_MS);
  link.onNotice((n) => hud.notify(n.text, n.level));
  link.onArrival((a) => view.playArrival(a));
  link.onDisconnected(() => showFatal(ui, 'Déconnecté du serveur.', () => location.reload()));

  const loading = el('div', { class: 'loading', text: `Chargement de ${map.cityName}…` });
  ui.append(loading);
  view
    .build()
    .then(() => {
      viewReady = true;
      void refreshForRent();
    })
    .catch((err) => showFatal(ui, `Impossible d'afficher la ville : ${(err as Error).message}`, () => location.reload()))
    .finally(() => loading.remove());

  showTutorialOnce(ui, map.cityName);
}

/** Fréquence de mise à jour des panneaux « À LOUER » (les autres joueurs louent aussi), ms. */
const FOR_RENT_REFRESH_MS = 60_000;

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

/** Habitants qui demandent de l'aide aujourd'hui (missions du quotidien), en tête de « Aller à… ». */
function helpDestinations(offers: ErrandOffer[]): Destination[] {
  return offers.map((o) => ({
    icon: ERRAND_TYPES[o.type].icon,
    name: o.giver.name,
    kind: `${ERRAND_TYPES[o.type].title} · ${rewardText(o.type)}`,
    category: '🤝 Coups de main du jour',
    point: { x: o.giver.x, y: o.giver.y },
  }));
}

/** Lieux de culte : icône et type selon la religion. */
const WORSHIP_INFO: Record<Religion, { icon: string; kind: string }> = {
  christian: { icon: '⛪', kind: 'Église' },
  muslim: { icon: '🕌', kind: 'Mosquée' },
  jewish: { icon: '🕍', kind: 'Synagogue' },
  buddhist: { icon: '☸️', kind: 'Temple bouddhiste' },
  other: { icon: '🛐', kind: 'Lieu de culte' },
};
