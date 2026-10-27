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
  advance,
  ageAt,
  findPath,
  resolveHomeAction,
  snapshotGauges,
  type CharacterLook,
  type CharacterSelf,
  type CreateCharacterRequest,
  type DistrictMap,
  type HomeActionId,
  type Mover,
  type Notice,
  type StoredGauges,
  type TilePoint,
} from '@jeu-ville/shared';
import type { DistrictLink, PlayerHandlers, PlayerView } from '../net/link.js';

const SAVE_KEY = 'jeu-ville.demo.save';
const SELF_ID = 'moi';
const PASSERBY_COUNT = 14;
/** Les passants marchent un peu moins vite que le joueur. */
const PASSERBY_SPEED_FACTOR = 0.6;
const SAVE_INTERVAL_MS = 5_000;

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

interface Walker extends Mover {
  view: PlayerView;
  speed: number;
  /** Instant (ms) où un passant à l'arrêt repart. */
  restUntil: number;
}

export class LocalDistrict implements DistrictLink {
  readonly sessionId = SELF_ID;
  private readonly grid: MapGrid;
  private readonly walkers = new Map<string, Walker>();
  private readonly walkable: TilePoint[] = [];
  private handlers: PlayerHandlers | null = null;
  private selfCb: (self: CharacterSelf) => void = () => {};
  private noticeCb: (n: Notice) => void = () => {};

  constructor(
    private readonly map: DistrictMap,
    private readonly districtKey: string,
    private readonly save: DemoSave,
  ) {
    this.grid = new MapGrid(map);
    // Destinations des passants : seulement les cases reliées aux rues (pas les cours fermées).
    const seen = new Uint8Array(map.width * map.height);
    const queue: TilePoint[] = [map.spawn];
    seen[map.spawn.y * map.width + map.spawn.x] = 1;
    while (queue.length > 0) {
      const p = queue.pop()!;
      this.walkable.push(p);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = { x: p.x + dx, y: p.y + dy };
        if (this.grid.isWalkable(n.x, n.y) && !seen[n.y * map.width + n.x]) {
          seen[n.y * map.width + n.x] = 1;
          queue.push(n);
        }
      }
    }

    const start = this.grid.nearestWalkable(save.pos) ?? map.spawn;
    this.walkers.set(SELF_ID, {
      x: start.x,
      y: start.y,
      dir: 2,
      path: [],
      speed: MOVEMENT.walkTilesPerSecond,
      restUntil: 0,
      view: { id: SELF_ID, name: save.name, x: start.x, y: start.y, dir: 2, moving: false, ...save.look },
    });
    for (let i = 0; i < PASSERBY_COUNT; i++) this.addPasserby(i);

    window.setInterval(() => this.tick(SERVER.roomTickMs), SERVER.roomTickMs);
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
    const start = this.grid.nearestWalkable({ x: me.x, y: me.y });
    const path = start ? findPath(this.grid, start, to, MOVEMENT.maxPathLength) : null;
    if (!path) return this.noticeCb({ level: 'error', text: 'Impossible d’aller là.' });
    me.path = start && (start.x !== me.x || start.y !== me.y) ? [start, ...path] : path;
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

  private randomWalkable(): TilePoint {
    return this.walkable[Math.floor(Math.random() * this.walkable.length)]!;
  }

  private addPasserby(i: number): void {
    const p = this.randomWalkable();
    const id = `passant-${i}`;
    this.walkers.set(id, {
      x: p.x,
      y: p.y,
      dir: 2,
      path: [],
      speed: MOVEMENT.walkTilesPerSecond * PASSERBY_SPEED_FACTOR,
      restUntil: Date.now() + Math.random() * 4000,
      view: {
        id,
        name: '',
        x: p.x,
        y: p.y,
        dir: 2,
        moving: false,
        sex: Math.random() < 0.5 ? 'male' : 'female',
        baseLook: Math.floor(Math.random() * 6),
        skinTone: Math.floor(Math.random() * 6),
        hairColor: Math.floor(Math.random() * 6),
        bodyType: Math.floor(Math.random() * 3),
      },
    });
  }

  private tick(dtMs: number): void {
    const now = Date.now();
    for (const [id, w] of this.walkers) {
      if (id !== SELF_ID && w.path.length === 0 && now >= w.restUntil) {
        // Un passant choisit une destination pas trop loin.
        const target = this.randomWalkable();
        const path = findPath(this.grid, { x: Math.round(w.x), y: Math.round(w.y) }, target, 80);
        if (path) w.path = path;
        w.restUntil = now + 2000 + Math.random() * 6000;
      }
      const wasMoving = w.view.moving;
      if (w.path.length > 0) advance(w, (w.speed * dtMs) / 1000);
      const moving = w.path.length > 0;
      if (moving || wasMoving) {
        Object.assign(w.view, { x: w.x, y: w.y, dir: w.dir, moving });
        this.handlers?.changed(id, w.view);
      }
      if (id !== SELF_ID && wasMoving && !moving) w.restUntil = now + 1000 + Math.random() * 5000;
    }
  }

  private persist(): void {
    const me = this.walkers.get(SELF_ID)!;
    this.save.pos = this.grid.nearestWalkable({ x: me.x, y: me.y }) ?? this.save.pos;
    demoStore.save(this.save);
  }
}
