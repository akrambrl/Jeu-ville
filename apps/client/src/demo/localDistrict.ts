/**
 * Démo solo : simule dans la page ce que fait le serveur (trajets A*, jauges,
 * actions chez soi), avec les mêmes règles partagées. Quelques passants
 * animent les rues. La partie est sauvegardée dans le navigateur.
 */
import {
  ECONOMY,
  MOVEMENT,
  MapGrid,
  SERVER,
  STARTING_GAUGES,
  TIME,
  ageAt,
  PASSERBY,
  TileOccupancy,
  TRAVEL,
  busDropOff,
  isTravelDestination,
  nearestFreeTile,
  pathAvoiding,
  reachableTiles,
  spawnPasserby,
  stepWalker,
  updatePasserby,
  type Passerby,
  resolveHomeAction,
  foodPlaces,
  resolveFood,
  snapshotGauges,
  type Arrival,
  type CharacterLook,
  type CharacterSelf,
  type CreateCharacterRequest,
  type DistrictMap,
  type FoodPlace,
  type HomeActionId,
  type Walker,
  type Notice,
  type StoredGauges,
  type TilePoint,
  type OwnedVehicle,
  type StoredPet,
  type VehicleKind,
  type ShopPlace,
  PETS,
  VEHICLES,
  adoptPet,
  drainBattery,
  feedPet,
  holdForTalk,
  businessFoodPlaces,
  ownCounter,
  nextReputation,
  ERRANDS,
  Errand,
  addKindness,
  dailyErrandOffers,
  errandReward,
  kindnessAt,
  realDayKey,
  type ErrandOffer,
  type ErrandView,
  DIALOGUE,
  isPetNeglected,
  petHappinessBonus,
  petLook,
  shopItems,
  shopPlaces,
  speedFactor,
  walkPet,
  BUSINESS_TYPES,
  REAL_ESTATE,
  businessPayoutCents,
  canMove,
  containsBannedWord,
  homeHappiness,
  openBusinessSchema,
  payoutPeriodsDue,
  rentPerPeriodCents,
  rentPeriodsDue,
  salePriceCents,
  type BusinessType,
  JOBS,
  Shift,
  canBeHired,
  decayGauges,
  employers,
  type JobType,
  type MissionResult,
  type MissionView,
  type PropertySpot,
} from '@jeu-ville/shared';
import type { BusinessHandlers, DistrictLink, PlayerHandlers, PlayerView } from '../net/link.js';

const SAVE_KEY = 'jeu-ville.demo.save';
const SELF_ID = 'moi';
/** Identifiant du joueur dans la démo (vue du quartier, auteur de ses messages de chat). */
export const SELF_PLAYER_ID = SELF_ID;
/** Identifiant d'un habitant qui demande de l'aide (comme sur le serveur). */
const giverId = (offer: ErrandOffer) => `giver-${offer.id}`;
const SAVE_INTERVAL_MS = 5_000;
/** Pas de simulation maximal (onglet en arrière-plan, gros ralentissement). */
const MAX_TICK_MS = 1_000;

export interface DemoSave {
  version: 1;
  name: string;
  look: CharacterLook;
  createdAt: number;
  moneyCents: number;
  gauges: StoredGauges;
  gaugesUpdatedAt: number;
  pos: TilePoint;
  buildingId: string;
  /** Ajouts du lot « cycles et animalerie » (absents des anciennes sauvegardes). */
  vehicles?: OwnedVehicle[];
  activeVehicle?: VehicleKind | '';
  pet?: StoredPet | null;
  petLostAt?: number | null;
  /** Ajouts du lot « agence immobilière ». */
  holdings?: DemoHolding[];
  homeSpotId?: string | null;
  movedAt?: number | null;
  /** Ajouts du lot « agence pour l'emploi ». */
  job?: { employerId: string; jobType: JobType } | null;
  jobXp?: Partial<Record<JobType, number>>;
  /** Ajouts du lot « missions du quotidien ». */
  errands?: { day: string; done: string[] };
  kindness?: number;
  kindnessUpdatedAt?: number;
  /** Taille de la carte de la sauvegarde (« 192x162 ») : si elle change, on répare. */
  mapSize?: string;
}

/** Bien acheté ou loué dans la démo (comme une ligne `properties` du serveur). */
interface DemoHolding {
  spotId: string;
  relation: 'owner' | 'tenant';
  leaseStart: number | null;
  rentPaid: number;
  business: { type: BusinessType; name: string; openedAt: number; paid: number; reputation?: number } | null;
  /** Prix payé à l'achat (remboursé si le bien disparaît de la carte). */
  paidCents?: number;
}

const HOME_KINDS = new Set(['apartment', 'house']);
/** Fréquence du « tick d'économie » de la démo (loyers, recettes). */
const DEMO_ECONOMY_MS = 10_000;

export const demoStore = {
  load(): DemoSave | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const save = raw ? (JSON.parse(raw) as DemoSave) : null;
      return save?.version === 1 ? save : null;
    } catch {
      return null;
    }
  },
  save(save: DemoSave): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      // Stockage indisponible : la partie durera le temps de la page.
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* rien */
    }
  },
};

