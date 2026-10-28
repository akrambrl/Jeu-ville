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
} from '@jeu-ville/shared';
import type { DistrictLink, PlayerHandlers, PlayerView } from '../net/link.js';

const SAVE_KEY = 'jeu-ville.demo.save';
const SELF_ID = 'moi';
const PASSERBY_COUNT = 30;
/** Longueur max (cases) du trajet d'un passant. */
const PASSERBY_MAX_PATH = 80;
/** Les passants marchent un peu moins vite que le joueur. */
const PASSERBY_SPEED_FACTOR = 0.6;
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
}

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
  };
}

/**
 * Une sauvegarde peut viser un immeuble qui n'existe plus (carte régénérée) :
 * on réattribue alors un appart de départ, devant lequel le perso réapparaît.
 */
export function repairDemoSave(map: DistrictMap, save: DemoSave): DemoSave {
  const home = map.starterBuildings.find((b) => b.id === save.buildingId);
  if (home) {
    // Carte agrandie : l'ancienne position peut tomber dans un bâtiment.
    return new MapGrid(map).isWalkable(Math.round(save.pos.x), Math.round(save.pos.y)) ? save : { ...save, pos: home.door };
  }
  const building = map.starterBuildings[Math.floor(Math.random() * map.starterBuildings.length)]!;
  return { ...save, buildingId: building.id, pos: building.door };
}

export function demoSelf(map: DistrictMap, save: DemoSave, districtKey: string, nowMs = Date.now()): CharacterSelf {
  const building = map.starterBuildings.find((b) => b.id === save.buildingId);
  const age = ageAt(save.createdAt, nowMs);
  return {
    id: SELF_ID,
    name: save.name,
    look: save.look,
    cityId: map.cityId,
    districtId: districtKey,
    moneyCents: save.moneyCents,
    gauges: snapshotGauges(save.gauges, save.gaugesUpdatedAt, nowMs),
    age: { years: Math.min(age.years, TIME.maxAge), dayOfYear: age.dayOfYear },
    home: building ? { dwellingId: `${building.id}:1`, buildingName: building.name, door: building.door } : null,
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
  private readonly walkable: TilePoint[];
  private handlers: PlayerHandlers | null = null;
  private selfCb: (self: CharacterSelf) => void = () => {};
  private noticeCb: (n: Notice) => void = () => {};
  private arrivalCb: (a: Arrival) => void = () => {};

  constructor(
    private readonly map: DistrictMap,
    private readonly districtKey: string,
    private readonly save: DemoSave,
  ) {
    this.grid = new MapGrid(map);
    this.food = foodPlaces(map);
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
      view: { id: SELF_ID, name: save.name, x: start.x, y: start.y, dir: 2, moving: false, pet: '', ...save.look },
    });
    for (let i = 0; i < PASSERBY.countPerDistrict; i++) {
      const b = spawnPasserby(`passant-${i}`, this.occupancy, this.walkable, Date.now());
      this.walkers.set(b.id, { ...b, view: { id: b.id, name: '', x: b.x, y: b.y, dir: 2, moving: false, pet: b.pet, ...b.look } });
    }

    // Temps réellement écoulé : si la page rame (téléphone modeste), on ne marche pas au ralenti.
    let last = performance.now();
    window.setInterval(() => {
      const now = performance.now();
      this.tick(Math.min(MAX_TICK_MS, now - last));
      last = now;
    }, SERVER.roomTickMs);
    window.setInterval(() => this.selfCb(this.self()), SERVER.selfSnapshotIntervalMs);
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
    const place = this.food.find((p) => p.id === placeId);
    if (!place || Math.hypot(me.x - place.x, me.y - place.y) > MOVEMENT.foodInteractionRange) {
      return this.noticeCb({ level: 'error', text: 'Approche-toi pour commander.' });
    }
    const now = Date.now();
    const result = resolveFood(place.kind, itemId, this.save.gauges, this.save.gaugesUpdatedAt, this.save.moneyCents, now);
    if (!result.ok) return this.noticeCb({ level: 'error', text: result.error });
    this.save.gauges = result.gauges;
    this.save.gaugesUpdatedAt = now;
    this.save.moneyCents += result.moneyDeltaCents;
    this.persist();
    this.selfCb(this.self());
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

  private tick(dtMs: number): void {
    const now = Date.now();
    for (const [id, w] of this.walkers) {
      const wasMoving = w.view.moving;
      if (id === SELF_ID) {
        if (w.path.length > 0) stepWalker(this.grid, this.occupancy, w, (w.speed * dtMs) / 1000, dtMs);
      } else {
        updatePasserby(this.grid, this.occupancy, w, dtMs, now);
      }
      const moving = w.path.length > 0 && w.blockedMs === 0;
      if (moving || wasMoving) {
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
