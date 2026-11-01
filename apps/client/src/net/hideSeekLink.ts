/**
 * Lien entre l'affichage du cache-cache et la partie : le serveur (Colyseus)
 * en jeu normal, ou une partie simulée dans la page pour la démo solo.
 */
import type { Room } from 'colyseus.js';
import {
  HideSeekClientMessage,
  HideSeekMatch,
  HideSeekServerMessage,
  getArena,
  type BodyView,
  type HideSeekEvent,
  type HideSeekPhase,
  type HideSeekRole,
  type HideSeekWinner,
  type MoveMessage,
  type Notice,
  type ParticipantStatus,
  type PasserbyLook,
  type SpotIntentMessage,
  type TagMessage,
  type TilePoint,
} from '@jeu-ville/shared';
import type { PlayerHandlers, PlayerView } from './link.js';

export interface RosterView {
  id: string;
  name: string;
  role: HideSeekRole;
  status: ParticipantStatus;
  bot: boolean;
  found: number;
}

export interface HideSeekSnapshot {
  phase: HideSeekPhase;
  /** Secondes restantes dans la phase (0 au salon : on attend des joueurs). */
  remainingS: number;
  round: number;
  winner: HideSeekWinner;
  hidersAlive: number;
  hidersTotal: number;
  roster: RosterView[];
}

/** Ce que l'on sait de son propre perso (caché dans une cachette ?). */
export interface SelfBody {
  x: number;
  y: number;
  spotId: string | null;
}

export interface HideSeekLink {
  readonly sessionId: string;
  move(to: TilePoint): void;
  hide(spotId: string): void;
  leaveSpot(): void;
  search(spotId: string): void;
  tag(targetId: string): void;
  /** Persos visibles par ce joueur (les autorisés seulement), pour la vue 3D. */
  subscribePlayers(handlers: PlayerHandlers): void;
  /** Persos visibles, en vrac (cachettes occupées vues par les coéquipiers…). */
  onBodies(cb: (bodies: BodyView[]) => void): void;
  onState(cb: (s: HideSeekSnapshot) => void): void;
  onEvent(cb: (e: HideSeekEvent) => void): void;
  onNotice(cb: (n: Notice) => void): void;
  onDisconnected(cb: () => void): void;
}

/** Un perso tel que la vue 3D l'affiche. */
function playerViewOf(b: BodyView): PlayerView {
  return {
    id: b.id,
    // Les chercheurs ont une lampe torche à côté du nom.
    name: b.role === 'seeker' ? `🔦 ${b.name}` : b.name,
    x: b.x,
    y: b.y,
    dir: b.dir,
    moving: b.moving,
    ...b.look,
    pet: '',
    vehicle: '',
    hidden: b.spotId !== null,
  };
}

/**
 * Rassemble les persos visibles (état commun + cachés autorisés) et annonce à la
 * vue qui apparaît, bouge ou disparaît.
 */
class BodyFeed {
  private handlers: PlayerHandlers | null = null;
  private readonly shown = new Map<string, string>();
  private readonly listeners: ((bodies: BodyView[]) => void)[] = [];
  private last: BodyView[] = [];

  subscribe(h: PlayerHandlers): void {
    this.handlers = h;
    this.shown.clear();
    this.update(this.last);
  }

  onBodies(cb: (bodies: BodyView[]) => void): void {
    this.listeners.push(cb);
    cb(this.last);
  }

  update(bodies: BodyView[]): void {
    this.last = bodies;
    for (const cb of this.listeners) cb(bodies);
    const h = this.handlers;
    if (!h) return;
    const seen = new Set<string>();
    for (const b of bodies) {
      seen.add(b.id);
      const view = playerViewOf(b);
      const key = JSON.stringify(view);
      const before = this.shown.get(b.id);
      if (before === key) continue;
      // Un perso dont le rôle (donc l'étiquette) change est recréé.
      const relabel = before !== undefined && JSON.parse(before).name !== view.name;
      if (relabel) h.removed(b.id);
      if (before === undefined || relabel) h.added(b.id, view);
      else h.changed(b.id, view);
      this.shown.set(b.id, key);
    }
    for (const id of [...this.shown.keys()]) {
      if (seen.has(id)) continue;
      this.shown.delete(id);
      h.removed(id);
    }
  }
}