/** Nouveau personnage : même règles de départ que le serveur. */
export function createDemoSave(map: DistrictMap, name: string, input: CreateCharacterRequest): DemoSave {
  const building = map.starterBuildings[Math.floor(Math.random() * map.starterBuildings.length)]!;
  const now = Date.now();
  return {
    version: 1,
    name,
    look: input,
    createdAt: now,
    moneyCents: ECONOMY.startingMoneyCents,
    gauges: { ...STARTING_GAUGES },
    gaugesUpdatedAt: now,
    pos: building.door,
    buildingId: building.id,
    mapSize: `${map.width}x${map.height}`,
  };
}

/**
 * Une sauvegarde peut viser un immeuble qui n'existe plus (carte régénérée) :
 * on réattribue alors un appart de départ, devant lequel le perso réapparaît.
 */
export function repairDemoSave(map: DistrictMap, loaded: DemoSave): DemoSave {
  const size = `${map.width}x${map.height}`;
  let save = loaded;
  if (save.mapSize !== size) {
    // Carte régénérée (ville resserrée…) : les biens disparus sont remboursés, on rentre chez soi.
    const spots = new Set(map.properties.map((p) => p.id));
    const gone = (save.holdings ?? []).filter((h) => !spots.has(h.spotId));
    const refund = gone.filter((h) => h.relation === 'owner').reduce((sum, h) => sum + (h.paidCents ?? legacyPrice(h.spotId)), 0);
    save = {
      ...save,
      mapSize: size,
      moneyCents: save.moneyCents + refund,
      holdings: (save.holdings ?? []).filter((h) => spots.has(h.spotId)),
      homeSpotId: save.homeSpotId && spots.has(save.homeSpotId) ? save.homeSpotId : null,
    };
    const building = map.starterBuildings.find((b) => b.id === save.buildingId) ?? map.starterBuildings[0]!;
    const homeSpot = map.properties.find((p) => p.id === save.homeSpotId);
    return { ...save, buildingId: building.id, pos: homeSpot?.door ?? building.door };
  }
  const home = map.starterBuildings.find((b) => b.id === save.buildingId);
  if (home) {
    // Carte agrandie : l'ancienne position peut tomber dans un bâtiment.
    return new MapGrid(map).isWalkable(Math.round(save.pos.x), Math.round(save.pos.y)) ? save : { ...save, pos: home.door };
  }
  const building = map.starterBuildings[Math.floor(Math.random() * map.starterBuildings.length)]!;
  return { ...save, buildingId: building.id, pos: building.door };
}

/** Prix d'achat estimé d'un bien d'une ancienne sauvegarde (avant que le prix payé soit noté). */
function legacyPrice(spotId: string): number {
  const kind = spotId.startsWith('apt-') ? 'apartment' : spotId.startsWith('house-') ? 'house' : 'local';
  const rooms = kind === 'apartment' ? Number(spotId.split('-').at(-1)) || 2 : kind === 'house' ? LEGACY_HOUSE_ROOMS : 1;
  return salePriceCents({ kind, rooms, centrality: LEGACY_CENTRALITY } as PropertySpot);
}
/** Valeurs moyennes pour estimer ce prix. */
const LEGACY_HOUSE_ROOMS = 4;
const LEGACY_CENTRALITY = 0.5;

export function demoSelf(map: DistrictMap, save: DemoSave, districtKey: string, nowMs = Date.now()): CharacterSelf {
  const homeSpot = save.homeSpotId ? (map.properties.find((p) => p.id === save.homeSpotId) ?? null) : null;
  const building = homeSpot ? null : map.starterBuildings.find((b) => b.id === save.buildingId);
  const bonus =
    homeHappiness(homeSpot) +
    petHappinessBonus(save.pet ?? null, save.petLostAt ?? null, nowMs) +
    kindnessAt(save.kindness ?? 0, save.kindnessUpdatedAt ?? 0, nowMs);
  const age = ageAt(save.createdAt, nowMs);
  return {
    id: SELF_ID,
    name: save.name,
    look: save.look,
    cityId: map.cityId,
    districtId: districtKey,
    moneyCents: save.moneyCents,
    gauges: snapshotGauges(save.gauges, save.gaugesUpdatedAt, nowMs, bonus),
    age: { years: Math.min(age.years, TIME.maxAge), dayOfYear: age.dayOfYear },
    home: homeSpot
      ? { dwellingId: homeSpot.id, buildingName: homeSpot.name, door: homeSpot.door }
      : building
        ? { dwellingId: `${building.id}:1`, buildingName: building.name, door: building.door }
        : null,
    vehicles: save.vehicles ?? [],
    activeVehicle: save.activeVehicle ?? '',
    pet: save.pet ?? null,
    happinessBonus: bonus,
    properties: (save.holdings ?? []).map((h) => ({
      spotId: h.spotId,
      relation: h.relation,
      business: h.business ? { type: h.business.type, name: h.business.name, reputation: h.business.reputation ?? 0 } : null,
    })),
    movedAt: save.movedAt ?? null,
    job: save.job ? { ...save.job, employerName: employers(map).find((e) => e.id === save.job!.employerId)?.name ?? '' } : null,
    jobXp: save.jobXp ?? {},
    errandsDoneToday: save.errands?.day === realDayKey(nowMs) ? save.errands.done : [],
    computedAt: nowMs,
  };
}

