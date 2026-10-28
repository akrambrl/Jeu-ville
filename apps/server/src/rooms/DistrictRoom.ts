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
  buyItemSchema,
  openBusinessSchema,
  applyJobSchema,
  serveSchema,
  employers,
  Shift,
  JOBS,
  type Employer,
  type MissionResult,
  propertyDealSchema,
  propertySchema,
  type Listings,
  setVehicleSchema,
  shopItems,
  shopPlaces,
  speedFactor,
  VEHICLES,
  type ShopPlace,
  type VehicleKind,
  type CharacterSelf,
  rideBusSchema,
  busDropOff,
  isTravelDestination,
  TRAVEL,
  PASSERBY,
  reachableTiles,
  spawnPasserby,
  updatePasserby,
  holdForTalk,
  Errand,
  acceptErrandSchema,
  dailyErrandOffers,
  errandReward,
  realDayKey,
  type ErrandOffer,
  type ErrandView,
  type TilePoint,
  talkSchema,
  DIALOGUE,
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
import { checkErrandAllowed, completeErrand } from '../domain/errands.js';
import { applyJob, payMission, quitJob } from '../domain/jobs.js';
import { acquireProperty, moveIn, openBusiness, openBusinesses, releaseProperty, takenSpots } from '../domain/realEstate.js';
import {
  adoptPet,
  buyVehicle,
  chargeScooter,
  enforcePetCare,
  feedPet,
  recordPetWalk,
  recordRide,
  setActiveVehicle,
} from '../domain/possessions.js';

import { BusinessState, DistrictState, PlayerState } from './state.js';

interface AuthData {
  characterId: string;
}

interface Session extends Walker {
  characterId: string;
  client: Client;
  /** Porte de l'immeuble du joueur (pour les actions « chez soi »). */
  homeDoor: { x: number; y: number } | null;
  /** Véhicule utilisé et batterie (trottinette), d'après le dernier CharacterSelf. */
  vehicle: VehicleKind | '';
  battery: number;
  hasPet: boolean;
  /** Cases parcourues depuis la dernière sauvegarde (batterie, promenade). */
  rideTiles: number;
  petTiles: number;
  /** Emploi et expérience (d'après le dernier CharacterSelf), service en cours. */
  job: { employerId: string; jobType: 'courier' | 'counter' } | null;
  jobXp: Partial<Record<'courier' | 'counter', number>>;
  shift: Shift | null;
  /** Mission du quotidien en cours, et son étape (pour renvoyer la vue quand elle change). */
  errand: Errand | null;
  errandStep: number;
}

/** Identifiant (dans le quartier) d'un habitant qui demande de l'aide. */
const giverId = (offer: ErrandOffer) => `giver-${offer.id}`;

export class DistrictRoom extends Room<DistrictState> {
  override state = new DistrictState();
  private grid!: MapGrid;
  private food: FoodPlace[] = [];
  private shops: ShopPlace[] = [];
  /** Passants (bots) du quartier, simulés ici et vus par tous. */
  private readonly passersby: Passerby[] = [];
  private districtKey = '';
  private employers: Employer[] = [];
  /** Une case = une personne (joueurs, et bientôt bots ; stands des marchands). */
  private readonly occupancy = new TileOccupancy();
  /** Sessions par sessionId Colyseus. */
  private readonly sessions = new Map<string, Session>();
  /** Cases reliées aux rues (passants, demandeurs d'aide, objets perdus). */
  private walkable: TilePoint[] = [];
  /** Demandes d'aide du jour (missions du quotidien) et jour concerné. */
  private offers: ErrandOffer[] = [];
  private errandDay = '';

