/**
 * Lien entre l'écran de la table et la partie : le serveur (Colyseus) en ligne,
 * ou une partie simulée dans la page contre des bots (mode solo).
 */
import type { Client, Room } from 'colyseus.js';
import {
  CARD_GAME,
  CardClientMessage,
  CardGame,
  CardServerMessage,
  ONLINE,
  type AnswerMessage,
  type CategoryId,
  type GameEvent,
  type GameView,
  type Notice,
} from '@jeu-ville/shared';

export type ConnectionState = 'reconnecting' | 'reconnected';

export interface TableLink {
  /** Identifiant de ce joueur à la table. */
  readonly myId: string;
  readonly mode: 'online' | 'solo';
  /** Code de la table privée à partager (null : partie rapide ou solo). */
  readonly tableCode: string | null;
  /** `category` null : le mot vaut dans n'importe quelle catégorie commune du duel. */
  answer(category: CategoryId | null, text: string): void;
  onView(cb: (view: GameView) => void): void;
  onEvent(cb: (event: GameEvent) => void): void;
  onNotice(cb: (notice: Notice) => void): void;
  onDisconnected(cb: () => void): void;
  /** Réseau coupé puis rétabli (en ligne). */
  onConnection(cb: (state: ConnectionState) => void): void;
  /** Solo : nouvelle partie avec les mêmes adversaires. */
  restart(): void;
  leave(): void;
}

/** Table en ligne : le serveur fait autorité. Se reconnecte tout seul si le réseau saute. */
export class OnlineTableLink implements TableLink {
  readonly mode = 'online';
  private room: Room;
  private leaving = false;
  private readonly viewCbs: ((v: GameView) => void)[] = [];
  private readonly eventCbs: ((e: GameEvent) => void)[] = [];
  private readonly noticeCbs: ((n: Notice) => void)[] = [];
  private readonly disconnectCbs: (() => void)[] = [];
  private readonly connectionCbs: ((state: ConnectionState) => void)[] = [];

  constructor(
    private readonly client: Client,
    room: Room,
    /** Code de la table privée (à partager), ou null pour une partie rapide. */
    readonly tableCode: string | null,
  ) {
    this.room = room;
    this.attach(room);
  }

  get myId(): string {
    return this.room.sessionId;
  }

  /** Branche les messages de la room (à refaire après une reconnexion). */
  private attach(room: Room): void {
    room.onMessage(CardServerMessage.view, (v: GameView) => this.viewCbs.forEach((cb) => cb(v)));
    room.onMessage(CardServerMessage.event, (e: GameEvent) => this.eventCbs.forEach((cb) => cb(e)));
    room.onMessage(CardServerMessage.notice, (n: Notice) => this.noticeCbs.forEach((cb) => cb(n)));
    room.onLeave(() => {
      if (!this.leaving) void this.reconnect(room.reconnectionToken);
    });
  }

  private async reconnect(token: string): Promise<void> {
    this.connectionCbs.forEach((cb) => cb('reconnecting'));
    for (let k = 0; k < ONLINE.reconnectAttempts && !this.leaving; k++) {
      await new Promise((r) => window.setTimeout(r, ONLINE.reconnectDelayMs));
      try {
        this.room = await this.client.reconnect(token);
        this.attach(this.room);
        this.connectionCbs.forEach((cb) => cb('reconnected'));
        return;
      } catch {
        /* réseau toujours coupé : on réessaie */
      }
    }
    if (!this.leaving) this.disconnectCbs.forEach((cb) => cb());
  }

  answer(category: CategoryId | null, text: string): void {
    this.room.send(CardClientMessage.answer, { category, text } satisfies AnswerMessage);
  }

  onView(cb: (view: GameView) => void): void {
    this.viewCbs.push(cb);
  }

  onEvent(cb: (event: GameEvent) => void): void {
    this.eventCbs.push(cb);
  }

  onNotice(cb: (notice: Notice) => void): void {
    this.noticeCbs.push(cb);
  }

  onDisconnected(cb: () => void): void {
    this.disconnectCbs.push(cb);
  }

  onConnection(cb: (state: ConnectionState) => void): void {
    this.connectionCbs.push(cb);
  }

  restart(): void {
    /* en ligne, la table revient toute seule au salon après le classement */
  }

  leave(): void {
    this.leaving = true;
    void this.room.leave(true);
  }
}

const SOLO_ID = 'me';
/** Pas de simulation du mode solo (ms). */
const SOLO_TICK_MS = 100;

/** Mode solo : la même partie, jouée dans la page contre des bots. */
export class SoloTableLink implements TableLink {
  readonly mode = 'solo';
  readonly myId = SOLO_ID;
  readonly tableCode = null;
  private game: CardGame;
  private readonly viewCbs: ((v: GameView) => void)[] = [];
  private readonly eventCbs: ((e: GameEvent) => void)[] = [];
  private readonly noticeCbs: ((n: Notice) => void)[] = [];
  private readonly timer: number;

  constructor(
    private readonly name: string,
    private readonly bots: number,
  ) {
    this.game = this.newGame();
    this.timer = window.setInterval(() => this.publish(this.game.tick(Date.now())), SOLO_TICK_MS);
    queueMicrotask(() => this.publish(this.game.start(Date.now())));
  }

  private newGame(): CardGame {
    const game = new CardGame();
    game.addPlayer(SOLO_ID, this.name, false);
    const names = [...CARD_GAME.bots.names].sort(() => Math.random() - 0.5);
    for (let k = 0; k < this.bots; k++) game.addPlayer(`bot-${k}`, names[k] ?? `Bot ${k + 1}`, true);
    return game;
  }

  private publish(events: GameEvent[]): void {
    for (const e of events) for (const cb of this.eventCbs) cb(e);
    const view = this.game.view(Date.now());
    for (const cb of this.viewCbs) cb(view);
  }

  answer(category: CategoryId | null, text: string): void {
    const { error, events } = this.game.answer(SOLO_ID, category, text, Date.now());
    if (error) for (const cb of this.noticeCbs) cb({ level: 'error', text: error });
    this.publish(events);
  }

  onView(cb: (view: GameView) => void): void {
    this.viewCbs.push(cb);
  }

  onEvent(cb: (event: GameEvent) => void): void {
    this.eventCbs.push(cb);
  }

  onNotice(cb: (notice: Notice) => void): void {
    this.noticeCbs.push(cb);
  }

  onDisconnected(): void {
    /* tout se passe dans la page */
  }

  onConnection(): void {
    /* pas de réseau en solo */
  }

  restart(): void {
    this.game = this.newGame();
    this.publish(this.game.start(Date.now()));
  }

  leave(): void {
    window.clearInterval(this.timer);
  }
}
