/**
 * Missions du quotidien : qui demande de l'aide aujourd'hui et où (même liste
 * pour tous les joueurs du quartier, tirée à partir de la date), déroulé d'une
 * mission (étapes à atteindre), et bonté (bonus de bonheur qui s'estompe).
 * Même logique sur le serveur et dans la démo ; c'est l'appelant qui récompense.
 */
import { ERRANDS, ERRAND_TYPES, type ErrandType } from '../config/errands.js';
import { HAIR_COLORS, SKIN_TONES } from '../config/characters.js';
import type { DistrictMap, TilePoint } from '../map/types.js';
import { clampGauge } from './gauges.js';
import { REAL_MS_PER_HOUR } from '../time/index.js';

export interface ErrandGiver extends TilePoint {
  name: string;
  sex: 'male' | 'female';
  baseLook: number;
  skinTone: number;
  hairColor: number;
}

export interface ErrandOffer {
  /** `<jour>:<n>` : unique dans le quartier pour la journée. */
  id: string;
  type: ErrandType;
  giver: ErrandGiver;
  /** Ce qu'il faut atteindre (chien, portefeuille, porte de mamie) ; null : chez soi (outils). */
  spot: TilePoint | null;
}

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function seeded(seed: string): () => number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPE_ORDER: ErrandType[] = ['lostDog', 'groceries', 'tools', 'wallet'];

/** Où chaque type de demandeur se tient : parcs, commerces, maisons, arrêts de bus… */
function anchors(map: DistrictMap, type: ErrandType): TilePoint[] {
  const pois = (kinds: string[]) => map.pois.filter((p) => kinds.includes(p.kind)).map((p) => p.entrance);
  switch (type) {
    case 'lostDog':
      return pois(['park', 'square']);
    case 'groceries':
      return pois(['supermarket', 'market', 'bakery']);
    case 'tools':
      return map.properties.filter((p) => p.kind === 'house').map((p) => p.door);
    case 'wallet':
      return [...map.transit.busStops.map((s) => ({ x: s.x, y: s.y })), ...pois(['square'])];
  }
}

/**
 * Demandes d'aide du jour dans ce quartier. `walkable` : cases praticables
 * reliées aux rues (voir reachableTiles), où l'on peut poser demandeurs et objets.
 */
export function dailyErrandOffers(map: DistrictMap, walkable: TilePoint[], dayKey: string): ErrandOffer[] {
  const rand = seeded(`${map.cityId}:${map.districtId}:${dayKey}`);
  const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(rand() * list.length)];
  const open = new Set(walkable.map((t) => `${t.x},${t.y}`));
  const used = new Set(map.vendors.map((v) => `${v.x},${v.y}`));
  const offers: ErrandOffer[] = [];
  const start = Math.floor(rand() * TYPE_ORDER.length);
  for (let k = 0; offers.length < ERRANDS.offersPerDistrict && k < ERRANDS.offersPerDistrict * 3; k++) {
    const type = TYPE_ORDER[(start + k) % TYPE_ORDER.length]!;
    const cfg = ERRAND_TYPES[type];
    const anchor = pick(anchors(map, type));
    if (!anchor) continue;
    // Le demandeur se tient sur une case libre juste à côté du lieu.
    const spotNear = walkable
      .filter((t) => Math.abs(t.x - anchor.x) <= 2 && Math.abs(t.y - anchor.y) <= 2 && !used.has(`${t.x},${t.y}`))
      .sort((a, b) => Math.hypot(a.x - anchor.x, a.y - anchor.y) - Math.hypot(b.x - anchor.x, b.y - anchor.y))[0];
    if (!spotNear || !open.has(`${spotNear.x},${spotNear.y}`)) continue;
    let spot: TilePoint | null = null;
    if (type !== 'tools') {
      const [min, max] = cfg.distance;
      const candidates =
        type === 'groceries'
          ? map.properties.filter((p) => p.kind !== 'local').map((p) => p.door)
          : walkable;
      const inRange = candidates.filter((t) => {
        const d = Math.hypot(t.x - spotNear.x, t.y - spotNear.y);
        return d >= min && d <= max && open.has(`${t.x},${t.y}`);
      });
      spot = pick(inRange) ?? null;
      if (!spot) continue;
    }
    used.add(`${spotNear.x},${spotNear.y}`);
    const who = pick(cfg.givers)!;
    offers.push({
      id: `${dayKey}:${offers.length}`,
      type,
      giver: {
        x: spotNear.x,
        y: spotNear.y,
        name: who.name,
        sex: who.sex,
        baseLook: cfg.baseLook,
        skinTone: Math.floor(rand() * SKIN_TONES.length),
        hairColor: cfg.hairColor ?? Math.floor(rand() * HAIR_COLORS.length),
      },
      spot,
    });
  }
  return offers;
}

/** Ce que l'on transporte ou ce qui nous suit pendant une étape. */
export type ErrandCarry = 'dog' | 'granny' | 'tools' | 'wallet';