interface DemoWalker extends Passerby {
  view: PlayerView;
}

export class LocalDistrict implements DistrictLink {
  readonly sessionId = SELF_ID;
  private readonly grid: MapGrid;
  private readonly walkers = new Map<string, DemoWalker>();
  /** Une case = une personne, comme sur le serveur. */
  private readonly occupancy = new TileOccupancy();
  private readonly food: FoodPlace[];
  private readonly shops: ShopPlace[];
  private readonly walkable: TilePoint[];
  private handlers: PlayerHandlers | null = null;
  private selfCb: (self: CharacterSelf) => void = () => {};
  private noticeCb: (n: Notice) => void = () => {};
  private arrivalCb: (a: Arrival) => void = () => {};
  private businessHandlers: BusinessHandlers | null = null;
  private missionCb: (m: MissionView) => void = () => {};
  private shift: Shift | null = null;
  /** Service au comptoir de son propre commerce (local), sinon null. */
  private ownSpot: string | null = null;
  /** Demandes d'aide du jour, mission du quotidien en cours. */
  private offers: ErrandOffer[] = [];
  private errandDay = '';
  private errand: Errand | null = null;
  private errandStep = 0;
  private errandCb: (e: ErrandView) => void = () => {};

  constructor(
    private readonly map: DistrictMap,
    private readonly districtKey: string,
    private readonly save: DemoSave,
  ) {
    this.grid = new MapGrid(map);
    this.food = foodPlaces(map);
    this.shops = shopPlaces(map);
    // Où apparaissent les passants : cases reliées aux rues (pas les cours fermées).
    this.walkable = reachableTiles(this.grid, map.spawn);

    for (const v of map.vendors) this.occupancy.block(v.x, v.y);
    const wanted = this.grid.nearestWalkable(save.pos) ?? map.spawn;
    const start = nearestFreeTile(this.grid, this.occupancy, wanted, SELF_ID) ?? wanted;
    this.occupancy.tryHold(SELF_ID, start.x, start.y);
    this.walkers.set(SELF_ID, {
      id: SELF_ID,
      x: start.x,
      y: start.y,
      dir: 2,
      path: [],
      tile: { ...start },
      blockedMs: 0,
      speed: MOVEMENT.walkTilesPerSecond,
      restUntil: 0,
      look: save.look,
      pet: '',
      view: {
        id: SELF_ID,
        name: save.name,
        x: start.x,
        y: start.y,
        dir: 2,
        moving: false,
        pet: petLook(save.pet ?? null),
        vehicle: save.activeVehicle ?? '',
        ...save.look,
      },
    });
    // Passants du quartier, puis flâneurs des rues commerçantes.
    const spawns = [
      ...Array.from({ length: PASSERBY.countPerDistrict }, () => ({ tiles: this.walkable, zone: undefined as number | undefined })),
      ...map.busyStreets.flatMap((s, zone) => Array.from({ length: PASSERBY.perBusyStreet }, () => ({ tiles: s.sidewalks, zone }))),
    ];
    for (const [i, s] of spawns.entries()) {
      const b = spawnPasserby(`passant-${i}`, this.occupancy, s.tiles, Date.now(), Math.random, s.zone);
      this.walkers.set(b.id, { ...b, view: { id: b.id, name: '', x: b.x, y: b.y, dir: 2, moving: false, pet: b.pet, vehicle: '', ...b.look } });
    }

    // Temps réellement écoulé : si la page rame (téléphone modeste), on ne marche pas au ralenti.
    let last = performance.now();
    window.setInterval(() => {
      const now = performance.now();
      this.tick(Math.min(MAX_TICK_MS, now - last));
      last = now;
    }, SERVER.roomTickMs);
    this.refreshErrandOffers();
    window.setInterval(() => {
      this.checkPetCare();
      this.refreshErrandOffers();
      this.selfCb(this.self());
    }, SERVER.selfSnapshotIntervalMs);
    window.setTimeout(() => this.checkPetCare(), 1000);
    window.setTimeout(() => this.economyTick(), 1000);
    window.setInterval(() => this.economyTick(), DEMO_ECONOMY_MS);
    window.setInterval(() => this.persist(), SAVE_INTERVAL_MS);
    window.addEventListener('pagehide', () => this.persist());
  }

  self(): CharacterSelf {
    return demoSelf(this.map, this.save, this.districtKey);
  }

  // ---------- DistrictLink ----------

  move(to: TilePoint): void {
    const me = this.walkers.get(SELF_ID)!;
    // Case déjà prise par quelqu'un : on s'arrête sur la case libre la plus proche.
    const target = this.grid.isWalkable(to.x, to.y) ? nearestFreeTile(this.grid, this.occupancy, to, SELF_ID) : null;
    const path = target ? pathAvoiding(this.grid, this.occupancy, me, target) : null;
    if (!path) return this.noticeCb({ level: 'error', text: 'Impossible d’aller là.' });
    me.path = path;
    me.blockedMs = 0;
  }