interface BodySchema {
  id: string;
  name: string;
  x: number;
  y: number;
  dir: number;
  moving: boolean;
  sex: string;
  baseLook: number;
  skinTone: number;
  hairColor: number;
  bodyType: number;
  role: string;
  bot: boolean;
}

interface StateSchema {
  phase: string;
  remainingS: number;
  round: number;
  winner: string;
  hidersAlive: number;
  hidersTotal: number;
  bodies: Map<string, BodySchema>;
  roster: Map<string, { name: string; role: string; status: string; bot: boolean; found: number }>;
}

/** Partie sur le serveur, qui fait autorité. */
export class ColyseusHideSeekLink implements HideSeekLink {
  private readonly feed = new BodyFeed();
  private sight: BodyView[] = [];

  constructor(private readonly room: Room) {
    room.onMessage(HideSeekServerMessage.sight, (bodies: BodyView[]) => {
      this.sight = bodies;
      this.refresh();
    });
    room.onStateChange(() => this.refresh());
  }

  get sessionId(): string {
    return this.room.sessionId;
  }

  private refresh(): void {
    const state = this.room.state as StateSchema | undefined;
    const pub: BodyView[] = [...(state?.bodies?.values() ?? [])].map((b) => ({
      id: b.id,
      name: b.name,
      x: b.x,
      y: b.y,
      dir: b.dir,
      moving: b.moving,
      look: { sex: b.sex === 'female' ? 'female' : 'male', baseLook: b.baseLook, skinTone: b.skinTone, hairColor: b.hairColor, bodyType: b.bodyType },
      role: b.role as HideSeekRole,
      bot: b.bot,
      spotId: null,
    }));
    const ids = new Set(pub.map((b) => b.id));
    this.feed.update([...pub, ...this.sight.filter((b) => !ids.has(b.id))]);
  }

  move(to: TilePoint): void {
    this.room.send(HideSeekClientMessage.move, { x: to.x, y: to.y } satisfies MoveMessage);
  }

  hide(spotId: string): void {
    this.room.send(HideSeekClientMessage.hide, { spotId } satisfies SpotIntentMessage);
  }

  leaveSpot(): void {
    this.room.send(HideSeekClientMessage.leaveSpot, {});
  }

  search(spotId: string): void {
    this.room.send(HideSeekClientMessage.search, { spotId } satisfies SpotIntentMessage);
  }

  tag(targetId: string): void {
    this.room.send(HideSeekClientMessage.tag, { targetId } satisfies TagMessage);
  }

  subscribePlayers(h: PlayerHandlers): void {
    this.feed.subscribe(h);
  }

  onBodies(cb: (bodies: BodyView[]) => void): void {
    this.feed.onBodies(cb);
  }

  onState(cb: (s: HideSeekSnapshot) => void): void {
    const emit = () => {
      const s = this.room.state as StateSchema | undefined;
      // Le premier état n'est peut-être pas encore arrivé.
      if (!s?.phase) return;
      cb({
        phase: s.phase as HideSeekPhase,
        remainingS: s.remainingS,
        round: s.round,
        winner: s.winner as HideSeekWinner,
        hidersAlive: s.hidersAlive,
        hidersTotal: s.hidersTotal,
        roster: [...(s.roster?.entries() ?? [])].map(([id, r]) => ({
          id,
          name: r.name,
          role: r.role as HideSeekRole,
          status: r.status as ParticipantStatus,
          bot: r.bot,
          found: r.found,
        })),
      });
    };
    this.room.onStateChange(emit);
    emit();
  }

  onEvent(cb: (e: HideSeekEvent) => void): void {
    this.room.onMessage(HideSeekServerMessage.event, cb);
  }

