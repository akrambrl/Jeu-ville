/**
 * Une room = une table de jeu en ligne (2 à 6 vrais joueurs). La partie
 * (CardGame, dans shared) fait autorité ; la room relaie les réponses validées
 * et diffuse la table. Les paquets restent secrets : seule la vue publique
 * (nombre de cartes, carte du dessus de chaque pile) est envoyée.
 */
import { Room, type Client } from '@colyseus/core';
import {
  CARD_GAME,
  CardClientMessage,
  CardGame,
  CardServerMessage,
  answerSchema,
  cardsJoinSchema,
  type GameEvent,
  type Notice,
} from '@jeu-ville/shared';
import { db } from '../db/client.js';
import { playerFromToken } from '../domain/auth.js';
import { GameError } from '../domain/errors.js';

interface AuthData {
  playerId: string;
  pseudo: string;
}

/** Fréquence de la boucle de la table (ms). */
const TICK_MS = 100;

export class CardRoom extends Room {
  override maxClients = CARD_GAME.players.max;
  private readonly game = new CardGame();
  /** Compte (playerId) de chaque session. */
  private readonly accounts = new Map<string, string>();

  override onCreate(): void {
    this.onMessage(CardClientMessage.answer, (client, raw) => {
      const parsed = answerSchema.safeParse(raw);
      if (!parsed.success) return;
      const { error, events } = this.game.answer(client.sessionId, parsed.data.category, parsed.data.text, Date.now());
      if (error) client.send(CardServerMessage.notice, { level: 'error', text: error } satisfies Notice);
      this.publish(events);
    });
    this.setSimulationInterval(() => this.publish(this.game.tick(Date.now())), TICK_MS);
  }

  override async onAuth(_client: Client, rawOptions: unknown): Promise<AuthData> {
    const { token } = cardsJoinSchema.parse(rawOptions);
    const player = await playerFromToken(db, token);
    if (!player) throw new GameError('Session invalide.', 401);
    return { playerId: player.id, pseudo: player.pseudo };
  }

  override onJoin(client: Client, _options: unknown, auth: AuthData): void {
    // Une seule place par compte : l'ancienne connexion cède la sienne.
    for (const [sessionId, playerId] of this.accounts) {
      if (playerId === auth.playerId) this.clients.find((c) => c.sessionId === sessionId)?.leave();
    }
    const error = this.game.addPlayer(client.sessionId, auth.pseudo, false);
    if (error) throw new GameError(error, 409);
    this.accounts.set(client.sessionId, auth.playerId);
    this.game.scheduleStart(Date.now());
    this.publish([], true);
  }

  override onLeave(client: Client): void {
    this.accounts.delete(client.sessionId);
    this.game.removePlayer(client.sessionId);
    this.game.scheduleStart(Date.now());
    this.publish([], true);
  }

  private publish(events: GameEvent[], force = false): void {
    for (const e of events) this.broadcast(CardServerMessage.event, e);
    if (events.some((e) => e.kind === 'letter' && e.round === 1)) void this.lock();
    if (events.some((e) => e.kind === 'waiting')) {
      void this.unlock();
      this.game.scheduleStart(Date.now());
    }
    // La table change à chaque événement ; sinon une vue par seconde suffit (minuteur).
    const now = Date.now();
    if (force || events.length > 0 || now - this.lastView >= VIEW_REFRESH_MS) {
      this.lastView = now;
      this.broadcast(CardServerMessage.view, this.game.view(now));
    }
  }

  private lastView = 0;
}

/** Rafraîchissement de la vue sans événement (minuteurs), ms. */
const VIEW_REFRESH_MS = 1_000;