  homeAction(action: HomeActionId): void {
    const me = this.walkers.get(SELF_ID)!;
    const door = this.self().home?.door;
    if (!door || Math.hypot(me.x - door.x, me.y - door.y) > MOVEMENT.homeInteractionRange) {
      return this.noticeCb({ level: 'error', text: 'Rentre chez toi pour faire ça.' });
    }
    const now = Date.now();
    const result = resolveHomeAction(action, this.save.gauges, this.save.gaugesUpdatedAt, this.save.moneyCents, now);
    if (!result.ok) return this.noticeCb({ level: 'error', text: result.error });
    this.save.gauges = result.gauges;
    this.save.gaugesUpdatedAt = now;
    this.save.moneyCents += result.moneyDeltaCents;
    this.persist();
    this.selfCb(this.self());
  }

  buyFood(placeId: string, itemId: string): void {
    const me = this.walkers.get(SELF_ID)!;
    const place = [...this.food, ...this.myFoodPlaces()].find((p) => p.id === placeId);
    if (!place || Math.hypot(me.x - place.x, me.y - place.y) > MOVEMENT.foodInteractionRange) {
      return this.noticeCb({ level: 'error', text: 'Approche-toi pour commander.' });
    }
    const now = Date.now();
    // Dans la démo, les seuls commerces de joueurs sont les siens : on y mange gratuitement.
    const own = !!place.spotId;
    const result = resolveFood(place.kind, itemId, this.save.gauges, this.save.gaugesUpdatedAt, own ? Number.MAX_SAFE_INTEGER : this.save.moneyCents, now);
    if (!result.ok) return this.noticeCb({ level: 'error', text: result.error });
    this.save.gauges = result.gauges;
    this.save.gaugesUpdatedAt = now;
    if (!own) this.save.moneyCents += result.moneyDeltaCents;
    this.persist();
    this.selfCb(this.self());
  }

  buyItem(placeId: string, itemId: string): void {
    const me = this.walkers.get(SELF_ID)!;
    const place = this.shops.find((p) => p.id === placeId);
    if (!place || Math.hypot(me.x - place.x, me.y - place.y) > MOVEMENT.foodInteractionRange) {
      return this.notice('Approche-toi de la boutique.');
    }
    const item = shopItems(place.kind).find((i) => i.id === itemId);
    if (!item) return this.notice("Ce n'est pas vendu ici.");
    if (item.type === 'vehicle' && (this.save.vehicles ?? []).some((v) => v.kind === item.vehicle)) {
      return this.notice(`Tu as déjà un ${VEHICLES[item.vehicle].label.toLowerCase()}.`);
    }
    if (item.type === 'pet' && this.save.pet) return this.notice("Tu as déjà un animal : occupe-t'en bien !");
    if (this.save.moneyCents < item.costCents) return this.notice("Pas assez d'argent.");
    this.save.moneyCents -= item.costCents;
    if (item.type === 'vehicle') {
      this.save.vehicles = [...(this.save.vehicles ?? []), { kind: item.vehicle, battery: 100 }];
      this.save.activeVehicle = item.vehicle;
    } else {
      this.save.pet = adoptPet(item.species, Math.random, Date.now());
    }
    this.commit();
  }

  setVehicle(vehicle: VehicleKind | ''): void {
    if (vehicle) {
      const owned = (this.save.vehicles ?? []).find((v) => v.kind === vehicle);
      if (!owned) return this.notice("Tu n'as pas ce véhicule.");
      if (owned.battery <= 0) return this.notice('Batterie vide : recharge-la chez toi.');
    }
    this.save.activeVehicle = vehicle;
    this.commit();
  }

  chargeScooter(): void {
    const me = this.walkers.get(SELF_ID)!;
    const door = this.self().home?.door;
    if (!door || Math.hypot(me.x - door.x, me.y - door.y) > MOVEMENT.homeInteractionRange) return this.notice('Rentre chez toi pour recharger.');
    const scooter = (this.save.vehicles ?? []).find((v) => v.kind === 'scooter');
    if (!scooter) return this.notice("Tu n'as pas de trottinette.");
    scooter.battery = 100;
    this.commit();
  }

  talk(botId: string): void {
    const b = this.walkers.get(botId);
    const me = this.walkers.get(SELF_ID)!;
    if (!b || botId === SELF_ID || Math.hypot(b.x - me.x, b.y - me.y) > DIALOGUE.talkRange + 1) return;
    holdForTalk(b, me.tile, Date.now());
  }

  feedPet(): void {
    if (!this.save.pet) return this.notice("Tu n'as pas d'animal.");
    if (this.save.moneyCents < PETS.kibble.costCents) return this.notice("Pas assez d'argent.");
    this.save.moneyCents -= PETS.kibble.costCents;
    this.save.pet = feedPet(this.save.pet, Date.now());
    this.commit();
  }

  // ---------- Agence immobilière (mêmes règles que le serveur) ----------

  requestListings(): Promise<string[]> {
    // Seul joueur de la démo : tout ce qu'il ne détient pas est disponible.
    return Promise.resolve([]);
  }

  buyProperty(spotId: string): void {
    this.acquire(spotId, 'buy');
  }

