/**
 * Cache-cache géant sur un quartier. La partie (HideSeekMatch, dans shared) fait
 * autorité ; la room ne fait que relayer les intentions validées et diffuser.
 *
 * Anti-triche : la position d'un caché n'est JAMAIS dans l'état commun. Chaque
 * client reçoit à part (message `sight`) les seuls cachés qu'il a le droit de
 * voir : un chercheur, ceux qui sont à découvert dans son champ de vision.
 */
import { Room, type Client } from '@colyseus/core';
import {
  HIDE_SEEK,
  HideSeekClientMessage,
  HideSeekMatch,
  HideSeekServerMessage,
  SERVER,
  getArena,
  hideSeekJoinSchema,
  moveSchema,
  spotIntentSchema,
  tagSchema,
  type BodyView,
  type HideSeekEvent,
  type Notice,
  type Participant,
} from '@jeu-ville/shared';
import { db } from '../db/client.js';
import { playerFromToken } from '../domain/auth.js';
import { getCharacterByPlayer } from '../domain/characters.js';
import { GameError } from '../domain/errors.js';
import { BodyState, HideSeekState, RosterEntry } from './hideSeekState.js';

interface AuthData {
  characterId: string;
  name: string;
  look: Participant['look'];
}

export class HideSeekRoom extends Room<HideSeekState> {
  override state = new HideSeekState();
  override maxClients = HIDE_SEEK.maxPlayers;
  private readonly match = new HideSeekMatch(getArena());
  /** Personnage de chaque session (une seule connexion par personnage). */
  private readonly characters = new Map<string, string>();

  override onCreate(): void {
    this.onMessage(HideSeekClientMessage.move, (client, raw) => {
      const parsed = moveSchema.safeParse(raw);
      if (parsed.success) this.reply(client, this.match.move(client.sessionId, parsed.data));
    });
    this.onMessage(HideSeekClientMessage.hide, (client, raw) => {
      const parsed = spotIntentSchema.safeParse(raw);
      if (parsed.success) this.reply(client, this.match.hide(client.sessionId, parsed.data.spotId));
      this.syncSight();
    });
    this.onMessage(HideSeekClientMessage.leaveSpot, (client) => {
      this.reply(client, this.match.leaveSpot(client.sessionId));
      this.syncSight();
    });
    this.onMessage(HideSeekClientMessage.search, (client, raw) => {
      const parsed = spotIntentSchema.safeParse(raw);
      if (!parsed.success) return;
      const { error, events } = this.match.search(client.sessionId, parsed.data.spotId, Date.now());
      this.reply(client, error);
      this.publish(events);
    });
    this.onMessage(HideSeekClientMessage.tag, (client, raw) => {
      const parsed = tagSchema.safeParse(raw);
      if (!parsed.success) return;
      const { error, events } = this.match.tag(client.sessionId, parsed.data.targetId, Date.now());
      this.reply(client, error);
      this.publish(events);
    });
    this.setSimulationInterval((dt) => this.publish(this.match.tick(dt, Date.now())), SERVER.roomTickMs);
    this.clock.setInterval(() => this.syncSight(), HIDE_SEEK.sightSyncMs);
  }

  override async onAuth(_client: Client, rawOptions: unknown): Promise<AuthData> {
    const options = hideSeekJoinSchema.parse(rawOptions);
    const player = await playerFromToken(db, options.token);
    if (!player) throw new GameError('Session invalide.', 401);
    const c = await getCharacterByPlayer(db, player.id);
    if (!c) throw new GameError("Crée d'abord ton personnage.", 403);
    return {
      characterId: c.id,
      name: c.name,
      look: { sex: c.sex === 'female' ? 'female' : 'male', baseLook: c.baseLook, skinTone: c.skinTone, hairColor: c.hairColor, bodyType: c.bodyType },
    };
  }

  override onJoin(client: Client, _options: unknown, auth: AuthData): void {
    // Une seule connexion par personnage : on remplace l'ancienne.
    for (const [sessionId, characterId] of this.characters) {
      if (characterId === auth.characterId) this.clients.find((c) => c.sessionId === sessionId)?.leave();
    }
    this.characters.set(client.sessionId, auth.characterId);
    this.match.join(client.sessionId, auth.name, auth.look, Date.now());
    this.publish([]);
    this.syncSight();
  }

  override onLeave(client: Client): void {
    this.characters.delete(client.sessionId);
    this.publish(this.match.leave(client.sessionId, Date.now()));
  }

  private reply(client: Client, error: string | null): void {
    if (error) client.send(HideSeekServerMessage.notice, { level: 'error', text: error } satisfies Notice);
  }

  /** Diffuse les événements et met à jour l'état commun. */
  private publish(events: HideSeekEvent[]): void {
    for (const e of events) this.broadcast(HideSeekServerMessage.event, e);
    this.syncState();
    if (events.length > 0) this.syncSight();
  }

  private syncState(): void {
    const m = this.match;
    const s = this.state;
    s.phase = m.phase;
    s.remainingS = m.phaseEndsAt > 0 ? Math.max(0, Math.ceil((m.phaseEndsAt - Date.now()) / 1000)) : 0;
    s.round = m.round;
    s.winner = m.winner;
    s.hidersAlive = m.hidersAlive().length;
    s.hidersTotal = m.hidersTotal();
    for (const id of [...s.bodies.keys()]) if (!m.participants.has(id) || !m.isPublic(m.participants.get(id)!)) s.bodies.delete(id);
    for (const id of [...s.roster.keys()]) if (!m.participants.has(id)) s.roster.delete(id);
    for (const p of m.participants.values()) {
      let r = s.roster.get(p.id);
      if (!r) s.roster.set(p.id, (r = new RosterEntry()));
      if (r.name !== p.name) r.name = p.name;
      if (r.role !== p.role) r.role = p.role;
      if (r.status !== p.status) r.status = p.status;
      if (r.bot !== p.bot) r.bot = p.bot;
      if (r.found !== p.found) r.found = p.found;
      if (!m.isPublic(p)) continue;
      let b = s.bodies.get(p.id);
      if (!b) s.bodies.set(p.id, (b = new BodyState()));
      writeBody(b, m.bodyView(p));
    }
  }

  /** Chaque client reçoit les cachés qu'il peut voir (et lui-même s'il est caché). */
  private syncSight(): void {
    for (const client of this.clients) {
      const bodies = this.match.privateBodiesFor(client.sessionId).map((p) => this.match.bodyView(p));
      client.send(HideSeekServerMessage.sight, bodies satisfies BodyView[]);
    }
  }
}

/** Ne modifie que ce qui a changé (Colyseus n'envoie que les différences). */
function writeBody(b: BodyState, v: BodyView): void {
  const next = {
    id: v.id,
    name: v.name,
    x: v.x,
    y: v.y,
    dir: v.dir,
    moving: v.moving,
    sex: v.look.sex,
    baseLook: v.look.baseLook,
    skinTone: v.look.skinTone,
    hairColor: v.look.hairColor,
    bodyType: v.look.bodyType,
    role: v.role,
    bot: v.bot,
  };
  for (const [k, val] of Object.entries(next) as [keyof typeof next, never][]) {
    if (b[k] !== val) (b as unknown as Record<string, unknown>)[k] = val;
  }
}
