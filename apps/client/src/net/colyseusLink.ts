import { getStateCallbacks, type Room } from 'colyseus.js';
import {
  ClientMessage,
  ServerMessage,
  type Arrival,
  type BuyFoodMessage,
  type BuyItemMessage,
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
import type { DistrictLink, PlayerHandlers, PlayerView } from './link.js';

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

  feedPet(): void {
    this.room.send(ClientMessage.feedPet, {});
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
