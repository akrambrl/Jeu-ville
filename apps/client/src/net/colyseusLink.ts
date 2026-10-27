import { getStateCallbacks, type Room } from 'colyseus.js';
import {
  ClientMessage,
  ServerMessage,
  type BuyFoodMessage,
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
