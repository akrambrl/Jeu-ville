import { getStateCallbacks, type Room } from 'colyseus.js';
import {
  ClientMessage,
  ServerMessage,
  type Arrival,
  type AcceptErrandMessage,
  type ErrandView,
  type BuyFoodMessage,
  type BuyItemMessage,
  type BusinessType,
  type ApplyJobMessage,
  type MissionView,
  type ServeMessage,
  type Listings,
  type OpenBusinessMessage,
  type PropertyDealMessage,
  type PropertyMessage,
  type SetVehicleMessage,
  type VehicleKind,
  type RideBusMessage,
  type CharacterSelf,
  type HomeActionId,
  type HomeActionMessage,
  type MoveMessage,
  type Notice,
  type TilePoint,
} from '@jeu-ville/shared';
import type { BusinessHandlers, BusinessView, DistrictLink, PlayerHandlers, PlayerView } from './link.js';

/** Quartier synchronisé avec le serveur, qui fait autorité. */
export class ColyseusLink implements DistrictLink {
  constructor(private readonly room: Room) {}

  get sessionId(): string {
    return this.room.sessionId;
  }

  move(to: TilePoint): void {
    this.room.send(ClientMessage.move, { x: to.x, y: to.y } satisfies MoveMessage);
  }

  homeAction(action: HomeActionId): void {
    this.room.send(ClientMessage.homeAction, { action } satisfies HomeActionMessage);
  }

  buyFood(placeId: string, itemId: string): void {
    this.room.send(ClientMessage.buyFood, { placeId, itemId } satisfies BuyFoodMessage);
  }

  buyItem(placeId: string, itemId: string): void {
    this.room.send(ClientMessage.buyItem, { placeId, itemId } satisfies BuyItemMessage);
  }

  setVehicle(vehicle: VehicleKind | ''): void {
    this.room.send(ClientMessage.setVehicle, { vehicle } satisfies SetVehicleMessage);
  }

  chargeScooter(): void {
    this.room.send(ClientMessage.chargeScooter, {});
  }

  acceptErrand(offerId: string): void {
    this.room.send(ClientMessage.acceptErrand, { offerId } satisfies AcceptErrandMessage);
  }

  abandonErrand(): void {
    this.room.send(ClientMessage.abandonErrand, {});
  }

  onErrand(cb: (errand: ErrandView) => void): void {
    this.room.onMessage(ServerMessage.errand, cb);
  }

  talk(botId: string): void {
    this.room.send(ClientMessage.talk, { botId });
  }

  feedPet(): void {
    this.room.send(ClientMessage.feedPet, {});
  }

  requestListings(): Promise<string[]> {
    return new Promise((resolve) => {
      const off = this.room.onMessage(ServerMessage.listings, (l: Listings) => {
        off();
        resolve(l.taken);
      });
      this.room.send(ClientMessage.listings, {});
    });
  }

  buyProperty(spotId: string): void {
    this.room.send(ClientMessage.buyProperty, { spotId, requestId: crypto.randomUUID() } satisfies PropertyDealMessage);
  }

  rentProperty(spotId: string): void {
    this.room.send(ClientMessage.rentProperty, { spotId, requestId: crypto.randomUUID() } satisfies PropertyDealMessage);
  }

  moveIn(spotId: string): void {
    this.room.send(ClientMessage.moveIn, { spotId } satisfies PropertyMessage);
  }

  releaseProperty(spotId: string): void {
    this.room.send(ClientMessage.releaseProperty, { spotId } satisfies PropertyMessage);
  }

  openBusiness(spotId: string, type: BusinessType, name: string): void {
    this.room.send(ClientMessage.openBusiness, { spotId, type, name } satisfies OpenBusinessMessage);
  }

  subscribeBusinesses(h: BusinessHandlers): void {
    const $ = getStateCallbacks(this.room);
    const state = this.room.state as { businesses: Map<string, BusinessView> };
    $(state).businesses.onAdd((b: BusinessView, id: string) => {
      h.opened(id, b);
      $(b).onChange(() => h.opened(id, b));
    });
    $(state).businesses.onRemove((_b: BusinessView, id: string) => h.closed(id));
  }

  applyJob(employerId: string): void {
    this.room.send(ClientMessage.applyJob, { employerId } satisfies ApplyJobMessage);
  }

  quitJob(): void {
    this.room.send(ClientMessage.quitJob, {});
  }

  startShift(): void {
    this.room.send(ClientMessage.startShift, {});
  }

  stopShift(): void {
    this.room.send(ClientMessage.stopShift, {});
  }

  serve(items: string[]): void {
    this.room.send(ClientMessage.serve, { items } satisfies ServeMessage);
  }

  onMission(cb: (mission: MissionView) => void): void {
    this.room.onMessage(ServerMessage.mission, cb);
  }

  rideBus(to: TilePoint): void {
    this.room.send(ClientMessage.rideBus, { x: to.x, y: to.y } satisfies RideBusMessage);
  }

  onArrival(cb: (arrival: Arrival) => void): void {
    this.room.onMessage(ServerMessage.arrival, cb);
  }

  subscribePlayers(h: PlayerHandlers): void {
    const $ = getStateCallbacks(this.room);
    const state = this.room.state as { players: Map<string, PlayerView> };
    $(state).players.onAdd((p: PlayerView, id: string) => {
      h.added(id, p);
      $(p).onChange(() => h.changed(id, p));
    });
    $(state).players.onRemove((_p: PlayerView, id: string) => h.removed(id));
  }

  onSelf(cb: (self: CharacterSelf) => void): void {
    this.room.onMessage(ServerMessage.self, cb);
  }

  onNotice(cb: (notice: Notice) => void): void {
    this.room.onMessage(ServerMessage.notice, cb);
  }

  onDisconnected(cb: () => void): void {
    this.room.onLeave((code) => {
      if (code !== 1000) cb();
    });
  }
}