  override onCreate(options: DistrictJoinOptions): void {
    const map = getDistrictMap(options.districtId);
    if (!map) throw new Error(`Quartier inconnu : ${options.districtId}`);
    this.grid = new MapGrid(map);
    this.districtKey = options.districtId;
    this.employers = employers(map);
    void this.refreshBusinesses();
    this.food = foodPlaces(map);
    this.shops = shopPlaces(map);
    for (const v of map.vendors) this.occupancy.block(v.x, v.y);
    const tiles = reachableTiles(this.grid, map.spawn);
    // Passants du quartier, puis flâneurs des rues commerçantes.
    const spawns = [
      ...Array.from({ length: PASSERBY.countPerDistrict }, () => ({ tiles, zone: undefined as number | undefined })),
      ...map.busyStreets.flatMap((s, zone) => Array.from({ length: PASSERBY.perBusyStreet }, () => ({ tiles: s.sidewalks, zone }))),
    ];
    for (const [i, s] of spawns.entries()) {
      const b = spawnPasserby(`bot-${i}`, this.occupancy, s.tiles, Date.now(), Math.random, s.zone);
      this.passersby.push(b);
      const p = new PlayerState();
      Object.assign(p, { id: b.id, name: '', x: b.x, y: b.y, dir: b.dir, pet: b.pet, ...b.look });
      this.state.players.set(b.id, p);
    }

    this.onMessage(ClientMessage.move, (client, raw) => this.handleMove(client, raw));
    this.onMessage(ClientMessage.talk, (client, raw) => this.handleTalk(client, raw));
    this.walkable = tiles;
    this.refreshErrandOffers();
    this.onMessage(ClientMessage.acceptErrand, (client, raw) => void this.handleAcceptErrand(client, raw));
    this.onMessage(ClientMessage.abandonErrand, (client) => {
      const s = this.sessions.get(client.sessionId);
      if (!s?.errand) return;
      s.errand = null;
      client.send(ServerMessage.errand, { kind: 'none' } satisfies ErrandView);
    });
    this.onMessage(ClientMessage.homeAction, (client, raw) => this.handleHomeAction(client, raw));
    this.onMessage(ClientMessage.buyFood, (client, raw) => this.handleBuyFood(client, raw));
    this.onMessage(ClientMessage.rideBus, (client, raw) => this.handleRideBus(client, raw));
    this.onMessage(ClientMessage.buyItem, (client, raw) => this.handleBuyItem(client, raw));
    this.onMessage(ClientMessage.setVehicle, (client, raw) => this.handleSetVehicle(client, raw));
    this.onMessage(ClientMessage.chargeScooter, (client) => this.handleChargeScooter(client));
    this.onMessage(ClientMessage.feedPet, (client) => this.handleFeedPet(client));
    this.onMessage(ClientMessage.listings, (client) => void this.handleListings(client));
    this.onMessage(ClientMessage.applyJob, (client, raw) =>
      this.act(client, 'applyJob', async (s) => {
        const parsed = applyJobSchema.safeParse(raw);
        if (!parsed.success) return;
        this.endShift(s);
        return applyJob(db, s.characterId, this.districtKey, parsed.data.employerId);
      }),
    );
    this.onMessage(ClientMessage.quitJob, (client) =>
      this.act(client, 'quitJob', async (s) => {
        this.endShift(s);
        return quitJob(db, s.characterId);
      }),
    );
    this.onMessage(ClientMessage.startShift, (client) => this.handleStartShift(client));
    this.onMessage(ClientMessage.stopShift, (client) => {
      const s = this.sessions.get(client.sessionId);
      if (s) this.endShift(s);
    });
    this.onMessage(ClientMessage.serve, (client, raw) => {
      const s = this.sessions.get(client.sessionId);
      const parsed = serveSchema.safeParse(raw);
      if (!s?.shift || !parsed.success) return;
      const result = s.shift.serve(parsed.data.items, { x: s.x, y: s.y }, Date.now());
      if (result) this.missionDone(s, result);
    });
    this.onMessage(ClientMessage.buyProperty, (client, raw) => this.handleDeal(client, raw, 'buy'));
    this.onMessage(ClientMessage.rentProperty, (client, raw) => this.handleDeal(client, raw, 'rent'));
    this.onMessage(ClientMessage.moveIn, (client, raw) =>
      this.act(client, 'moveIn', async (s) => {
        const parsed = propertySchema.safeParse(raw);
        if (parsed.success) return moveIn(db, s.characterId, this.districtKey, parsed.data.spotId);
      }),
    );
    this.onMessage(ClientMessage.releaseProperty, (client, raw) =>
      this.act(client, 'releaseProperty', async (s) => {
        const parsed = propertySchema.safeParse(raw);
        if (!parsed.success) return;
        const self = await releaseProperty(db, s.characterId, this.districtKey, parsed.data.spotId);
        await this.refreshBusinesses();
        return self;
      }),
    );
    this.onMessage(ClientMessage.openBusiness, (client, raw) =>
      this.act(client, 'openBusiness', async (s) => {
        const parsed = openBusinessSchema.safeParse(raw);
        if (!parsed.success) throw new GameError(parsed.error.issues[0]?.message ?? 'Nom invalide.');
        const self = await openBusiness(db, s.characterId, this.districtKey, parsed.data.spotId, parsed.data.type, parsed.data.name);
        await this.refreshBusinesses();
        return self;
      }),
    );

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

    // Animal négligé pendant l'absence : recueilli par un refuge.
    const petNotice = await enforcePetCare(db, auth.characterId);
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
      vehicle: '',
      battery: 100,
      hasPet: false,
      rideTiles: 0,
      petTiles: 0,
      job: null,
      jobXp: {},
      shift: null,
      errand: null,
      errandStep: 0,
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

    this.sendSelf(session, self);
    if (petNotice) this.notify(client, 'info', petNotice);
  }

