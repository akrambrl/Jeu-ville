/**
 * Chat général : une seule room pour tout le serveur. Le serveur nettoie le
 * texte, masque les insultes, limite le flood ; on peut signaler un message
 * (copie gardée pour la modération) et bloquer un joueur (persisté).
 * Tous les joueurs connectés y sont : c'est aussi là que l'on suit qui est en
 * ligne, pour les amis (liste, demandes, « un ami vient de se connecter »).
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
  friendRemoveSchema,
  friendRequestSchema,
  friendRespondSchema,
  type FriendEvent,
  type FriendsView,
  maskBannedWords,
  replyExcerpt,
  type ChatLine,
  type Notice,
} from '@jeu-ville/shared';
import { db } from '../db/client.js';
import { playerFromToken } from '../domain/auth.js';
import { getCharacterByPlayer } from '../domain/characters.js';
import { listBlocked, reportLine, setBlocked } from '../domain/chat.js';
import { findCharacterByName, friendIds, listFriendships, removeFriend, requestFriend, respondFriend } from '../domain/friends.js';
import { GameError } from '../domain/errors.js';

interface ChatAuth {
  characterId: string;
  name: string;
  districtId: string;
}

export class ChatRoom extends Room {
  private readonly history: ChatLine[] = [];
  private readonly sentAt = new Map<string, number[]>();
  /** Connexions par personnage (un joueur peut avoir plusieurs onglets). */
  private readonly online = new Map<string, Set<Client>>();

  override onCreate(): void {
    this.onMessage(ChatClientMessage.say, (client, raw) => this.handleSay(client, raw));
    this.onMessage(ChatClientMessage.report, (client, raw) => void this.guard(client, () => this.handleReport(client, raw)));
    this.onMessage(ChatClientMessage.block, (client, raw) => void this.guard(client, () => this.handleBlock(client, raw)));
    this.onMessage(ChatClientMessage.friendRequest, (client, raw) => void this.guard(client, () => this.handleFriendRequest(client, raw)));
    this.onMessage(ChatClientMessage.friendRespond, (client, raw) => void this.guard(client, () => this.handleFriendRespond(client, raw)));
    this.onMessage(ChatClientMessage.friendRemove, (client, raw) => void this.guard(client, () => this.handleFriendRemove(client, raw)));
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
    const sessions = this.online.get(auth.characterId) ?? new Set<Client>();
    sessions.add(client);
    this.online.set(auth.characterId, sessions);
    await this.sendFriends(auth.characterId);
    // Première connexion : ses amis en ligne sont prévenus.
    if (sessions.size === 1) {
      for (const id of await friendIds(db, auth.characterId)) {
        if (!this.online.has(id)) continue;
        this.event(id, { kind: 'online', name: auth.name });
        await this.sendFriends(id);
      }
    }
  }

  override async onLeave(client: Client): Promise<void> {
    const me = this.auth(client);
    const sessions = this.online.get(me.characterId);
    sessions?.delete(client);
    if (sessions && sessions.size > 0) return;
    this.online.delete(me.characterId);
    for (const id of await friendIds(db, me.characterId)) if (this.online.has(id)) await this.sendFriends(id);
  }

  /** Liste d'amis à jour, envoyée à toutes les connexions du joueur (s'il est en ligne). */
  private async sendFriends(characterId: string): Promise<void> {
    const clients = this.online.get(characterId);
    if (!clients) return;
    const rows = await listFriendships(db, characterId);
    const view: FriendsView = {
      friends: rows
        .filter((r) => r.status === 'accepted')
        .map((r) => ({ characterId: r.characterId, name: r.name, districtId: r.districtId, online: this.online.has(r.characterId) }))
        .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'fr')),
      incoming: rows.filter((r) => r.status === 'pending' && !r.mine).map(({ characterId: id, name }) => ({ characterId: id, name })),
      outgoing: rows.filter((r) => r.status === 'pending' && r.mine).map(({ characterId: id, name }) => ({ characterId: id, name })),
    };
    for (const c of clients) c.send(ChatServerMessage.friends, view);
  }

  private event(characterId: string, e: FriendEvent): void {
    for (const c of this.online.get(characterId) ?? []) c.send(ChatServerMessage.friendEvent, e);
  }

  private async handleFriendRequest(client: Client, raw: unknown): Promise<void> {
    const parsed = friendRequestSchema.safeParse(raw);
    if (!parsed.success) return this.notify(client, 'error', 'Indique le pseudo d’un joueur.');
    const me = this.auth(client);
    const target = parsed.data.characterId
      ? { characterId: parsed.data.characterId, name: '' }
      : await findCharacterByName(db, parsed.data.name ?? '');
    if (!target) return this.notify(client, 'error', 'Aucun joueur ne porte ce pseudo.');
    const result = await requestFriend(db, me.characterId, target.characterId);
    const name = target.name || (await listFriendships(db, me.characterId)).find((f) => f.characterId === target.characterId)?.name || 'ce joueur';
    if (result === 'accepted') {
      this.notify(client, 'info', `🤝 Toi et ${name}, vous êtes maintenant amis !`);
      this.event(target.characterId, { kind: 'accepted', name: me.name });
    } else {
      this.notify(client, 'info', `👋 Demande d’ami envoyée à ${name}.`);
      this.event(target.characterId, { kind: 'request', name: me.name });
    }
    await Promise.all([this.sendFriends(me.characterId), this.sendFriends(target.characterId)]);
  }

  private async handleFriendRespond(client: Client, raw: unknown): Promise<void> {
    const parsed = friendRespondSchema.safeParse(raw);
    if (!parsed.success) return;
    const me = this.auth(client);
    await respondFriend(db, me.characterId, parsed.data.characterId, parsed.data.accept);
    if (parsed.data.accept) this.event(parsed.data.characterId, { kind: 'accepted', name: me.name });
    await Promise.all([this.sendFriends(me.characterId), this.sendFriends(parsed.data.characterId)]);
  }

  private async handleFriendRemove(client: Client, raw: unknown): Promise<void> {
    const parsed = friendRemoveSchema.safeParse(raw);
    if (!parsed.success) return;
    const me = this.auth(client);
    await removeFriend(db, me.characterId, parsed.data.characterId);
    await Promise.all([this.sendFriends(me.characterId), this.sendFriends(parsed.data.characterId)]);
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
    const me = this.auth(client).characterId;
    const blocked = await setBlocked(db, me, parsed.data.characterId, parsed.data.blocked);
    client.send(ChatServerMessage.blocked, blocked);
    // Bloquer quelqu'un met fin à l'amitié (ou à la demande) avec lui.
    if (parsed.data.blocked) {
      await removeFriend(db, me, parsed.data.characterId);
      await Promise.all([this.sendFriends(me), this.sendFriends(parsed.data.characterId)]);
    }
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
