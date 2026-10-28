/**
 * Une room par quartier. Le serveur calcule les trajets (A*) et fait avancer
 * les personnages ; les clients ne font qu'afficher et interpoler.
 */
import { Room, type Client } from '@colyseus/core';
import {
  ClientMessage,
  MapGrid,
  MOVEMENT,
  SERVER,
  TileOccupancy,
  buyFoodSchema,
  rideBusSchema,
  busDropOff,
  isTravelDestination,
  TRAVEL,
  PASSERBY,
  reachableTiles,
  spawnPasserby,
  updatePasserby,
  type Passerby,
  type Arrival,
  foodPlaces,
  type FoodPlace,
  nearestFreeTile,
  pathAvoiding,
  stepWalker,
  type Walker,
  ServerMessage,
  districtJoinSchema,
  getDistrictMap,
  homeActionSchema,
  moveSchema,
  type DistrictJoinOptions,
  type Notice,
} from '@jeu-ville/shared';
import { db } from '../db/client.js';
import { playerFromToken } from '../domain/auth.js';
import {
  getCharacterByPlayer,
  getCharacterPosition,
  getCharacterSelf,
  performHomeAction,
  savePosition,
  buyFood,
  payFee,
} from '../domain/characters.js';
import { GameError } from '../domain/errors.js';

import { DistrictState, PlayerState } from './state.js';

interface AuthData {
  characterId: string;
}

interface Session extends Walker {
  characterId: string;
  client: Client;
  /** Porte de l'immeuble du joueur (pour les actions « chez soi »). */
  homeDoor: { x: number; y: number } | null;
}

export class DistrictRoom extends Room<DistrictState> {
  override state = new DistrictState();
  private grid!: MapGrid;
  private food: FoodPlace[] = [];
  /** Passants (bots) du quartier, simulés ici et vus par tous. */
  private readonly passersby: Passerby[] = [];
  /** Une case = une personne (joueurs, et bientôt bots ; stands des marchands). */
  private readonly occupancy = new TileOccupancy();
  /** Sessions par sessionId Colyseus. */
  private readonly sessions = new Map<string, Session>();

  override onCreate(options: DistrictJoinOptions): void {
    const map = getDistrictMap(options.districtId);
    if (!map) throw new Error(`Quartier inconnu : ${options.districtId}`);
    this.grid = new MapGrid(map);
    this.food = foodPlaces(map);
    for (const v of map.vendors) this.occupancy.block(v.x, v.y);
    const tiles = reachableTiles(this.grid, map.spawn);
    for (let i = 0; i < PASSERBY.countPerDistrict; i++) {
      const b = spawnPasserby(`bot-${i}`, this.occupancy, tiles, Date.now());
      this.passersby.push(b);
      const p = new PlayerState();
      Object.assign(p, { id: b.id, name: '', x: b.x, y: b.y, dir: b.dir, pet: b.pet, ...b.look });
      this.state.players.set(b.id, p);
    }

    this.onMessage(ClientMessage.move, (client, raw) => this.handleMove(client, raw));
    this.onMessage(ClientMessage.homeAction, (client, raw) => this.handleHomeAction(client, raw));
    this.onMessage(ClientMessage.buyFood, (client, raw) => this.handleBuyFood(client, raw));
    this.onMessage(ClientMessage.rideBus, (client, raw) => this.handleRideBus(client, raw));

    this.setSimulationInterval((dt) => this.tick(dt), SERVER.roomTickMs);
    this.clock.setInterval(() => void this.pushSelfToAll(), SERVER.selfSnapshotIntervalMs);
  }

  override async onAuth(_client: Client, rawOptions: unknown): Promise<AuthData> {
    const options = districtJoinSchema.parse(rawOptions);
    const player = await playerFromToken(db, options.token);
    if (!player) throw new GameError('Session invalide.', 401);
    const character = await getCharacterByPlayer(db, player.id);
    if (!character) throw new GameError("Crée d'abord ton personnage.", 403);
    if (character.districtId !== options.districtId) throw new GameError("Tu n'habites pas ce quartier.", 403);
    return { characterId: character.id };
  }