  rentProperty(spotId: string): void {
    this.acquire(spotId, 'rent');
  }

  private spot(spotId: string): PropertySpot | null {
    return this.map.properties.find((p) => p.id === spotId) ?? null;
  }

  private acquire(spotId: string, mode: 'buy' | 'rent'): void {
    const spot = this.spot(spotId);
    if (!spot) return this.notice('Ce bien n’existe pas.');
    const holdings = (this.save.holdings ??= []);
    if (holdings.some((h) => h.spotId === spotId)) return this.notice('Ce bien est déjà à toi.');
    const kindOf = (h: DemoHolding) => this.spot(h.spotId)?.kind;
    if (HOME_KINDS.has(spot.kind) && holdings.filter((h) => HOME_KINDS.has(kindOf(h) ?? '')).length >= REAL_ESTATE.maxHomes) {
      return this.notice('Tu as déjà un logement : rends-le ou revends-le d’abord.');
    }
    if (spot.kind === 'local' && holdings.filter((h) => kindOf(h) === 'local').length >= REAL_ESTATE.maxLocals) {
      return this.notice(`${REAL_ESTATE.maxLocals} locaux au plus.`);
    }
    const cost = mode === 'buy' ? salePriceCents(spot) : rentPerPeriodCents(spot);
    if (this.save.moneyCents < cost) return this.notice("Pas assez d'argent.");
    this.save.moneyCents -= cost;
    const now = Date.now();
    holdings.push({
      spotId,
      relation: mode === 'buy' ? 'owner' : 'tenant',
      leaseStart: mode === 'rent' ? now : null,
      rentPaid: mode === 'rent' ? 1 : 0,
      business: null,
      ...(mode === 'buy' ? { paidCents: cost } : {}),
    });
    if (HOME_KINDS.has(spot.kind) && canMove(this.save.movedAt ?? null, now)) {
      this.save.homeSpotId = spotId;
      this.save.movedAt = now;
    }
    this.commit();
  }

  moveIn(spotId: string): void {
    const spot = this.spot(spotId);
    if (!spot || !HOME_KINDS.has(spot.kind)) return this.notice('On ne peut pas habiter dans un local commercial.');
    if (!(this.save.holdings ?? []).some((h) => h.spotId === spotId)) return this.notice('Ce logement n’est pas à toi.');
    if (!canMove(this.save.movedAt ?? null, Date.now())) {
      return this.notice(`Un déménagement toutes les ${REAL_ESTATE.moveCooldownDays / 7} semaines au plus.`);
    }
    this.save.homeSpotId = spotId;
    this.save.movedAt = Date.now();
    this.commit();
  }

  releaseProperty(spotId: string): void {
    const holdings = this.save.holdings ?? [];
    const h = holdings.find((x) => x.spotId === spotId);
    const spot = this.spot(spotId);
    if (!h || !spot) return this.notice('Ce bien n’est pas à toi.');
    if (h.relation === 'owner') this.save.moneyCents += Math.round(salePriceCents(spot) * REAL_ESTATE.resaleShare);
    this.save.holdings = holdings.filter((x) => x !== h);
    if (this.save.homeSpotId === spotId) this.save.homeSpotId = null;
    if (h.business) this.businessHandlers?.closed(spotId);
    this.commit();
  }

  openBusiness(spotId: string, type: BusinessType, name: string): void {
    const parsed = openBusinessSchema.safeParse({ spotId, type, name });
    if (!parsed.success) return this.notice(parsed.error.issues[0]?.message ?? 'Nom invalide.');
    if (containsBannedWord(parsed.data.name)) return this.notice('Ce nom n’est pas autorisé.');
    const h = (this.save.holdings ?? []).find((x) => x.spotId === spotId);
    if (!h || this.spot(spotId)?.kind !== 'local') return this.notice('Ce local n’est pas à toi.');
    if (h.business) return this.notice('Un commerce est déjà ouvert ici.');
    const setup = BUSINESS_TYPES[type].setupCents;
    if (this.save.moneyCents < setup) return this.notice("Pas assez d'argent pour les travaux.");
    this.save.moneyCents -= setup;
    h.business = { type, name: parsed.data.name, openedAt: Date.now(), paid: 0, reputation: 0 };
    this.businessHandlers?.opened(spotId, { type, name: parsed.data.name });
    this.commit();
  }

  subscribeBusinesses(handlers: BusinessHandlers): void {
    this.businessHandlers = handlers;
    for (const h of this.save.holdings ?? []) if (h.business) handlers.opened(h.spotId, { type: h.business.type, name: h.business.name });
  }

  /** Loyers échus et recettes des commerces (rattrapés après une absence). */
  private economyTick(): void {
    const now = Date.now();
    let changed = false;
    for (const h of [...(this.save.holdings ?? [])]) {
      const spot = this.spot(h.spotId);
      if (!spot) continue;
      if (h.relation === 'tenant' && h.leaseStart !== null) {
        const due = rentPeriodsDue(h.leaseStart, now);
        const rent = rentPerPeriodCents(spot);
        for (; h.rentPaid < due; h.rentPaid++) {
          if (this.save.moneyCents < rent) {
            this.notice(`Loyer impayé : tu perds ${spot.name}.`, 'info');
            this.releaseProperty(h.spotId);
            break;
          }
          this.save.moneyCents -= rent;
          changed = true;
        }
      }
      if (h.business && (this.save.holdings ?? []).includes(h)) {
        const due = payoutPeriodsDue(h.business.openedAt, now);
        if (due > h.business.paid) {
          this.save.moneyCents += (due - h.business.paid) * businessPayoutCents(h.business.type, spot, h.business.reputation ?? 0);
          h.business.paid = due;
          changed = true;
        }
      }
    }
    if (changed) this.commit();
  }

