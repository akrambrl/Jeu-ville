/**
 * Une partie de cache-cache, du salon d'attente aux résultats. Logique pure
 * (temps et hasard injectés) : le serveur la fait tourner dans sa room, la démo
 * solo dans la page. Les clients n'envoient que des intentions (aller ici,
 * entrer dans cette cachette, fouiller celle-là, désigner ce joueur) ; tout est
 * vérifié ici.
 */
import { HIDE_SEEK } from '../config/hideSeek.js';
import { MOVEMENT } from '../config/balance.js';
import { MapGrid } from '../map/grid.js';
import { TileOccupancy, nearestFreeTile, pathAvoiding, stepWalker, type Walker } from '../map/occupancy.js';
import type { PasserbyLook } from '../map/passersby.js';
import type { TilePoint } from '../map/types.js';
import type { Arena } from './arena.js';
import { rankSpotsForBot } from './bots.js';
import { splitRoles } from './roles.js';
import { canSee } from './sight.js';
import { hidingSpots, spotBlocksTile, type HidingSpot } from './spots.js';

export type HideSeekPhase = 'lobby' | 'hiding' | 'seeking' | 'ended';
/** 'none' : au salon, ou arrivé en cours de partie (spectateur jusqu'à la suivante). */
export type HideSeekRole = 'none' | 'hider' | 'seeker';
export type ParticipantStatus = 'lobby' | 'playing' | 'eliminated' | 'spectating';
export type HideSeekWinner = '' | 'hiders' | 'seekers';

interface BotBrain {
  targetSpot: string | null;
  spotted: { id: string; since: number } | null;
}

export interface Participant extends Walker {
  name: string;
  look: PasserbyLook;
  bot: boolean;
  role: HideSeekRole;
  status: ParticipantStatus;
  /** Cachette occupée (caché), sinon null. */
  spotId: string | null;
  /** Prochaine fouille possible (ms). */
  searchReadyAt: number;
  /** Chercheur : joueurs trouvés pendant la partie. */
  found: number;
  /** Caché éliminé : instant (ms). */
  eliminatedAt: number | null;
  brain: BotBrain | null;
}

export type HideSeekEvent =
  | { kind: 'phase'; phase: HideSeekPhase }
  | { kind: 'eliminated'; id: string; name: string; by: string; how: 'search' | 'spotted'; x: number; y: number; spotId: string | null }
  | { kind: 'searched'; spotId: string; byId: string; by: string; found: boolean }
  | { kind: 'hint'; x: number; y: number; radius: number }
  | { kind: 'ended'; winner: Exclude<HideSeekWinner, ''> }
  | { kind: 'left'; name: string; replacedBy: string | null };

/** Ce qu'un client peut afficher d'un personnage. */
export interface BodyView {
  id: string;
  name: string;
  x: number;
  y: number;
  dir: number;
  moving: boolean;
  look: PasserbyLook;
  role: HideSeekRole;
  bot: boolean;
  /** Caché dans une cachette (seuls ses coéquipiers et les spectateurs le savent). */
  spotId: string | null;
}

/** Réponse à une intention : null si acceptée, sinon le message à afficher. */
export type IntentResult = string | null;

const BOT_LOOK = (rand: () => number): PasserbyLook => ({
  sex: rand() < 0.5 ? 'male' : 'female',
  baseLook: Math.floor(rand() * 6),
  skinTone: Math.floor(rand() * 6),
  hairColor: Math.floor(rand() * 6),
  bodyType: Math.floor(rand() * 3),
});

export class HideSeekMatch {
  readonly grid: MapGrid;
  readonly spots: HidingSpot[];
  readonly spotById: ReadonlyMap<string, HidingSpot>;
  readonly start: TilePoint;
  phase: HideSeekPhase = 'lobby';
  /** Fin de la phase en cours (ms), 0 : salon en attente de joueurs. */
  phaseEndsAt = 0;
  winner: HideSeekWinner = '';
  round = 0;
  /** Début de la recherche (ms), pour le temps tenu par chaque caché. */
  seekingStartedAt = 0;
  lastHint: { x: number; y: number; at: number } | null = null;
  readonly participants = new Map<string, Participant>();
  private readonly occupancy = new TileOccupancy();
  private readonly occupants = new Map<string, Set<string>>();
  private readonly searchedAt = new Map<string, number>();
  private nextHintAt = 0;
  private botCount = 0;