  override async onJoin(client: Client, _options: unknown, auth: AuthData): Promise<void> {
    // Une seule connexion par personnage : on remplace l'ancienne.
    for (const s of this.sessions.values()) {
      if (s.characterId === auth.characterId) s.client.leave();
    }

    const [self, stored] = await Promise.all([
      getCharacterSelf(db, auth.characterId),
      getCharacterPosition(db, auth.characterId),
    ]);
    if (!self) throw new GameError('Personnage introuvable.', 404);

    const wanted = this.grid.nearestWalkable(stored ?? this.grid.map.spawn) ?? this.grid.map.spawn;
    // La case peut être prise par quelqu'un d'autre : on apparaît juste à côté.
    const pos = nearestFreeTile(this.grid, this.occupancy, wanted, client.sessionId) ?? wanted;
    this.occupancy.tryHold(client.sessionId, pos.x, pos.y);
    const session: Session = {
      id: client.sessionId,
      characterId: auth.characterId,
      client,
      x: pos.x,
      y: pos.y,
      dir: 2,
      path: [],
      tile: { x: pos.x, y: pos.y },
      blockedMs: 0,
      homeDoor: self.home?.door ?? null,
    };
    this.sessions.set(client.sessionId, session);

    const p = new PlayerState();
    p.id = self.id;
    p.name = self.name;
    p.x = pos.x;
    p.y = pos.y;
    p.dir = session.dir;
    p.sex = self.look.sex;
    p.baseLook = self.look.baseLook;
    p.skinTone = self.look.skinTone;
    p.hairColor = self.look.hairColor;
    p.bodyType = self.look.bodyType;
    this.state.players.set(client.sessionId, p);

    client.send(ServerMessage.self, self);
  }

  override async onLeave(client: Client): Promise<void> {
    const session = this.sessions.get(client.sessionId);
    this.sessions.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.occupancy.releaseAll(client.sessionId);
    if (session) await this.persistPosition(session);
  }