interface ErrandStep {
  target: TilePoint;
  /** Étape de recherche : l'objet est à `target`, on indique seulement une zone. */
  find?: 'dog' | 'wallet';
  carry?: ErrandCarry;
}

/** Ce que le joueur voit de sa mission en cours. */
export type ErrandView =
  | {
      kind: 'active';
      offerId: string;
      type: ErrandType;
      step: number;
      steps: number;
      text: string;
      /** Cible exacte (null pendant une recherche : seule la zone est montrée). */
      target: TilePoint | null;
      /** Zone de recherche (cercle). */
      area: { x: number; y: number; r: number } | null;
      /** Objet à trouver, à afficher quand on est assez près. */
      hidden: { kind: 'dog' | 'wallet'; at: TilePoint } | null;
      carry: ErrandCarry | null;
      remainingMs: number;
    }
  | { kind: 'done'; offerId: string; type: ErrandType; rewardCents: number; kindness: number }
  | { kind: 'failed'; offerId: string; type: ErrandType; reason: string }
  | { kind: 'none' };

export class Errand {
  private readonly steps: ErrandStep[];
  private index = 0;
  private readonly deadline: number;
  private readonly area: { x: number; y: number; r: number } | null;

  constructor(
    readonly offer: ErrandOffer,
    home: TilePoint | null,
    startedAtMs: number,
  ) {
    const giver = { x: offer.giver.x, y: offer.giver.y };
    const spot = offer.spot ?? home ?? giver;
    switch (offer.type) {
      case 'lostDog':
        this.steps = [{ target: spot, find: 'dog' }, { target: giver, carry: 'dog' }];
        break;
      case 'groceries':
        this.steps = [{ target: spot, carry: 'granny' }];
        break;
      case 'tools':
        this.steps = [{ target: spot }, { target: giver, carry: 'tools' }];
        break;
      case 'wallet':
        this.steps = [{ target: spot, find: 'wallet' }, { target: giver, carry: 'wallet' }];
        break;
    }
    this.deadline = startedAtMs + ERRANDS.timeLimitMs;
    // Zone de recherche : un cercle qui contient l'objet, sans être centré dessus.
    const rand = seeded(offer.id);
    const a = rand() * Math.PI * 2;
    const off = (ERRANDS.searchRadius - 1.5) * rand();
    this.area = { x: spot.x + Math.cos(a) * off, y: spot.y + Math.sin(a) * off, r: ERRANDS.searchRadius };
  }

  /** Suivi de la position : 'done' quand la dernière étape est atteinte, 'failed' si trop tard. */
  tick(pos: TilePoint, nowMs: number): 'done' | 'failed' | null {
    if (nowMs > this.deadline) return 'failed';
    const step = this.steps[this.index]!;
    if (Math.hypot(pos.x - step.target.x, pos.y - step.target.y) > ERRANDS.reach) return null;
    this.index++;
    return this.index >= this.steps.length ? 'done' : null;
  }

  /** L'étape a changé depuis le dernier appel (pour renvoyer la vue au joueur). */
  get stepIndex(): number {
    return this.index;
  }

  view(nowMs: number): ErrandView {
    const step = this.steps[Math.min(this.index, this.steps.length - 1)]!;
    const cfg = ERRAND_TYPES[this.offer.type];
    const carriedBefore = this.steps[this.index - 1];
    return {
      kind: 'active',
      offerId: this.offer.id,
      type: this.offer.type,
      step: this.index + 1,
      steps: this.steps.length,
      text: cfg.steps[this.index] ?? cfg.steps[cfg.steps.length - 1]!,
      target: step.find ? null : step.target,
      area: step.find ? this.area : null,
      hidden: step.find ? { kind: step.find, at: step.target } : null,
      carry: step.carry ?? (carriedBefore?.find ? carriedBefore.find : null),
      remainingMs: Math.max(0, this.deadline - nowMs),
    };
  }
}

export function errandReward(type: ErrandType): { cents: number; kindness: number } {
  const cfg = ERRAND_TYPES[type];
  return { cents: cfg.rewardCents, kindness: cfg.kindness };
}

/** Bonté actuelle (bonus de bonheur), à partir de la valeur stockée et de son instant. */
export function kindnessAt(stored: number, updatedAtMs: number, nowMs: number): number {
  const hours = Math.max(0, nowMs - updatedAtMs) / REAL_MS_PER_HOUR;
  return Math.min(ERRANDS.kindness.max, Math.max(0, stored - ERRANDS.kindness.decayPerRealHour * hours));
}

/** Nouvelle bonté stockée après une bonne action (à dater de `nowMs`). */
export function addKindness(stored: number, updatedAtMs: number, nowMs: number, points: number): number {
  return Math.min(ERRANDS.kindness.max, clampGauge(kindnessAt(stored, updatedAtMs, nowMs) + points));
}