  constructor(
    arena: Arena,
    private readonly rand: () => number = Math.random,
  ) {
    this.grid = new MapGrid(arena.map);
    this.start = arena.start;
    this.spots = hidingSpots(arena.map, arena.start);
    this.spotById = new Map(this.spots.map((s) => [s.id, s]));
    for (const s of this.spots) if (spotBlocksTile(s)) this.occupancy.block(s.x, s.y);
  }

  // ---------- Joueurs ----------

  /** Un joueur réel arrive : au salon, ou spectateur si une partie est en cours. */
  join(id: string, name: string, look: PasserbyLook, now: number): Participant {
    this.leave(id, now);
    const running = this.phase === 'hiding' || this.phase === 'seeking';
    const p = this.newParticipant(id, name, look, false);
    p.status = running ? 'spectating' : 'lobby';
    this.participants.set(id, p);
    if (!running) this.placeNear(p, this.start);
    if (this.phase === 'lobby' && this.phaseEndsAt === 0) this.phaseEndsAt = now + HIDE_SEEK.phases.lobbyMs;
    return p;
  }

  /** Un joueur s'en va ; un chercheur est remplacé par un bot pour finir la partie. */
  leave(id: string, now: number): HideSeekEvent[] {
    const p = this.participants.get(id);
    if (!p) return [];
    const events: HideSeekEvent[] = [];
    this.vacate(p);
    this.participants.delete(id);
    if (this.humans().length === 0) {
      this.resetToLobby(now);
      this.phaseEndsAt = 0;
      return events;
    }
    if (this.isRunning() && p.role === 'seeker' && p.status === 'playing') {
      const bot = this.addBot();
      bot.role = 'seeker';
      bot.status = 'playing';
      this.placeNear(bot, { x: Math.round(p.x), y: Math.round(p.y) });
      bot.searchReadyAt = p.searchReadyAt;
      events.push({ kind: 'left', name: p.name, replacedBy: bot.name });
    } else if (this.isRunning() && p.role === 'hider' && p.status === 'playing') {
      events.push({ kind: 'left', name: p.name, replacedBy: null });
    }
    events.push(...this.checkWin(now));
    return events;
  }

  humans(): Participant[] {
    return [...this.participants.values()].filter((p) => !p.bot);
  }

  hidersAlive(): Participant[] {
    return [...this.participants.values()].filter((p) => p.role === 'hider' && p.status === 'playing');
  }

  hidersTotal(): number {
    return [...this.participants.values()].filter((p) => p.role === 'hider').length;
  }

  isRunning(): boolean {
    return this.phase === 'hiding' || this.phase === 'seeking';
  }

  // ---------- Intentions ----------

  move(id: string, to: TilePoint): IntentResult {
    const p = this.participants.get(id);
    if (!p || !this.hasBody(p)) return null;
    if (p.role === 'seeker' && this.phase === 'hiding') return 'Yeux fermés ! Tu pourras bouger dans un instant.';
    if (p.spotId) return 'Sors d’abord de ta cachette.';
    if (!this.grid.isWalkable(to.x, to.y)) return null;
    const goal = this.occupancy.isFree(to.x, to.y, p.id) ? to : nearestFreeTile(this.grid, this.occupancy, to, p.id);
    const path = goal ? pathAvoiding(this.grid, this.occupancy, p, goal) : null;
    if (path) p.path = path;
    return null;
  }

  hide(id: string, spotId: string): IntentResult {
    const p = this.participants.get(id);
    const spot = this.spotById.get(spotId);
    if (!p || !spot || p.role !== 'hider' || p.status !== 'playing' || !this.isRunning()) return null;
    if (p.spotId) return 'Tu es déjà caché.';
    if (Math.hypot(p.x - spot.x, p.y - spot.y) > HIDE_SEEK.enterRange) return 'Approche-toi de la cachette.';
    const inside = this.occupants.get(spotId) ?? new Set<string>();
    if (inside.size >= HIDE_SEEK.spotCapacity) return 'Cette cachette est déjà prise !';
    inside.add(id);
    this.occupants.set(spotId, inside);
    p.spotId = spotId;
    p.path = [];
    this.occupancy.releaseAll(p.id);
    p.x = spot.x;
    p.y = spot.y;
    p.tile = { x: spot.x, y: spot.y };
    return null;
  }

  leaveSpot(id: string): IntentResult {
    const p = this.participants.get(id);
    if (!p?.spotId) return null;
    const spot = this.spotById.get(p.spotId)!;
    const out = nearestFreeTile(this.grid, this.occupancy, spot.access, p.id);
    if (!out) return 'La sortie est bloquée, attends un peu.';
    this.occupants.get(p.spotId)?.delete(id);
    p.spotId = null;
    this.placeAt(p, out);
    return null;
  }