  onNotice(cb: (n: Notice) => void): void {
    this.room.onMessage(HideSeekServerMessage.notice, cb);
  }

  onDisconnected(cb: () => void): void {
    this.room.onLeave((code) => {
      if (code !== 1000) cb();
    });
  }
}

/** Identifiant du joueur dans la démo solo. */
const LOCAL_ID = 'me';
/** Pas de simulation de la démo (ms), et pas maximal (onglet en arrière-plan). */
const LOCAL_TICK_MS = 100;
const LOCAL_MAX_TICK_MS = 1_000;

/**
 * Démo solo : la même partie, simulée dans la page. Le joueur se cache, les
 * chercheurs sont des bots.
 */
export class LocalHideSeekLink implements HideSeekLink {
  readonly sessionId = LOCAL_ID;
  private readonly match = new HideSeekMatch(getArena());
  private readonly feed = new BodyFeed();
  private stateCbs: ((s: HideSeekSnapshot) => void)[] = [];
  private eventCbs: ((e: HideSeekEvent) => void)[] = [];
  private noticeCbs: ((n: Notice) => void)[] = [];
  private last = Date.now();

  constructor(name: string, look: PasserbyLook) {
    this.match.join(LOCAL_ID, name, look, Date.now());
    window.setInterval(() => this.step(), LOCAL_TICK_MS);
    queueMicrotask(() => this.publish([]));
  }

  private step(): void {
    const now = Date.now();
    const dt = Math.min(LOCAL_MAX_TICK_MS, now - this.last);
    this.last = now;
    this.publish(this.match.tick(dt, now));
  }

  private publish(events: HideSeekEvent[]): void {
    for (const e of events) for (const cb of this.eventCbs) cb(e);
    const m = this.match;
    const pub = [...m.participants.values()].filter((p) => m.isPublic(p));
    const priv = m.privateBodiesFor(LOCAL_ID).filter((p) => !pub.includes(p));
    this.feed.update([...pub, ...priv].map((p) => m.bodyView(p)));
    const snapshot: HideSeekSnapshot = {
      phase: m.phase,
      remainingS: m.phaseEndsAt > 0 ? Math.max(0, Math.ceil((m.phaseEndsAt - Date.now()) / 1000)) : 0,
      round: m.round,
      winner: m.winner,
      hidersAlive: m.hidersAlive().length,
      hidersTotal: m.hidersTotal(),
      roster: [...m.participants.values()].map((p) => ({ id: p.id, name: p.name, role: p.role, status: p.status, bot: p.bot, found: p.found })),
    };
    for (const cb of this.stateCbs) cb(snapshot);
  }

  private reply(error: string | null): void {
    if (error) for (const cb of this.noticeCbs) cb({ level: 'error', text: error });
  }

  move(to: TilePoint): void {
    this.reply(this.match.move(LOCAL_ID, to));
  }

  hide(spotId: string): void {
    this.reply(this.match.hide(LOCAL_ID, spotId));
    this.publish([]);
  }

  leaveSpot(): void {
    this.reply(this.match.leaveSpot(LOCAL_ID));
    this.publish([]);
  }

  search(spotId: string): void {
    const { error, events } = this.match.search(LOCAL_ID, spotId, Date.now());
    this.reply(error);
    this.publish(events);
  }

  tag(targetId: string): void {
    const { error, events } = this.match.tag(LOCAL_ID, targetId, Date.now());
    this.reply(error);
    this.publish(events);
  }

  subscribePlayers(h: PlayerHandlers): void {
    this.feed.subscribe(h);
  }

  onBodies(cb: (bodies: BodyView[]) => void): void {
    this.feed.onBodies(cb);
  }

  onState(cb: (s: HideSeekSnapshot) => void): void {
    this.stateCbs.push(cb);
  }

  onEvent(cb: (e: HideSeekEvent) => void): void {
    this.eventCbs.push(cb);
  }

  onNotice(cb: (n: Notice) => void): void {
    this.noticeCbs.push(cb);
  }

  onDisconnected(): void {
    /* rien : tout est dans la page */
  }
}