  /** Envoie la vue privée au joueur et met à jour ce que les autres voient (véhicule, animal). */
  private sendSelf(s: Session, self: CharacterSelf): void {
    s.homeDoor = self.home?.door ?? null;
    s.vehicle = self.activeVehicle;
    s.battery = self.vehicles.find((v) => v.kind === self.activeVehicle)?.battery ?? 100;
    s.hasPet = self.pet !== null;
    s.job = self.job;
    s.jobXp = self.jobXp;
    const p = this.state.players.get(s.id);
    if (p) {
      p.vehicle = self.activeVehicle;
      p.pet = self.pet ? `${self.pet.species}:${self.pet.coat}` : '';
    }
    s.client.send(ServerMessage.self, self);
  }

  /** Exécute une action de jeu ; les erreurs « métier » deviennent un message au joueur. */
  private async act(client: Client, label: string, fn: (s: Session) => Promise<CharacterSelf | void>): Promise<void> {
    const s = this.sessions.get(client.sessionId);
    if (!s) return;
    try {
      const self = await fn(s);
      if (self) this.sendSelf(s, self);
    } catch (err) {
      if (err instanceof GameError) return this.notify(client, 'error', err.message);
      console.error(label, err);
      this.notify(client, 'error', 'Erreur serveur, réessaie.');
    }
  }

  /** Sauvegarde batterie et promenade accumulées pendant le trajet. */
  private async flushTrip(s: Session, ridden: VehicleKind | ''): Promise<void> {
    const ride = s.rideTiles;
    const walk = s.petTiles;
    s.rideTiles = 0;
    s.petTiles = 0;
    if (ride > 0 && ridden && 'batteryPerTile' in VEHICLES[ridden]) await recordRide(db, s.characterId, ridden, ride);
    if (walk > 0) await recordPetWalk(db, s.characterId, walk);
    if (ride > 0 || walk > 0) {
      const self = await getCharacterSelf(db, s.characterId);
      if (self && this.sessions.get(s.id) === s) this.sendSelf(s, self);
    }
  }

  private handleBuyItem(client: Client, raw: unknown): Promise<void> {
    return this.act(client, 'buyItem', async (s) => {
      const parsed = buyItemSchema.safeParse(raw);
      if (!parsed.success) return;
      const place = this.shops.find((p) => p.id === parsed.data.placeId);
      if (!place) throw new GameError('Cette boutique n’existe plus.');
      if (Math.hypot(s.x - place.x, s.y - place.y) > MOVEMENT.foodInteractionRange) throw new GameError('Approche-toi de la boutique.');
      const item = shopItems(place.kind).find((i) => i.id === parsed.data.itemId);
      if (!item) throw new GameError("Ce n'est pas vendu ici.");
      return item.type === 'vehicle' ? buyVehicle(db, s.characterId, item.vehicle) : adoptPet(db, s.characterId, item.species);
    });
  }