  search(id: string, spotId: string, now: number): { error: IntentResult; events: HideSeekEvent[] } {
    const p = this.participants.get(id);
    const spot = this.spotById.get(spotId);
    if (!p || !spot || p.role !== 'seeker' || p.status !== 'playing') return { error: null, events: [] };
    if (this.phase !== 'seeking') return { error: 'La recherche n’a pas encore commencé.', events: [] };
    if (now < p.searchReadyAt) return { error: `Attends encore ${Math.ceil((p.searchReadyAt - now) / 1000)} s avant de fouiller.`, events: [] };
    if (Math.hypot(p.x - spot.x, p.y - spot.y) > HIDE_SEEK.searchRange) return { error: 'Approche-toi pour fouiller.', events: [] };
    p.searchReadyAt = now + HIDE_SEEK.searchCooldownMs;
    this.searchedAt.set(spotId, now);
    const found = [...(this.occupants.get(spotId) ?? [])].map((h) => this.participants.get(h)!).filter(Boolean);
    const events: HideSeekEvent[] = [{ kind: 'searched', spotId, byId: p.id, by: p.name, found: found.length > 0 }];
    for (const h of found) events.push(this.eliminate(h, p, 'search', now));
    events.push(...this.checkWin(now));
    return { error: null, events };
  }

  /** Un chercheur désigne un caché à découvert qu'il voit. */
  tag(id: string, targetId: string, now: number): { error: IntentResult; events: HideSeekEvent[] } {
    const p = this.participants.get(id);
    const target = this.participants.get(targetId);
    if (!p || !target || p.role !== 'seeker' || p.status !== 'playing') return { error: null, events: [] };
    if (this.phase !== 'seeking') return { error: 'La recherche n’a pas encore commencé.', events: [] };
    if (target.role !== 'hider' || target.status !== 'playing' || target.spotId) return { error: null, events: [] };
    if (!canSee(this.grid, p, target, HIDE_SEEK.sightRange + HIDE_SEEK.tagTolerance)) return { error: 'Trop loin, ou caché derrière un immeuble.', events: [] };
    const events = [this.eliminate(target, p, 'spotted', now), ...this.checkWin(now)];
    return { error: null, events };
  }

  // ---------- Vues ----------

  /** Corps visible de tous : tout le monde au salon et aux résultats, les chercheurs pendant la partie. */
  isPublic(p: Participant): boolean {
    if (!this.hasBody(p)) return false;
    return !this.isRunning() || p.role === 'seeker';
  }

  /** Cachés (non publics) que `viewerId` a le droit de voir, lui compris. */
  privateBodiesFor(viewerId: string): Participant[] {
    const viewer = this.participants.get(viewerId);
    if (!viewer || !this.isRunning()) return [];
    const hiders = this.hidersAlive();
    if (viewer.role === 'seeker' && viewer.status === 'playing') {
      if (this.phase !== 'seeking') return [];
      return hiders.filter((h) => !h.spotId && canSee(this.grid, viewer, h, HIDE_SEEK.sightRange));
    }
    // Cachés (coéquipiers), éliminés et spectateurs voient tous les cachés.
    return hiders;
  }

  bodyView(p: Participant): BodyView {
    return {
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      dir: p.dir,
      moving: p.path.length > 0 && p.blockedMs === 0,
      look: p.look,
      role: p.role,
      bot: p.bot,
      spotId: p.spotId,
    };
  }

  // ---------- Simulation ----------

  tick(dtMs: number, now: number): HideSeekEvent[] {
    const events: HideSeekEvent[] = [];
    for (const p of this.participants.values()) {
      if (!this.hasBody(p) || p.spotId || p.path.length === 0) continue;
      const speed = MOVEMENT.walkTilesPerSecond * (p.bot ? HIDE_SEEK.bots.speedFactor : 1);
      stepWalker(this.grid, this.occupancy, p, (speed * dtMs) / 1000, dtMs);
    }
    if (this.phase === 'seeking') {
      for (const bot of [...this.participants.values()]) {
        if (bot.bot && bot.status === 'playing' && this.phase === 'seeking') events.push(...this.botThink(bot, now));
      }
      if (this.phase === 'seeking' && this.nextHintAt > 0 && now >= this.nextHintAt) {
        this.nextHintAt += HIDE_SEEK.hints.everyMs;
        // Pas d'indice à la toute fin : la partie se termine.
        const hint = now < this.phaseEndsAt ? this.makeHint(now) : null;
        if (hint) events.push(hint);
      }
    }
    if (this.phaseEndsAt > 0 && now >= this.phaseEndsAt) events.push(...this.advancePhase(now));
    return events;
  }

