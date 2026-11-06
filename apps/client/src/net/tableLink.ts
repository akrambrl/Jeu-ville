/**
 * Lien entre l'écran de la table et la partie : le serveur (Colyseus) en ligne,
 * ou une partie simulée dans la page contre des bots (mode solo).
 */
import type { Room } from 'colyseus.js';
import {
  CARD_GAME,
  CardClientMessage,
  CardGame,
  CardServerMessage,
  type AnswerMessage,
  type CategoryId,
  type GameEvent,
  type GameView,
  type Notice,
} from '@jeu-ville/shared';

export interface TableLink {
  /** Identifiant de ce joueur à la table. */
  readonly myId: string;
  readonly mode: 'online' | 'solo';
  answer(category: CategoryId, text: string): void;
  onView(cb: (view: GameView) => void): void;
  onEvent(cb: (event: GameEvent) => void): void;
  onNotice(cb: (notice: Notice) => void): void;
  onDisconnected(cb: () => void): void;
  /** Solo : nouvelle partie avec les mêmes adversaires. */
  restart(): void;
  leave(): void;
}

/** Table en ligne : le serveur fait autorité. */
export class OnlineTableLink implements TableLink {
  readonly mode = 'online';

  constructor(private readonly room: Room) {}

  get myId(): string {
    return this.room.sessionId;
  }

  answer(category: CategoryId, text: string): void {
    this.room.send(CardClientMessage.answer, { category, text } satisfies AnswerMessage);
  }

  onView(cb: (view: GameView) => void): void {
    this.room.onMessage(CardServerMessage.view, cb);
  }

  onEvent(cb: (event: GameEvent) => void): void {
    this.room.onMessage(CardServerMessage.event, cb);
  }

  onNotice(cb: (notice: Notice) => void): void {
    this.room.onMessage(CardServerMessage.notice, cb);
  }

  onDisconnected(cb: () => void): void {
    this.room.onLeave((code) => {
      if (code !== 1000) cb();
    });
  }

  restart(): void {
    /* en ligne, la table revient toute seule au salon après le classement */
  }

  leave(): void {
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

  answer(category: CategoryId, text: string): void {
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

  restart(): void {
    this.game = this.newGame();
    this.publish(this.game.start(Date.now()));
  }

  leave(): void {
    window.clearInterval(this.timer);
  }
}
