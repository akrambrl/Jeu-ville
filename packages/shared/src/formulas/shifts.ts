/**
 * Déroulé d'un service (suite de missions) : livraisons à une adresse dans un
 * délai, ou commandes au comptoir. Même logique sur le serveur et dans la démo ;
 * c'est l'appelant qui paie (journal) quand une mission réussit.
 */
import { JOBS } from '../config/balance.js';
import type { DistrictMap, TilePoint } from '../map/types.js';
import type { MissionView } from '../protocol/index.js';
import { counterOrder, deliveryDeadlineMs, missionPayCents, sameOrder, type Employer } from './jobs.js';

export interface MissionResult {
  /** Mission réussie : salaire à verser (0 si ratée). */
  payCents: number;
  /** Clé unique de la mission (idempotence du paiement). */
  key: string;
  /** Message à afficher. */
  text: string;
}

interface Courier {
  kind: 'courier';
  target: TilePoint;
  address: string;
  startedAt: number;
  deadline: number;
}

interface Counter {
  kind: 'counter';
  order: string[];
  askedAt: number;
}

export class Shift {
  index = 0;
  succeeded = 0;
  earnedCents = 0;
  private mission: Courier | Counter | null = null;
  readonly total: number;

  constructor(
    readonly id: string,
    readonly employer: Employer,
    private readonly xp: number,
    private readonly map: DistrictMap,
    private readonly rand: () => number = Math.random,
  ) {
    this.total = JOBS[employer.jobType].missionsPerShift;
  }

  get done(): boolean {
    return this.index >= this.total;
  }

  /** Lance la mission suivante depuis la position `from`. */
  next(from: TilePoint, nowMs: number): void {
    if (this.done) {
      this.mission = null;
      return;
    }
    if (this.employer.jobType === 'courier') {
      const [min, max] = JOBS.courier.distance;
      const candidates = this.map.properties.filter((p) => {
        const d = Math.hypot(p.door.x - from.x, p.door.y - from.y);
        return p.kind !== 'local' && d >= min && d <= max;
      });
      const spot = candidates[Math.floor(this.rand() * candidates.length)] ?? this.map.properties[0]!;
      const distance = Math.hypot(spot.door.x - from.x, spot.door.y - from.y);
      this.mission = { kind: 'courier', target: spot.door, address: spot.name, startedAt: nowMs, deadline: nowMs + deliveryDeadlineMs(distance) };
    } else {
      this.mission = { kind: 'counter', order: counterOrder(this.rand), askedAt: nowMs };
    }
  }

  /** Suivi du temps et de la position ; renvoie un résultat quand la mission se termine. */
  tick(pos: TilePoint, nowMs: number): MissionResult | null {
    const m = this.mission;
    if (!m) return null;
    if (m.kind === 'courier') {
      if (Math.hypot(pos.x - m.target.x, pos.y - m.target.y) <= JOBS.courier.reach) {
        const early = nowMs - m.startedAt < (m.deadline - m.startedAt) / 2;
        return this.finish(true, early, pos, nowMs, early ? 'Livré en avance : pourboire !' : 'Livré !');
      }
      if (nowMs > m.deadline) return this.finish(false, false, pos, nowMs, 'Trop tard : le client a annulé sa commande.');
      return null;
    }
    if (nowMs - m.askedAt > JOBS.counter.customerTimeoutMs) return this.finish(false, false, pos, nowMs, 'Le client en a eu assez d’attendre.');
    return null;
  }

  /** Comptoir : on sert des articles au client actuel. */
  serve(items: string[], pos: TilePoint, nowMs: number): MissionResult | null {
    const m = this.mission;
    if (!m || m.kind !== 'counter') return null;
    if (!sameOrder(m.order, items)) return this.finish(false, false, pos, nowMs, 'Ce n’est pas la bonne commande…');
    const fast = nowMs - m.askedAt <= JOBS.counter.tipBeforeMs;
    return this.finish(true, fast, pos, nowMs, fast ? 'Servi vite : pourboire !' : 'Client servi.');
  }

  private finish(ok: boolean, tip: boolean, pos: TilePoint, nowMs: number, text: string): MissionResult {
    const pay = ok ? missionPayCents(this.employer.jobType, this.xp, tip) : 0;
    const key = `${this.id}:${this.index}`;
    this.index++;
    if (ok) {
      this.succeeded++;
      this.earnedCents += pay;
    }
    this.next(pos, nowMs);
    return { payCents: pay, key, text };
  }

  view(nowMs: number): MissionView {
    const m = this.mission;
    if (!m) return { kind: 'done', earnedCents: this.earnedCents, succeeded: this.succeeded, total: this.total };
    const base = { index: this.index + 1, total: this.total, earnedCents: this.earnedCents };
    if (m.kind === 'courier') return { kind: 'courier', ...base, target: m.target, address: m.address, remainingMs: Math.max(0, m.deadline - nowMs) };
    return { kind: 'counter', ...base, order: m.order, remainingMs: Math.max(0, m.askedAt + JOBS.counter.customerTimeoutMs - nowMs) };
  }
}