  private advancePhase(now: number): HideSeekEvent[] {
    switch (this.phase) {
      case 'lobby':
        return this.humans().length > 0 ? this.startMatch(now) : [];
      case 'hiding':
        this.phase = 'seeking';
        this.seekingStartedAt = now;
        this.phaseEndsAt = now + HIDE_SEEK.phases.seekingMs;
        this.nextHintAt = now + HIDE_SEEK.hints.everyMs;
        return [{ kind: 'phase', phase: 'seeking' }];
      case 'seeking':
        return this.end('hiders', now);
      case 'ended':
        this.resetToLobby(now);
        return [{ kind: 'phase', phase: 'lobby' }];
    }
  }

  private startMatch(now: number): HideSeekEvent[] {
    const humans = this.humans();
    // Tirage au sort des rôles.
    for (let k = humans.length - 1; k > 0; k--) {
      const j = Math.floor(this.rand() * (k + 1));
      [humans[k], humans[j]] = [humans[j]!, humans[k]!];
    }
    const split = splitRoles(humans.length);
    humans.forEach((p, k) => {
      p.role = k < split.seekers ? 'seeker' : 'hider';
      p.status = 'playing';
      p.found = 0;
      p.eliminatedAt = null;
      p.searchReadyAt = 0;
      p.spotId = null;
    });
    for (let k = 0; k < split.bots; k++) {
      const bot = this.addBot();
      bot.role = 'seeker';
      bot.status = 'playing';
    }
    // Tout le monde part du même endroit (place Jeanne-d'Arc).
    for (const p of this.participants.values()) {
      this.vacate(p);
      this.placeNear(p, this.start);
      p.path = [];
    }
    this.occupants.clear();
    this.searchedAt.clear();
    this.lastHint = null;
    this.nextHintAt = 0;
    this.winner = '';
    this.round += 1;
    this.phase = 'hiding';
    this.phaseEndsAt = now + HIDE_SEEK.phases.hidingMs;
    return [{ kind: 'phase', phase: 'hiding' }];
  }

  private end(winner: Exclude<HideSeekWinner, ''>, now: number): HideSeekEvent[] {
    this.winner = winner;
    this.phase = 'ended';
    this.phaseEndsAt = now + HIDE_SEEK.phases.resultsMs;
    this.nextHintAt = 0;
    // Les cachés encore cachés sortent de leur cachette : tout le monde les voit.
    for (const p of this.participants.values()) {
      if (p.spotId) this.leaveSpot(p.id);
      p.path = [];
    }
    return [{ kind: 'ended', winner }];
  }

  private resetToLobby(now: number): void {
    for (const p of [...this.participants.values()]) {
      if (p.bot) {
        this.vacate(p);
        this.participants.delete(p.id);
        continue;
      }
      const hadBody = this.hasBody(p);
      if (p.spotId) this.leaveSpot(p.id);
      p.role = 'none';
      p.status = 'lobby';
      p.found = 0;
      p.eliminatedAt = null;
      if (!hadBody) this.placeNear(p, this.start);
    }
    this.occupants.clear();
    this.phase = 'lobby';
    this.winner = '';
    this.phaseEndsAt = this.humans().length > 0 ? now + HIDE_SEEK.phases.lobbyMs : 0;
  }

  private checkWin(now: number): HideSeekEvent[] {
    if (!this.isRunning() || this.hidersAlive().length > 0) return [];
    return this.end('seekers', now);
  }

  private eliminate(h: Participant, by: Participant, how: 'search' | 'spotted', now: number): HideSeekEvent {
    const event: HideSeekEvent = { kind: 'eliminated', id: h.id, name: h.name, by: by.name, how, x: h.x, y: h.y, spotId: h.spotId };
    this.vacate(h);
    h.status = 'eliminated';
    h.eliminatedAt = now;
    by.found += 1;
    return event;
  }

  private makeHint(now: number): HideSeekEvent | null {
    const alive = this.hidersAlive();
    if (alive.length === 0) return null;
    const h = alive[Math.floor(this.rand() * alive.length)]!;
    const angle = this.rand() * Math.PI * 2;
    const r = this.rand() * HIDE_SEEK.hints.maxOffset;
    const x = Math.min(this.grid.width - 1, Math.max(0, Math.round(h.x + Math.cos(angle) * r)));
    const y = Math.min(this.grid.height - 1, Math.max(0, Math.round(h.y + Math.sin(angle) * r)));
    this.lastHint = { x, y, at: now };
    return { kind: 'hint', x, y, radius: HIDE_SEEK.hints.radius };
  }