  override async onDispose(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => this.persistPosition(s)));
  }

  private async persistPosition(s: Session): Promise<void> {
    const tile = this.grid.nearestWalkable({ x: s.x, y: s.y }) ?? this.grid.map.spawn;
    await savePosition(db, s.characterId, tile.x, tile.y).catch((err) => console.error('savePosition', err));
  }

  private tick(dtMs: number): void {
    const distance = (MOVEMENT.walkTilesPerSecond * dtMs) / 1000;
    for (const [sessionId, s] of this.sessions) {
      const p = this.state.players.get(sessionId);
      if (!p) continue;
      if (s.path.length > 0) {
        stepWalker(this.grid, this.occupancy, s, distance, dtMs);
        p.x = s.x;
        p.y = s.y;
        p.dir = s.dir;
      }
      p.moving = s.path.length > 0 && s.blockedMs === 0;
    }
    const now = Date.now();
    for (const b of this.passersby) {
      updatePasserby(this.grid, this.occupancy, b, dtMs, now);
      const p = this.state.players.get(b.id);
      if (!p) continue;
      const moving = b.path.length > 0 && b.blockedMs === 0;
      if (p.x !== b.x || p.y !== b.y || p.moving !== moving) Object.assign(p, { x: b.x, y: b.y, dir: b.dir, moving });
    }
  }

  private handleMove(client: Client, raw: unknown): void {
    const s = this.sessions.get(client.sessionId);
    const parsed = moveSchema.safeParse(raw);
    if (!s || !parsed.success) return;
    const goal = parsed.data;
    if (!this.grid.isWalkable(goal.x, goal.y)) return this.notify(client, 'error', 'Impossible d’aller là.');

    // Case déjà prise par quelqu'un : on s'arrête sur la case libre la plus proche.
    const target = nearestFreeTile(this.grid, this.occupancy, goal, s.id);
    const path = target ? pathAvoiding(this.grid, this.occupancy, s, target) : null;
    if (!path) return this.notify(client, 'error', 'Impossible d’aller là.');
    s.path = path;
    s.blockedMs = 0;
  }

  private async handleHomeAction(client: Client, raw: unknown): Promise<void> {
    const s = this.sessions.get(client.sessionId);
    const parsed = homeActionSchema.safeParse(raw);
    if (!s || !parsed.success) return;
    if (!s.homeDoor || Math.hypot(s.x - s.homeDoor.x, s.y - s.homeDoor.y) > MOVEMENT.homeInteractionRange) {
      return this.notify(client, 'error', 'Rentre chez toi pour faire ça.');
    }
    try {
      const self = await performHomeAction(db, s.characterId, parsed.data.action);
      client.send(ServerMessage.self, self);
    } catch (err) {
      if (err instanceof GameError) return this.notify(client, 'error', err.message);
      console.error('homeAction', err);
      this.notify(client, 'error', 'Erreur serveur, réessaie.');
    }
  }

  private async handleBuyFood(client: Client, raw: unknown): Promise<void> {
    const s = this.sessions.get(client.sessionId);
    const parsed = buyFoodSchema.safeParse(raw);
    if (!s || !parsed.success) return;
    const place = this.food.find((p) => p.id === parsed.data.placeId);
    if (!place) return this.notify(client, 'error', 'Cet endroit n’existe plus.');
    if (Math.hypot(s.x - place.x, s.y - place.y) > MOVEMENT.foodInteractionRange) {
      return this.notify(client, 'error', 'Approche-toi pour commander.');
    }
    try {
      const self = await buyFood(db, s.characterId, place.kind, parsed.data.itemId);
      client.send(ServerMessage.self, self);
    } catch (err) {
      if (err instanceof GameError) return this.notify(client, 'error', err.message);
      console.error('buyFood', err);
      this.notify(client, 'error', 'Erreur serveur, réessaie.');
    }
  }

  /** Bus payant : on paie, puis on réapparaît à destination (cinématique côté clients). */
  private async handleRideBus(client: Client, raw: unknown): Promise<void> {
    const s = this.sessions.get(client.sessionId);
    const parsed = rideBusSchema.safeParse(raw);
    if (!s || !parsed.success) return;
    const to = parsed.data;
    if (!isTravelDestination(this.grid.map, to, s.homeDoor)) return this.notify(client, 'error', 'Le bus ne va pas là.');
    if (Math.hypot(to.x - s.x, to.y - s.y) < TRAVEL.minBusDistance) return this.notify(client, 'error', 'C’est tout près, vas-y à pied.');
    const drop = busDropOff(this.grid, to);
    if (!nearestFreeTile(this.grid, this.occupancy, drop.door, s.id)) return this.notify(client, 'error', 'Trop de monde là-bas, réessaie.');
    try {
      const self = await payFee(db, s.characterId, TRAVEL.busFareCents, 'bus_fare');
      client.send(ServerMessage.self, self);
    } catch (err) {
      if (err instanceof GameError) return this.notify(client, 'error', err.message);
      console.error('rideBus', err);
      return this.notify(client, 'error', 'Erreur serveur, réessaie.');
    }
    // On descend du bus sur le trottoir (la case a pu être prise pendant le paiement)…
    const arrival = nearestFreeTile(this.grid, this.occupancy, drop.door, s.id) ?? drop.door;
    this.occupancy.releaseAll(s.id);
    this.occupancy.tryHold(s.id, arrival.x, arrival.y);
    Object.assign(s, { x: arrival.x, y: arrival.y, tile: { ...arrival }, path: [], blockedMs: 0 });
    const p = this.state.players.get(client.sessionId);
    if (p) Object.assign(p, { x: arrival.x, y: arrival.y, moving: false });
    this.broadcast(ServerMessage.arrival, { playerId: client.sessionId, via: 'bus', at: arrival, curb: drop.curb } satisfies Arrival);
    // … puis on marche jusqu'à la destination, une fois le bus arrêté.
    this.clock.setTimeout(() => {
      if (this.sessions.get(client.sessionId) !== s || s.path.length > 0) return;
      const target = nearestFreeTile(this.grid, this.occupancy, to, s.id);
      const path = target ? pathAvoiding(this.grid, this.occupancy, s, target) : null;
      if (path) s.path = path;
    }, TRAVEL.busArriveMs + TRAVEL.busStopMs);
  }

  private async pushSelfToAll(): Promise<void> {
    for (const s of this.sessions.values()) {
      const self = await getCharacterSelf(db, s.characterId);
      if (self) s.client.send(ServerMessage.self, self);
    }
  }

  private notify(client: Client, level: Notice['level'], text: string): void {
    client.send(ServerMessage.notice, { level, text } satisfies Notice);
  }
}
