/**
 * Déroulé d'un service (suite de missions) : livraisons à une adresse dans un
 * délai, ou commandes au comptoir. Même logique sur le serveur et dans la démo ;
 * c'est l'appelant qui paie (journal) quand une mission réussit.
 */
import { JOBS } from '../config/balance.js';
import { COOKING, type Recipe } from '../config/cooking.js';
import type { DistrictMap, TilePoint } from '../map/types.js';
import type { MissionView } from '../protocol/index.js';
import { cookStars, pickDish, tipShare, validCooking } from './cooking.js';
import { counterOrder, deliveryDeadlineMs, missionPayCents, sameOrder, type Employer } from './jobs.js';

export interface MissionResult {
  /** Mission réussie : salaire à verser (0 si ratée). */
  payCents: number;
  /** Clé unique de la mission (idempotence du paiement). */
  key: string;
  /** Message à afficher. */
  text: string;
  /** Plat cuisiné : sa note. */
  stars?: 1 | 2 | 3;
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

/** Son propre commerce de bouche : le client commande un plat qu'on cuisine. */
interface Cook {
  kind: 'cook';
  dish: Recipe;
  askedAt: number;
}

export class Shift {
  index = 0;
  succeeded = 0;
  earnedCents = 0;
  private mission: Courier | Counter | Cook | null = null;
  readonly total: number;

  constructor(
    readonly id: string,
    readonly employer: Employer,
    private readonly xp: number,
    private readonly map: DistrictMap,
    private readonly rand: () => number = Math.random,
    /** Gain d'une mission réussie selon la part du pourboire méritée, 0 à 1 (par défaut : le salaire du métier). */
    private readonly payFor: (tipShare: number) => number = (share) => missionPayCents(employer.jobType, xp, share >= 1),
    /** Type de son propre commerce de bouche : les clients commandent des plats à cuisiner. */
    private readonly kitchen?: string,
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
      const dish = this.kitchen ? pickDish(this.kitchen, this.rand) : undefined;
      this.mission = dish ? { kind: 'cook', dish, askedAt: nowMs } : { kind: 'counter', order: counterOrder(this.rand), askedAt: nowMs };
    }
  }

  /** Suivi du temps et de la position ; renvoie un résultat quand la mission se termine. */
  tick(pos: TilePoint, nowMs: number): MissionResult | null {
    const m = this.mission;
    if (!m) return null;
    if (m.kind === 'courier') {
      if (Math.hypot(pos.x - m.target.x, pos.y - m.target.y) <= JOBS.courier.reach) {
        const early = nowMs - m.startedAt < (m.deadline - m.startedAt) / 2;
        return this.finish(true, early ? 1 : 0, pos, nowMs, early ? 'Livré en avance : pourboire !' : 'Livré !');
      }
      if (nowMs > m.deadline) return this.finish(false, 0, pos, nowMs, 'Trop tard : le client a annulé sa commande.');
      return null;
    }
    const timeout = m.kind === 'cook' ? COOKING.customerTimeoutMs : JOBS.counter.customerTimeoutMs;
    if (nowMs - m.askedAt > timeout) return this.finish(false, 0, pos, nowMs, 'Le client en a eu assez d’attendre.');
    return null;
  }

  /** Comptoir : on sert des articles au client actuel. */
  serve(items: string[], pos: TilePoint, nowMs: number): MissionResult | null {
    const m = this.mission;
    if (!m || m.kind !== 'counter') return null;
    if (!sameOrder(m.order, items)) return this.finish(false, 0, pos, nowMs, 'Ce n’est pas la bonne commande…');
    const fast = nowMs - m.askedAt <= JOBS.counter.tipBeforeMs;
    return this.finish(true, fast ? 1 : 0, pos, nowMs, fast ? 'Servi vite : pourboire !' : 'Client servi.');
  }

  /** Son commerce : on sert le plat cuisiné, avec la note de chaque étape (0 à 1). */
  cook(dishId: string, scores: number[], pos: TilePoint, nowMs: number): MissionResult | null {
    const m = this.mission;
    if (!m || m.kind !== 'cook') return null;
    if (dishId !== m.dish.id || !validCooking(m.dish, scores, nowMs - m.askedAt)) {
      return this.finish(false, 0, pos, nowMs, 'Ce n’est pas ce que le client a commandé…');
    }
    const stars = cookStars(scores);
    const text = stars === 3 ? `${m.dish.label} parfait ! ⭐⭐⭐ Gros pourboire !` : stars === 2 ? `${m.dish.label} réussi ⭐⭐ : pourboire.` : `${m.dish.label} servi ⭐… le client n’est pas emballé.`;
    return { ...this.finish(true, tipShare(stars), pos, nowMs, text), stars };
  }

  private finish(ok: boolean, tip: number, pos: TilePoint, nowMs: number, text: string): MissionResult {
    const pay = ok ? this.payFor(tip) : 0;
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
    if (m.kind === 'cook') return { kind: 'cook', ...base, dish: m.dish.id, remainingMs: Math.max(0, m.askedAt + COOKING.customerTimeoutMs - nowMs) };
    return { kind: 'counter', ...base, order: m.order, remainingMs: Math.max(0, m.askedAt + JOBS.counter.customerTimeoutMs - nowMs) };
  }
}