  // ---------- Bots chercheurs ----------

  private botThink(bot: Participant, now: number): HideSeekEvent[] {
    const brain = (bot.brain ??= { targetSpot: null, spotted: null });
    // 1. Un caché à découvert en vue : après un temps de réaction, il le désigne.
    const seen = this.hidersAlive()
      .filter((h) => !h.spotId && canSee(this.grid, bot, h, HIDE_SEEK.sightRange))
      .sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) - Math.hypot(b.x - bot.x, b.y - bot.y))[0];
    if (seen) {
      if (brain.spotted?.id !== seen.id) brain.spotted = { id: seen.id, since: now };
      if (now - brain.spotted.since >= HIDE_SEEK.bots.reactionMs) {
        brain.spotted = null;
        return this.tag(bot.id, seen.id, now).events;
      }
      return [];
    }
    brain.spotted = null;
    // 2. Arrivé près de la cachette visée : il la fouille dès qu'il peut.
    const target = brain.targetSpot ? this.spotById.get(brain.targetSpot) : undefined;
    if (target) {
      const near = Math.hypot(bot.x - target.x, bot.y - target.y) <= HIDE_SEEK.searchRange;
      if (near && now >= bot.searchReadyAt) {
        brain.targetSpot = null;
        return this.search(bot.id, target.id, now).events;
      }
      if (near || bot.path.length > 0) return [];
      brain.targetSpot = null;
    }
    // 3. Choisir la prochaine cachette.
    const hint = this.lastHint && now - this.lastHint.at <= HIDE_SEEK.bots.hintMemoryMs ? this.lastHint : null;
    const claimed = new Set([...this.participants.values()].filter((o) => o !== bot && o.brain?.targetSpot).map((o) => o.brain!.targetSpot!));
    const ranked = rankSpotsForBot(this.spots, bot, { now, hint, searchedAt: this.searchedAt, claimed });
    const choices = ranked.slice(0, HIDE_SEEK.bots.choiceAmong);
    while (choices.length > 0) {
      const pick = choices.splice(Math.floor(this.rand() * choices.length), 1)[0]!;
      const goal = nearestFreeTile(this.grid, this.occupancy, pick.access, bot.id);
      const path = goal ? pathAvoiding(this.grid, this.occupancy, bot, goal, HIDE_SEEK.bots.maxPathLength) : null;
      if (path) {
        bot.path = path;
        brain.targetSpot = pick.id;
        break;
      }
    }
    return [];
  }

  // ---------- Outils ----------

  private hasBody(p: Participant): boolean {
    return p.status === 'lobby' || p.status === 'playing';
  }

  private newParticipant(id: string, name: string, look: PasserbyLook, bot: boolean): Participant {
    return {
      id,
      name,
      look,
      bot,
      x: this.start.x,
      y: this.start.y,
      dir: 2,
      path: [],
      tile: { ...this.start },
      blockedMs: 0,
      role: 'none',
      status: 'lobby',
      spotId: null,
      searchReadyAt: 0,
      found: 0,
      eliminatedAt: null,
      brain: bot ? { targetSpot: null, spotted: null } : null,
    };
  }

  private addBot(): Participant {
    const names = HIDE_SEEK.bots.names;
    const used = new Set([...this.participants.values()].filter((p) => p.bot).map((p) => p.name));
    const name = names.find((n) => !used.has(n)) ?? `Bot ${this.botCount + 1}`;
    const bot = this.newParticipant(`seeker-bot-${++this.botCount}`, name, BOT_LOOK(this.rand), true);
    this.participants.set(bot.id, bot);
    return bot;
  }

  /** Retire le perso de la carte (cases tenues, cachette). */
  private vacate(p: Participant): void {
    this.occupancy.releaseAll(p.id);
    if (p.spotId) this.occupants.get(p.spotId)?.delete(p.id);
    p.spotId = null;
    p.path = [];
  }

  private placeNear(p: Participant, at: TilePoint): void {
    this.occupancy.releaseAll(p.id);
    const tile = nearestFreeTile(this.grid, this.occupancy, at, p.id, 8) ?? this.grid.nearestWalkable(at) ?? at;
    this.placeAt(p, tile);
  }

  private placeAt(p: Participant, tile: TilePoint): void {
    this.occupancy.releaseAll(p.id);
    this.occupancy.tryHold(p.id, tile.x, tile.y);
    p.x = tile.x;
    p.y = tile.y;
    p.tile = { x: tile.x, y: tile.y };
    p.path = [];
    p.blockedMs = 0;
  }
}
