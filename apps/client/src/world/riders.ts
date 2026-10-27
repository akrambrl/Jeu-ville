/**
 * Voyageurs (bots décoratifs) qui attendent aux arrêts de bus, de tram et sur
 * les quais du RER, montent quand un véhicule s'arrête, et en descendent.
 * Pour rester léger sur mobile, seuls les arrêts proches de la caméra sont peuplés.
 */
import * as THREE from 'three';
import type { MapGrid, TilePoint } from '@jeu-ville/shared';
import { Character3D } from './characters.js';

/** Un arrêt est peuplé quand la caméra regarde à moins de cette distance (cases). */
const ACTIVE_RADIUS = 24;
/** … et vidé au-delà de celle-ci (marge pour éviter les clignotements). */
const RELEASE_RADIUS = 32;
const MAX_WAITING = 3;
/** Délai (s) entre deux nouveaux voyageurs qui arrivent à l'arrêt. */
const ARRIVAL_EVERY: [number, number] = [6, 14];
/** Voyageurs qui descendent à chaque arrêt d'un véhicule (au plus). */
const MAX_ALIGHTING = 2;
const WALK_SPEED = 1.1;
const MODELS = ['male-a', 'male-b', 'male-d', 'male-f', 'female-a', 'female-b', 'female-c', 'female-e', 'female-f'];

export interface RiderStop {
  id: string;
  /** Où l'on attend (poteau, abri, quai). */
  wait: TilePoint;
  /** Dispersion des voyageurs autour du point d'attente, le long de cet axe. */
  axis: 'x' | 'y';
  spread: number;
}

interface Rider {
  c: Character3D;
  target: TilePoint | null;
  /** Que faire une fois arrivé : attendre, monter (disparaître), partir (disparaître). */
  then: 'wait' | 'board' | 'leave';
}

interface StopState {
  stop: RiderStop;
  active: boolean;
  riders: Rider[];
  nextArrival: number;
}

export class TransitRiders {
  private readonly stops = new Map<string, StopState>();

  constructor(
    private readonly grid: MapGrid,
    private readonly group: THREE.Group,
    stops: RiderStop[],
  ) {
    for (const stop of stops) this.stops.set(stop.id, { stop, active: false, riders: [], nextArrival: 0 });
  }

  /** Un véhicule s'arrête à `stopId`, ses portes en `at` : on monte, on descend. */
  vehicleArrived(stopId: string, at: TilePoint): void {
    const s = this.stops.get(stopId);
    if (!s?.active) return;
    for (const r of s.riders) {
      if (r.then !== 'wait') continue;
      r.then = 'board';
      r.target = { x: at.x + (Math.random() - 0.5) * 0.4, y: at.y + (Math.random() - 0.5) * 0.4 };
    }
    const alighting = Math.floor(Math.random() * (MAX_ALIGHTING + 1));
    for (let k = 0; k < alighting; k++) {
      const away = this.awayFrom(s.stop);
      this.spawn(s, { x: at.x + (Math.random() - 0.5) * 0.4, y: at.y + (Math.random() - 0.5) * 0.4 }, away, 'leave');
    }
  }

  update(dt: number, focus: TilePoint): void {
    for (const s of this.stops.values()) {
      const d = Math.hypot(s.stop.wait.x - focus.x, s.stop.wait.y - focus.y);
      if (!s.active && d < ACTIVE_RADIUS) this.activate(s);
      else if (s.active && d > RELEASE_RADIUS) this.release(s);
      if (!s.active) continue;

      s.nextArrival -= dt;
      if (s.nextArrival <= 0) {
        s.nextArrival = ARRIVAL_EVERY[0] + Math.random() * (ARRIVAL_EVERY[1] - ARRIVAL_EVERY[0]);
        if (s.riders.filter((r) => r.then === 'wait').length < MAX_WAITING) this.spawn(s, this.awayFrom(s.stop), this.waitSpot(s.stop), 'wait');
      }
      for (const r of s.riders) this.walk(r, dt);
      s.riders = s.riders.filter((r) => {
        const done = r.target === null && r.then !== 'wait';
        if (done) r.c.dispose();
        return !done;
      });
    }
  }

  private activate(s: StopState): void {
    s.active = true;
    s.nextArrival = ARRIVAL_EVERY[0];
    const initial = 1 + Math.floor(Math.random() * MAX_WAITING);
    for (let k = 0; k < initial; k++) {
      const spot = this.waitSpot(s.stop);
      this.spawn(s, spot, null, 'wait');
    }
  }

  private release(s: StopState): void {
    s.active = false;
    for (const r of s.riders) r.c.dispose();
    s.riders = [];
  }

  private spawn(s: StopState, from: TilePoint, to: TilePoint | null, then: Rider['then']): void {
    const c = new Character3D((x, y) => this.grid.tileAt(x, y), from.x, from.y);
    void c.load(`character-${MODELS[Math.floor(Math.random() * MODELS.length)]}`);
    this.group.add(c.root);
    s.riders.push({ c, target: to, then });
  }

  private walk(r: Rider, dt: number): void {
    if (!r.target) {
      r.c.setTarget(r.c.tileX, r.c.tileY, false);
      r.c.update(dt);
      return;
    }
    const dx = r.target.x - r.c.tileX;
    const dy = r.target.y - r.c.tileY;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.06) {
      r.target = null;
      r.c.setTarget(r.c.tileX, r.c.tileY, false);
    } else {
      const step = Math.min(dist, WALK_SPEED * dt);
      r.c.setTarget(r.c.tileX + (dx / dist) * step, r.c.tileY + (dy / dist) * step, true);
    }
    r.c.update(dt);
  }

  private waitSpot(stop: RiderStop): TilePoint {
    const off = (Math.random() - 0.5) * 2 * stop.spread;
    const side = (Math.random() - 0.5) * 0.3;
    return stop.axis === 'x' ? { x: stop.wait.x + off, y: stop.wait.y + side } : { x: stop.wait.x + side, y: stop.wait.y + off };
  }

  /** Une case praticable à quelques pas de l'arrêt (d'où l'on vient, où l'on va). */
  private awayFrom(stop: RiderStop): TilePoint {
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 3;
      const p = { x: Math.round(stop.wait.x + Math.cos(a) * r), y: Math.round(stop.wait.y + Math.sin(a) * r) };
      if (this.grid.isWalkable(p.x, p.y)) return p;
    }
    return this.waitSpot(stop);
  }
}