  private handleSetVehicle(client: Client, raw: unknown): Promise<void> {
    return this.act(client, 'setVehicle', async (s) => {
      const parsed = setVehicleSchema.safeParse(raw);
      if (!parsed.success) return;
      await this.flushTrip(s, s.vehicle);
      return setActiveVehicle(db, s.characterId, parsed.data.vehicle);
    });
  }

  private handleChargeScooter(client: Client): Promise<void> {
    return this.act(client, 'chargeScooter', async (s) => {
      if (!s.homeDoor || Math.hypot(s.x - s.homeDoor.x, s.y - s.homeDoor.y) > MOVEMENT.homeInteractionRange) {
        throw new GameError('Rentre chez toi pour recharger.');
      }
      await this.flushTrip(s, s.vehicle);
      return chargeScooter(db, s.characterId);
    });
  }

  private handleFeedPet(client: Client): Promise<void> {
    return this.act(client, 'feedPet', (s) => feedPet(db, s.characterId));
  }

  override async onLeave(client: Client): Promise<void> {
    const session = this.sessions.get(client.sessionId);
    this.sessions.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.occupancy.releaseAll(client.sessionId);
    if (session) {
      await this.flushTrip(session, session.vehicle);
      await this.persistPosition(session);
    }
  }

  override async onDispose(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => this.persistPosition(s)));
  }

  private async persistPosition(s: Session): Promise<void> {
    const tile = this.grid.nearestWalkable({ x: s.x, y: s.y }) ?? this.grid.map.spawn;
    await savePosition(db, s.characterId, tile.x, tile.y).catch((err) => console.error('savePosition', err));
  }

  private tick(dtMs: number): void {
    for (const [sessionId, s] of this.sessions) {
      const p = this.state.players.get(sessionId);
      if (!p) continue;
      if (s.path.length > 0) {
        const before = { x: s.x, y: s.y };
        const distance = (MOVEMENT.walkTilesPerSecond * speedFactor(s.vehicle) * dtMs) / 1000;
        stepWalker(this.grid, this.occupancy, s, distance, dtMs);
        const moved = Math.hypot(s.x - before.x, s.y - before.y);
        if (s.hasPet) s.petTiles += moved;
        const spec = s.vehicle ? VEHICLES[s.vehicle] : null;
        if (spec && 'batteryPerTile' in spec) {
          s.rideTiles += moved;
          s.battery -= moved * spec.batteryPerTile;
          if (s.battery <= 0) {
            // Batterie à plat : on finit à pied.
            const ridden = s.vehicle;
            s.vehicle = '';
            p.vehicle = '';
            this.notify(s.client, 'info', 'Batterie de la trottinette vide : recharge-la chez toi.');
            void this.flushTrip(s, ridden);
          }
        }
        if (s.path.length === 0) void this.flushTrip(s, s.vehicle);
        p.x = s.x;
        p.y = s.y;
        p.dir = s.dir;
      }
      p.moving = s.path.length > 0 && s.blockedMs === 0;
    }
    const now = Date.now();
    for (const s of this.sessions.values()) {
      if (!s.shift) continue;
      // Au comptoir, on reste à son poste.
      if (s.shift.employer.jobType === 'counter' && Math.hypot(s.x - s.shift.employer.door.x, s.y - s.shift.employer.door.y) > JOBS.counter.leaveDistance) {
        this.notify(s.client, 'error', 'Tu as quitté ton poste : service terminé.');
        this.endShift(s);
        continue;
      }
      const result = s.shift.tick({ x: s.x, y: s.y }, now);
      if (result) this.missionDone(s, result);
    }
    this.tickErrands(now);
    for (const b of this.passersby) {
      updatePasserby(this.grid, this.occupancy, b, dtMs, now);
      const p = this.state.players.get(b.id);
      if (!p) continue;
      const moving = b.path.length > 0 && b.blockedMs === 0;
      if (p.x !== b.x || p.y !== b.y || p.moving !== moving || p.dir !== b.dir) Object.assign(p, { x: b.x, y: b.y, dir: b.dir, moving });
    }
  }

  /** Parler à un passant : il s'arrête et se tourne vers le joueur (le texte est affiché par le client). */
  private handleTalk(client: Client, raw: unknown): void {
    const s = this.sessions.get(client.sessionId);
    const parsed = talkSchema.safeParse(raw);
    if (!s || !parsed.success) return;
    const b = this.passersby.find((p) => p.id === parsed.data.botId);
    if (!b || Math.hypot(b.x - s.x, b.y - s.y) > DIALOGUE.talkRange + 1) return;
    holdForTalk(b, s.tile, Date.now());
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

  // ---------- Services (agence pour l'emploi) ----------

  private handleStartShift(client: Client): void {
    const s = this.sessions.get(client.sessionId);
    if (!s) return;
    if (s.shift) return this.notify(client, 'error', 'Tu es déjà en service.');
    const employer = this.employers.find((e) => e.id === s.job?.employerId);
    if (!employer) return this.notify(client, 'error', "Tu n'as pas d'emploi : passe à l'agence pour l'emploi.");
    if (Math.hypot(s.x - employer.door.x, s.y - employer.door.y) > MOVEMENT.foodInteractionRange) {
      return this.notify(client, 'error', `Va d'abord chez ton employeur : ${employer.name}.`);
    }
    s.shift = new Shift(`${s.characterId}:${Date.now()}`, employer, s.jobXp[employer.jobType] ?? 0, this.grid.map);
    s.shift.next({ x: s.x, y: s.y }, Date.now());
    client.send(ServerMessage.mission, s.shift.view(Date.now()));
  }

  /** Fin d'une mission : on paie (si réussie), on prévient, on passe à la suivante. */
  private missionDone(s: Session, result: MissionResult): void {
    const shift = s.shift!;
    this.notify(s.client, result.payCents > 0 ? 'info' : 'error', result.payCents > 0 ? `${result.text} +${result.payCents / 100} €` : result.text);
    if (result.payCents > 0) {
      void payMission(db, s.characterId, shift.employer.jobType, result.payCents, result.key)
        .then((self) => this.sessions.get(s.id) === s && this.sendSelf(s, self))
        .catch((err) => console.error('payMission', err));
    }
    s.client.send(ServerMessage.mission, shift.view(Date.now()));
    if (shift.done) s.shift = null;
  }

  private endShift(s: Session): void {
    if (!s.shift) return;
    const view = s.shift.view(Date.now());
    s.shift = null;
    s.client.send(ServerMessage.mission, view.kind === 'done' ? view : { kind: 'done', earnedCents: view.earnedCents, succeeded: 0, total: view.total });
  }

  /** L'agence est consultée de partout : on peut acheter/louer sans être devant (on visite ensuite). */
  private async handleListings(client: Client): Promise<void> {
    client.send(ServerMessage.listings, { taken: await takenSpots(db, this.districtKey) } satisfies Listings);
  }

  private handleDeal(client: Client, raw: unknown, mode: 'buy' | 'rent'): Promise<void> {
    return this.act(client, mode === 'buy' ? 'buyProperty' : 'rentProperty', async (s) => {
      const parsed = propertyDealSchema.safeParse(raw);
      if (!parsed.success) return;
      const self = await acquireProperty(db, s.characterId, this.districtKey, parsed.data.spotId, mode, parsed.data.requestId);
      await this.handleListings(client);
      return self;
    });
  }

  /** Enseignes des commerces de joueurs (visibles de tous). */
  private async refreshBusinesses(): Promise<void> {
    const open = await openBusinesses(db, this.districtKey);
    const ids = new Set(open.map((b) => b.spotId));
    for (const id of [...this.state.businesses.keys()]) if (!ids.has(id)) this.state.businesses.delete(id);
    for (const b of open) {
      const current = this.state.businesses.get(b.spotId);
      if (current?.type === b.type && current.name === b.name) continue;
      const state = new BusinessState();
      state.type = b.type;
      state.name = b.name;
      this.state.businesses.set(b.spotId, state);
    }
  }

  /** Nouvelles demandes d'aide à minuit (heure de Paris) : les demandeurs changent. */
  private refreshErrandOffers(): void {
    const day = realDayKey(Date.now());
    if (day === this.errandDay) return;
    for (const old of this.offers) {
      this.state.players.delete(giverId(old));
      this.occupancy.releaseAll(giverId(old));
    }
    this.errandDay = day;
    this.offers = dailyErrandOffers(this.grid.map, this.walkable, day).filter((o) => this.occupancy.tryHold(giverId(o), o.giver.x, o.giver.y));
    for (const o of this.offers) {
      const p = new PlayerState();
      const { name: _name, ...look } = o.giver;
      Object.assign(p, { ...look, id: giverId(o), name: '', dir: 2, bodyType: 1 });
      this.state.players.set(p.id, p);
    }
  }

  private async handleAcceptErrand(client: Client, raw: unknown): Promise<void> {
    const s = this.sessions.get(client.sessionId);
    const parsed = acceptErrandSchema.safeParse(raw);
    if (!s || !parsed.success) return;
    const offer = this.offers.find((o) => o.id === parsed.data.offerId);
    if (!offer) return this.notify(client, 'error', 'Cette personne n’a plus besoin d’aide.');
    if (s.errand) return this.notify(client, 'error', 'Tu es déjà en train d’aider quelqu’un.');
    if (Math.hypot(offer.giver.x - s.x, offer.giver.y - s.y) > DIALOGUE.talkRange + 1) return this.notify(client, 'error', 'Approche-toi d’abord.');
    if (offer.type === 'tools' && !s.homeDoor) return this.notify(client, 'error', 'Il te faut un logement pour avoir des outils.');
    try {
      await checkErrandAllowed(db, s.characterId, this.districtKey, offer.id);
    } catch (err) {
      return this.notify(client, 'error', err instanceof GameError ? err.message : 'Impossible pour le moment.');
    }
    if (this.sessions.get(client.sessionId) !== s || s.errand) return;
    s.errand = new Errand(offer, s.homeDoor, Date.now());
    s.errandStep = 0;
    client.send(ServerMessage.errand, s.errand.view(Date.now()));
  }

  /** Avancement des missions du quotidien (appelé à chaque tick). */
  private tickErrands(now: number): void {
    for (const s of this.sessions.values()) {
      const errand = s.errand;
      if (!errand) continue;
      const result = errand.tick({ x: s.x, y: s.y }, now);
      if (result === 'failed') {
        s.errand = null;
        s.client.send(ServerMessage.errand, { kind: 'failed', offerId: errand.offer.id, type: errand.offer.type, reason: 'Trop tard…' } satisfies ErrandView);
      } else if (result === 'done') {
        s.errand = null;
        void completeErrand(db, s.characterId, this.districtKey, errand.offer, now)
          .then((self) => {
            if (this.sessions.get(s.id) !== s) return;
            this.sendSelf(s, self);
            const reward = errandReward(errand.offer.type);
            s.client.send(ServerMessage.errand, {
              kind: 'done',
              offerId: errand.offer.id,
              type: errand.offer.type,
              rewardCents: reward.cents,
              kindness: reward.kindness,
            } satisfies ErrandView);
          })
          .catch((err) => console.error('completeErrand', err));
      } else if (errand.stepIndex !== s.errandStep) {
        s.errandStep = errand.stepIndex;
        s.client.send(ServerMessage.errand, errand.view(now));
      }
    }
  }

  private async pushSelfToAll(): Promise<void> {
    this.refreshErrandOffers();
    await this.refreshBusinesses();
    for (const s of this.sessions.values()) {
      const petNotice = s.hasPet ? await enforcePetCare(db, s.characterId) : null;
      if (petNotice) this.notify(s.client, 'info', petNotice);
      const self = await getCharacterSelf(db, s.characterId);
      if (self) this.sendSelf(s, self);
    }
  }

  private notify(client: Client, level: Notice['level'], text: string): void {
    client.send(ServerMessage.notice, { level, text } satisfies Notice);
  }
}
