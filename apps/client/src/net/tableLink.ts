/**
 * Lien entre l'écran de la table et la partie : une table en ligne (arbitrée
 * par le téléphone de l'hôte), ou une partie simulée dans la page contre des
 * bots (mode solo).
 */
import {
  CARD_GAME,
  CardGame,
  OnlineTable,
  realScheduler,
  type Transport,
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

/**
 * Table en ligne, sans serveur à nous (voir OnlineTable dans shared) : le
 * téléphone de l'hôte arbitre ; si l'hôte part, un autre joueur reprend.
 */
export class OnlineTableLink implements TableLink {
  readonly mode = 'online';
  private readonly viewCbs: ((v: GameView) => void)[] = [];
  private readonly eventCbs: ((e: GameEvent) => void)[] = [];
  private readonly noticeCbs: ((n: Notice) => void)[] = [];
  readonly table: OnlineTable;

  constructor(
    transport: Transport,
    code: string,
    readonly myId: string,
    name: string,
    isPublic: boolean,
  ) {
    this.table = new OnlineTable(transport, realScheduler, code, { id: myId, name }, isPublic, {
      view: (v) => this.viewCbs.forEach((cb) => cb(v)),
      event: (e) => this.eventCbs.forEach((cb) => cb(e)),
      notice: (n) => this.noticeCbs.forEach((cb) => cb(n)),
    });
    this.tableCode = isPublic ? null : code;
  }

  /** Code de la table entre amis (null : partie rapide). */
  readonly tableCode: string | null;

  answer(category: CategoryId | null, text: string): void {
    this.table.answer(category, text);
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
    /* le transport se reconnecte tout seul ; l'hôte garde notre place un moment */
  }

  onConnection(): void {
    /* idem */
  }

  restart(): void {
    /* en ligne, la table revient toute seule au salon après le classement */
  }

  leave(): void {
    this.table.leave();
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