  // ---------- Agence pour l'emploi (mêmes règles que le serveur) ----------

  applyJob(employerId: string): void {
    const employer = employers(this.map).find((e) => e.id === employerId);
    if (!employer) return this.notice('Cette offre n’existe plus.');
    if (this.save.job) return this.notice('Tu as déjà un emploi : démissionne d’abord.');
    const appearance = decayGauges(this.save.gauges, Date.now() - this.save.gaugesUpdatedAt).appearance;
    if (!canBeHired(appearance)) {
      return this.notice(`Refusé : présente-toi mieux (apparence ${JOBS.minAppearanceToHire} au moins). Change-toi chez toi !`);
    }
    this.endShift();
    this.save.job = { employerId, jobType: employer.jobType };
    this.commit();
  }

  quitJob(): void {
    this.endShift();
    this.save.job = null;
    this.commit();
  }

  startShift(): void {
    const me = this.walkers.get(SELF_ID)!;
    if (this.shift) return this.notice('Tu es déjà en service.');
    const employer = employers(this.map).find((e) => e.id === this.save.job?.employerId);
    if (!employer) return this.notice("Tu n'as pas d'emploi : passe à l'agence pour l'emploi.");
    if (Math.hypot(me.x - employer.door.x, me.y - employer.door.y) > MOVEMENT.foodInteractionRange) {
      return this.notice(`Va d'abord chez ton employeur : ${employer.name}.`);
    }
    this.ownSpot = null;
    this.shift = new Shift(`demo:${Date.now()}`, employer, this.save.jobXp?.[employer.jobType] ?? 0, this.map);
    this.shift.next({ x: me.x, y: me.y }, Date.now());
    this.missionCb(this.shift.view(Date.now()));
  }

  /** Commerces de bouche que l'on tient (où l'on peut manger, et servir). */
  private myFoodPlaces() {
    const open = (this.save.holdings ?? []).filter((h) => h.business).map((h) => ({ spotId: h.spotId, type: h.business!.type, name: h.business!.name }));
    return businessFoodPlaces(this.map, open);
  }

  startOwnShift(spotId: string): void {
    const me = this.walkers.get(SELF_ID)!;
    if (this.shift) return this.notice('Tu es déjà en service.');
    const h = (this.save.holdings ?? []).find((x) => x.spotId === spotId && x.business);
    if (!h) return this.notice('Ce n’est pas ton commerce.');
    const counter = ownCounter(this.map, { spotId, type: h.business!.type, name: h.business!.name });
    if (!counter) return this.notice('Ce commerce ne sert pas à manger.');
    if (Math.hypot(me.x - counter.employer.door.x, me.y - counter.employer.door.y) > MOVEMENT.foodInteractionRange) {
      return this.notice('Va d’abord devant ton commerce.');
    }
    this.ownSpot = spotId;
    this.shift = new Shift(`demo:own:${Date.now()}`, counter.employer, 0, this.map, Math.random, counter.pay, h.business!.type);
    this.shift.next({ x: me.x, y: me.y }, Date.now());
    this.missionCb(this.shift.view(Date.now()));
  }

  stopShift(): void {
    this.endShift();
  }

  serve(items: string[]): void {
    const me = this.walkers.get(SELF_ID)!;
    const result = this.shift?.serve(items, { x: me.x, y: me.y }, Date.now());
    if (result) this.missionDone(result);
  }

  cook(dish: string, scores: number[]): void {
    const me = this.walkers.get(SELF_ID)!;
    const result = this.shift?.cook(dish, scores, { x: me.x, y: me.y }, Date.now());
    if (result) this.missionDone(result);
  }

  onMission(cb: (mission: MissionView) => void): void {
    this.missionCb = cb;
  }

  private missionDone(result: MissionResult): void {
    const shift = this.shift!;
    this.notice(result.payCents > 0 ? `${result.text} +${result.payCents / 100} €` : result.text, result.payCents > 0 ? 'info' : 'error');
    if (result.payCents > 0) {
      const type = shift.employer.jobType;
      this.save.moneyCents += result.payCents;
      // Plat cuisiné : la réputation du commerce évolue.
      const own = result.stars && (this.save.holdings ?? []).find((h) => h.spotId === this.ownSpot)?.business;
      if (own) own.reputation = nextReputation(own.reputation ?? 0, result.stars!);
      // Son propre comptoir : de l'argent, pas d'expérience de salarié.
      if (!this.ownSpot) this.save.jobXp = { ...this.save.jobXp, [type]: (this.save.jobXp?.[type] ?? 0) + JOBS[type].xpPerMission };
      this.commit();
    }
    this.missionCb(shift.view(Date.now()));
    if (shift.done) this.shift = null;
  }

