/**
 * Lien du chat général : la room Colyseus du serveur (vrais joueurs), ou une
 * version locale pour la démo solo (ses propres messages et quelques bots).
 */
import type { Room } from 'colyseus.js';
import {
  CHAT,
  ChatClientMessage,
  ChatServerMessage,
  DEMO_CHAT_LINES,
  botName,
  canSendChat,
  cleanChatText,
  maskBannedWords,
  replyExcerpt,
  type ChatLine,
  type ChatSayMessage,
  type Notice,
} from '@jeu-ville/shared';

export interface ChatHandlers {
  history: (lines: ChatLine[]) => void;
  line: (line: ChatLine) => void;
  blocked: (characterIds: string[]) => void;
  notice: (notice: Notice) => void;
}

export interface ChatLink {
  /** Mon personnage (mes messages, pas de « signaler » sur eux). */
  readonly selfId: string;
  /** false dans la démo : il n'y a que des bots. */
  readonly realPlayers: boolean;
  subscribe(handlers: ChatHandlers): void;
  /** Envoie un message, éventuellement en réponse à `replyToId`. */
  say(text: string, replyToId?: string): void;
  report(messageId: string): void;
  block(characterId: string, blocked: boolean): void;
}

export class ColyseusChat implements ChatLink {
  readonly realPlayers = true;

  constructor(
    private readonly room: Room,
    readonly selfId: string,
  ) {}

  subscribe(h: ChatHandlers): void {
    this.room.onMessage(ChatServerMessage.history, h.history);
    this.room.onMessage(ChatServerMessage.line, h.line);
    this.room.onMessage(ChatServerMessage.blocked, h.blocked);
    this.room.onMessage(ChatServerMessage.notice, h.notice);
  }

  say(text: string, replyToId?: string): void {
    this.room.send(ChatClientMessage.say, { text, ...(replyToId ? { replyToId } : {}) } satisfies ChatSayMessage);
  }

  report(messageId: string): void {
    this.room.send(ChatClientMessage.report, { messageId });
  }

  block(characterId: string, blocked: boolean): void {
    this.room.send(ChatClientMessage.block, { characterId, blocked });
  }
}

/** Qui parle dans la démo : un passant proche (sa bulle s'affiche), ou personne. */
export type SpeakerPicker = () => { id: string; sex: string } | null;

export class DemoChat implements ChatLink {
  readonly realPlayers = false;
  private handlers: ChatHandlers | null = null;
  private readonly sentAt: number[] = [];
  private count = 0;
  /** Messages récents (pour citer celui auquel on répond). */
  private readonly recent: ChatLine[] = [];

  constructor(
    readonly selfId: string,
    private readonly selfName: string,
    private readonly districtId: string,
    private readonly pickSpeaker: SpeakerPicker,
  ) {
    this.scheduleBot();
  }

  subscribe(h: ChatHandlers): void {
    this.handlers = h;
    h.history([]);
    h.blocked([]);
  }

  say(raw: string, replyToId?: string): void {
    const text = maskBannedWords(cleanChatText(raw));
    if (!text) return;
    const now = Date.now();
    if (!canSendChat(this.sentAt, now)) {
      this.handlers?.notice({ level: 'error', text: 'Doucement ! Attends un peu avant de réécrire.' });
      return;
    }
    this.sentAt.push(now);
    const original = replyToId ? this.recent.find((l) => l.id === replyToId) : undefined;
    this.emit({ characterId: this.selfId, name: this.selfName, text, ...(original ? { replyTo: replyExcerpt(original) } : {}) });
  }

  report(): void {
    this.handlers?.notice({ level: 'info', text: 'Dans la démo, il n’y a que des bots : rien à signaler.' });
  }

  block(): void {
    this.handlers?.notice({ level: 'info', text: 'Dans la démo, il n’y a que des bots.' });
  }

  private scheduleBot(): void {
    const [min, max] = CHAT.demoBotEveryMs;
    window.setTimeout(() => {
      const speaker = this.pickSpeaker();
      if (speaker) {
        const text = DEMO_CHAT_LINES[Math.floor(Math.random() * DEMO_CHAT_LINES.length)]!;
        this.emit({ characterId: speaker.id, name: botName(speaker.id, speaker.sex), text, bot: true });
      }
      this.scheduleBot();
    }, min + Math.random() * (max - min));
  }

  private emit(l: Pick<ChatLine, 'characterId' | 'name' | 'text' | 'bot' | 'replyTo'>): void {
    const line: ChatLine = { id: `demo-${++this.count}`, districtId: this.districtId, at: Date.now(), ...l };
    this.recent.push(line);
    if (this.recent.length > CHAT.historySize) this.recent.shift();
    this.handlers?.line(line);
  }
}
