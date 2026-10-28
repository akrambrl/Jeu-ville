/**
 * Chat général : une seule room pour tout le serveur. Le serveur nettoie le
 * texte, masque les insultes, limite le flood ; on peut signaler un message
 * (copie gardée pour la modération) et bloquer un joueur (persisté).
 */
import { randomUUID } from 'node:crypto';
import { Room, type Client } from '@colyseus/core';
import {
  CHAT,
  ChatClientMessage,
  ChatServerMessage,
  canSendChat,
  chatBlockSchema,
  chatJoinSchema,
  chatReportSchema,
  chatSaySchema,
  cleanChatText,
  maskBannedWords,
  replyExcerpt,
  type ChatLine,
  type Notice,
} from '@jeu-ville/shared';
import { db } from '../db/client.js';
import { playerFromToken } from '../domain/auth.js';
import { getCharacterByPlayer } from '../domain/characters.js';
import { listBlocked, reportLine, setBlocked } from '../domain/chat.js';
import { GameError } from '../domain/errors.js';

interface ChatAuth {
  characterId: string;
  name: string;
  districtId: string;
}

export class ChatRoom extends Room {
  private readonly history: ChatLine[] = [];
  private readonly sentAt = new Map<string, number[]>();

  override onCreate(): void {
    this.onMessage(ChatClientMessage.say, (client, raw) => this.handleSay(client, raw));
    this.onMessage(ChatClientMessage.report, (client, raw) => void this.guard(client, () => this.handleReport(client, raw)));
    this.onMessage(ChatClientMessage.block, (client, raw) => void this.guard(client, () => this.handleBlock(client, raw)));
  }

  override async onAuth(_client: Client, rawOptions: unknown): Promise<ChatAuth> {
    const options = chatJoinSchema.parse(rawOptions);
    const player = await playerFromToken(db, options.token);
    if (!player) throw new GameError('Session invalide.', 401);
    const character = await getCharacterByPlayer(db, player.id);
    if (!character) throw new GameError("Crée d'abord ton personnage.", 403);
    return { characterId: character.id, name: character.name, districtId: character.districtId };
  }

  override async onJoin(client: Client, _options: unknown, auth: ChatAuth): Promise<void> {
    client.send(ChatServerMessage.history, this.history);
    client.send(ChatServerMessage.blocked, await listBlocked(db, auth.characterId));
  }

  private auth(client: Client): ChatAuth {
    return client.auth as ChatAuth;
  }

  private handleSay(client: Client, raw: unknown): void {
    const parsed = chatSaySchema.safeParse(raw);
    if (!parsed.success) return;
    const me = this.auth(client);
    const text = maskBannedWords(cleanChatText(parsed.data.text));
    if (!text) return;
    const now = Date.now();
    const recent = (this.sentAt.get(me.characterId) ?? []).filter((t) => now - t < CHAT.burstWindowMs);
    if (!canSendChat(recent, now)) return this.notify(client, 'error', 'Doucement ! Attends un peu avant de réécrire.');
    recent.push(now);
    this.sentAt.set(me.characterId, recent);
    // Réponse : on cite le message d'origine s'il est encore dans l'historique.
    const original = parsed.data.replyToId ? this.history.find((l) => l.id === parsed.data.replyToId) : undefined;
    const line: ChatLine = {
      id: randomUUID(),
      characterId: me.characterId,
      name: me.name,
      districtId: me.districtId,
      text,
      at: now,
      ...(original ? { replyTo: replyExcerpt(original) } : {}),
    };
    this.history.push(line);
    if (this.history.length > CHAT.historySize) this.history.shift();
    this.broadcast(ChatServerMessage.line, line);
  }

  private async handleReport(client: Client, raw: unknown): Promise<void> {
    const parsed = chatReportSchema.safeParse(raw);
    if (!parsed.success) return;
    const line = this.history.find((l) => l.id === parsed.data.messageId);
    if (!line) return this.notify(client, 'error', 'Ce message est trop ancien pour être signalé.');
    const fresh = await reportLine(db, this.auth(client).characterId, line);
    this.notify(client, 'info', fresh ? 'Merci, le message a été signalé à la modération.' : 'Tu as déjà signalé ce message.');
  }

  private async handleBlock(client: Client, raw: unknown): Promise<void> {
    const parsed = chatBlockSchema.safeParse(raw);
    if (!parsed.success) return;
    const blocked = await setBlocked(db, this.auth(client).characterId, parsed.data.characterId, parsed.data.blocked);
    client.send(ChatServerMessage.blocked, blocked);
  }

  private async guard(client: Client, action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (err) {
      this.notify(client, 'error', err instanceof GameError ? err.message : 'Erreur du chat, réessaie.');
      if (!(err instanceof GameError)) console.error(err);
    }
  }

  private notify(client: Client, level: Notice['level'], text: string): void {
    client.send(ChatServerMessage.notice, { level, text } satisfies Notice);
  }
}