  private endShift(): void {
    if (!this.shift) return;
    const view = this.shift.view(Date.now());
    this.shift = null;
    this.missionCb(view.kind === 'done' ? view : { kind: 'done', earnedCents: view.earnedCents, succeeded: 0, total: view.total });
  }

  rideBus(to: TilePoint): void {
    const me = this.walkers.get(SELF_ID)!;
    if (!isTravelDestination(this.map, to, this.self().home?.door ?? null)) {
      return this.noticeCb({ level: 'error', text: 'Le bus ne va pas là.' });
    }
    if (Math.hypot(to.x - me.x, to.y - me.y) < TRAVEL.minBusDistance) {
      return this.noticeCb({ level: 'error', text: 'C’est tout près, vas-y à pied.' });
    }
    if (this.save.moneyCents < TRAVEL.busFareCents) return this.noticeCb({ level: 'error', text: "Pas assez d'argent." });
    const drop = busDropOff(this.grid, to);
    const at = nearestFreeTile(this.grid, this.occupancy, drop.door, SELF_ID);
    if (!at) return this.noticeCb({ level: 'error', text: 'Trop de monde là-bas, réessaie.' });
    this.save.moneyCents -= TRAVEL.busFareCents;
    this.occupancy.releaseAll(SELF_ID);
    this.occupancy.tryHold(SELF_ID, at.x, at.y);
    Object.assign(me, { x: at.x, y: at.y, tile: { ...at }, path: [], blockedMs: 0 });
    Object.assign(me.view, { x: at.x, y: at.y, moving: false });
    this.handlers?.changed(SELF_ID, me.view);
    this.persist();
    this.selfCb(this.self());
    this.arrivalCb({ playerId: SELF_ID, via: 'bus', at, curb: drop.curb });
    // Une fois descendu du bus, on marche jusqu'à la destination.
    window.setTimeout(() => {
      if (me.path.length === 0) this.move(to);
    }, TRAVEL.busArriveMs + TRAVEL.busStopMs);
  }

  onArrival(cb: (arrival: Arrival) => void): void {
    this.arrivalCb = cb;
  }

  // ---------- Missions du quotidien ----------

  /** Les demandeurs d'aide changent à minuit (heure de Paris), comme sur le serveur. */
  private refreshErrandOffers(): void {
    const day = realDayKey(Date.now());
    if (day === this.errandDay) return;
    for (const old of this.offers) {
      const id = giverId(old);
      this.walkers.delete(id);
      this.occupancy.releaseAll(id);
      this.handlers?.removed(id);
    }
    this.errandDay = day;
    this.offers = dailyErrandOffers(this.map, this.walkable, day).filter((o) => this.occupancy.tryHold(giverId(o), o.giver.x, o.giver.y));
    for (const o of this.offers) {
      const id = giverId(o);
      const { name: _name, x: _x, y: _y, ...look } = o.giver;
      // Un demandeur reste sur place, tourné vers la rue (« parle » indéfiniment).
      const w: DemoWalker = {
        id,
        x: o.giver.x,
        y: o.giver.y,
        dir: 2,
        path: [],
        tile: { x: o.giver.x, y: o.giver.y },
        blockedMs: 0,
        speed: 0,
        restUntil: Infinity,
        look: { ...look, bodyType: 1 },
        pet: '',
        talk: { until: Infinity, dir: 2 },
        view: { id, name: '', x: o.giver.x, y: o.giver.y, dir: 2, moving: false, pet: '', vehicle: '', ...look, bodyType: 1 },
      };
      this.walkers.set(id, w);
      this.handlers?.added(id, w.view);
    }
  }

  acceptErrand(offerId: string): void {
    const offer = this.offers.find((o) => o.id === offerId);
    const me = this.walkers.get(SELF_ID)!;
    if (!offer) return this.notice('Cette personne n’a plus besoin d’aide.');
    if (this.errand) return this.notice('Tu es déjà en train d’aider quelqu’un.');
    if (Math.hypot(offer.giver.x - me.x, offer.giver.y - me.y) > DIALOGUE.talkRange + 1) return this.notice('Approche-toi d’abord.');
    const done = this.self().errandsDoneToday;
    if (done.includes(offer.id)) return this.notice('Tu as déjà aidé cette personne aujourd’hui.');
    if (done.length >= ERRANDS.perDay) return this.notice('Tu as déjà beaucoup aidé aujourd’hui : reviens demain !');
    const home = this.self().home?.door ?? null;
    if (offer.type === 'tools' && !home) return this.notice('Il te faut un logement pour avoir des outils.');
    this.errand = new Errand(offer, home, Date.now());
    this.errandStep = 0;
    this.errandCb(this.errand.view(Date.now()));
  }

  abandonErrand(): void {
    if (!this.errand) return;
    this.errand = null;
    this.errandCb({ kind: 'none' });
  }

  onErrand(cb: (errand: ErrandView) => void): void {
    this.errandCb = cb;
  }

  private tickErrand(now: number): void {
    const errand = this.errand;
    if (!errand) return;
    const me = this.walkers.get(SELF_ID)!;
    const result = errand.tick({ x: me.x, y: me.y }, now);
    if (result === 'failed') {
      this.errand = null;
      this.errandCb({ kind: 'failed', offerId: errand.offer.id, type: errand.offer.type, reason: 'Trop tard…' });
    } else if (result === 'done') {
      this.errand = null;
      const reward = errandReward(errand.offer.type);
      const day = realDayKey(now);
      const done = this.save.errands?.day === day ? this.save.errands.done : [];
      if (!done.includes(errand.offer.id)) {
        this.save.errands = { day, done: [...done, errand.offer.id] };
        this.save.moneyCents += reward.cents;
        this.save.kindness = addKindness(this.save.kindness ?? 0, this.save.kindnessUpdatedAt ?? 0, now, reward.kindness);
        this.save.kindnessUpdatedAt = now;
        this.commit();
      }
      this.errandCb({ kind: 'done', offerId: errand.offer.id, type: errand.offer.type, rewardCents: reward.cents, kindness: reward.kindness });
    } else if (errand.stepIndex !== this.errandStep) {
      this.errandStep = errand.stepIndex;
      this.errandCb(errand.view(now));
    }
  }

  subscribePlayers(handlers: PlayerHandlers): void {
    this.handlers = handlers;
    for (const [id, w] of this.walkers) handlers.added(id, w.view);
  }

  onSelf(cb: (self: CharacterSelf) => void): void {
    this.selfCb = cb;
  }

  onNotice(cb: (notice: Notice) => void): void {
    this.noticeCb = cb;
  }

  onDisconnected(): void {
    // Rien à perdre : tout tourne dans la page.
  }

  // ---------- Simulation ----------

  private notice(text: string, level: Notice['level'] = 'error'): void {
    this.noticeCb({ level, text });
  }

  /** Sauvegarde, met à jour ce que voient les autres (véhicule, animal) et la vue privée. */
  private commit(): void {
    const me = this.walkers.get(SELF_ID)!;
    Object.assign(me.view, { vehicle: this.save.activeVehicle ?? '', pet: petLook(this.save.pet ?? null) });
    this.handlers?.changed(SELF_ID, me.view);
    this.persist();
    this.selfCb(this.self());
  }

  /** Batterie de la trottinette et promenade de l'animal, à chaque pas du joueur. */
  private afterSelfMove(moved: number, now: number): void {
    if (moved <= 0) return;
    if (this.save.pet) this.save.pet = walkPet(this.save.pet, moved, now);
    const kind = this.save.activeVehicle;
    const v = kind ? (this.save.vehicles ?? []).find((x) => x.kind === kind) : undefined;
    if (!v) return;
    v.battery = drainBattery(v, moved).battery;
    if (v.battery <= 0) {
      this.save.activeVehicle = '';
      this.notice('Batterie de la trottinette vide : recharge-la chez toi.', 'info');
      this.commit();
    }
  }

  /** Animal négligé : un refuge le recueille, avec une amende. */
  private checkPetCare(): void {
    const pet = this.save.pet;
    if (!pet || !isPetNeglected(pet, Date.now())) return;
    const fine = Math.min(this.save.moneyCents, PETS.shelterFineCents);
    this.save.moneyCents -= fine;
    this.save.pet = null;
    this.save.petLostAt = Date.now();
    this.notice(`${pet.name} n'a pas été nourri depuis trop longtemps : un refuge l'a recueilli. Amende : ${fine / 100} €.`, 'info');
    this.commit();
  }

  private tick(dtMs: number): void {
    const now = Date.now();
    this.tickErrand(now);
    for (const [id, w] of this.walkers) {
      const wasMoving = w.view.moving;
      if (id === SELF_ID) {
        if (w.path.length > 0) {
          const before = { x: w.x, y: w.y };
          const vehicle = this.save.activeVehicle ?? '';
          stepWalker(this.grid, this.occupancy, w, (w.speed * speedFactor(vehicle) * dtMs) / 1000, dtMs);
          this.afterSelfMove(Math.hypot(w.x - before.x, w.y - before.y), now);
        }
      } else {
        updatePasserby(this.grid, this.occupancy, w, dtMs, now);
      }
      if (id === SELF_ID && this.shift) {
        const employer = this.shift.employer;
        if (employer.jobType === 'counter' && Math.hypot(w.x - employer.door.x, w.y - employer.door.y) > JOBS.counter.leaveDistance) {
          this.notice('Tu as quitté ton poste : service terminé.');
          this.endShift();
        } else {
          const result = this.shift.tick({ x: w.x, y: w.y }, now);
          if (result) this.missionDone(result);
        }
      }
      const moving = w.path.length > 0 && w.blockedMs === 0;
      if (moving || wasMoving || w.view.dir !== w.dir) {
        Object.assign(w.view, { x: w.x, y: w.y, dir: w.dir, moving });
        this.handlers?.changed(id, w.view);
      }
    }
  }

  private persist(): void {
    const me = this.walkers.get(SELF_ID)!;
    this.save.pos = this.grid.nearestWalkable({ x: me.x, y: me.y }) ?? this.save.pos;
    demoStore.save(this.save);
  }
}
