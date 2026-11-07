/**
 * Une table en ligne sans serveur à nous : tous les joueurs se retrouvent sur un
 * canal temps réel (Supabase Realtime en vrai). Le téléphone de l'HÔTE fait
 * tourner la partie (CardGame) et envoie la table aux autres ; les autres
 * n'envoient que leurs réponses. Si l'hôte disparaît, le joueur arrivé le plus
 * tôt reprend la partie à partir de la dernière sauvegarde reçue (« époque »
 * suivante) ; un ancien hôte qui revient se range derrière le nouveau.
 *
 * Limite assumée : l'hôte pourrait tricher en modifiant son appli, et la
 * sauvegarde diffusée (pour la reprise) contient les paquets.
 */
import { z } from 'zod';
import { CARD_GAME, ONLINE } from '../config/cards.js';
import { PSEUDO_RULES } from '../config/players.js';
import { CardGame, type GameEvent, type GameSnapshot, type GameView } from '../cards/game.js';
import { CATEGORY_IDS, type CategoryId } from '../cards/categories.js';
import { containsBannedWord } from '../formulas/moderation.js';
import type { Notice } from '../protocol/index.js';
import type { Channel, PresenceMeta, Scheduler, Transport } from './transport.js';

export const tableChannel = (code: string) => `bb-table:${code}`;
export const LOBBY_CHANNEL = 'bb-lobby';

const isObject = (v: unknown) => typeof v === 'object' && v !== null;
const idSchema = z.string().min(1).max(64);

/** Messages entre téléphones : tout ce qui arrive des autres est vérifié. */
const memberSchema = z.object({ id: idSchema, name: z.string().min(1).max(40), joinedAt: z.number() });
const syncSchema = z.object({
  hostId: idSchema,
  epoch: z.number().int().min(1),
  isPublic: z.boolean(),
  view: z.custom<GameView>(isObject),
  snapshot: z.custom<GameSnapshot>(isObject),
});
const eventMessageSchema = z.object({ epoch: z.number().int(), event: z.custom<GameEvent>(isObject) });
const answerMessageSchema = z.object({
  from: idSchema,
  category: z.enum(CATEGORY_IDS as [CategoryId, ...CategoryId[]]).nullable(),
  text: z.string().max(CARD_GAME.answer.maxLength),
});
const noticeMessageSchema = z.object({
  to: z.string(),
  notice: z.object({ level: z.enum(['info', 'error']), text: z.string().max(200) }),
});
const lobbyEntrySchema = z.object({ id: z.string(), code: z.string(), players: z.number(), phase: z.string(), max: z.number() });

export interface OnlineTableCallbacks {
  view: (view: GameView) => void;
  event: (event: GameEvent) => void;
  notice: (notice: Notice) => void;
}

/** Pseudo affiché aux autres : propre et de longueur raisonnable. */
function safeName(name: string): string {
  const n = name.trim().slice(0, PSEUDO_RULES.maxLength);
  return n.length >= PSEUDO_RULES.minLength && !containsBannedWord(n) ? n : 'Joueur';
}

export class OnlineTable {
  private channel: Channel | null = null;
  /** Partie, si c'est ce téléphone qui arbitre (hôte). */
  private game: CardGame | null = null;
  private epoch = 0;
  private hostId = '';
  private lastSyncAt = 0;
  private lastSentAt = 0;
  private lastSnapshot: GameSnapshot | null = null;
  private readonly absentSince = new Map<string, number>();
  private readonly stops: (() => void)[] = [];
  private lobby: Channel | null = null;
  private lobbyKey = '';
  private closed = false;

  constructor(
    private readonly transport: Transport,
    private readonly sched: Scheduler,
    readonly code: string,
    private readonly me: { id: string; name: string },
    private isPublic: boolean,
    private readonly cb: OnlineTableCallbacks,
    private readonly rand: () => number = Math.random,
  ) {}

  get isHost(): boolean {
    return this.game !== null;
  }

  /** Crée la table (on en est l'hôte) ou la rejoint ; « not-found » si personne n'y répond. */
  async open(mode: 'create' | 'join'): Promise<'ok' | 'not-found'> {
    const ch = await this.transport.join(tableChannel(this.code));
    this.channel = ch;
    ch.on('sync', (raw) => this.onSync(raw));
    ch.on('event', (raw) => this.onEvent(raw));
    ch.on('answer', (raw) => this.onAnswer(raw));
    ch.on('notice', (raw) => this.onNotice(raw));
    ch.on('hostLeft', () => {
      // L'hôte quitte la table : on élit le suivant tout de suite.
      if (!this.isHost) this.lastSyncAt = Math.min(this.lastSyncAt, this.sched.now() - ONLINE.hostTimeoutMs - 1);
    });
    ch.track({ id: this.me.id, name: safeName(this.me.name), joinedAt: this.sched.now() });
    this.stops.push(this.sched.every(ONLINE.tickMs, () => this.tick()));
    if (mode === 'create') {
      const game = new CardGame(this.rand);
      game.addPlayer(this.me.id, safeName(this.me.name), false);
      this.becomeHost(game, 1);
      return 'ok';
    }
    const started = this.sched.now();
    return new Promise((resolve) => {
      const stop = this.sched.every(ONLINE.tickMs, () => {
        if (this.lastSyncAt > 0 || this.isHost) {
          stop();
          resolve('ok');
        } else if (this.sched.now() - started >= ONLINE.joinTimeoutMs) {
          stop();
          this.close();
          resolve('not-found');
        }
      });
    });
  }

  /** Répondre pendant un duel. */
  answer(category: CategoryId | null, text: string): void {
    if (this.isHost) return this.handleAnswer({ from: this.me.id, category, text });
    this.channel?.send('answer', { from: this.me.id, category, text } satisfies z.infer<typeof answerMessageSchema>);
  }

  /** Quitter la table (l'hôte passe la main tout de suite). */
  leave(): void {
    if (this.closed) return;
    if (this.game && this.channel) {
      this.game.removePlayer(this.me.id);
      this.sendSync();
      this.channel.send('hostLeft', { epoch: this.epoch });
    }
    this.close();
  }

  // ---------- Réception ----------

  private onSync(raw: unknown): void {
    const msg = syncSchema.safeParse(raw);
    if (!msg.success || msg.data.epoch < this.epoch) return;
    const m = msg.data;
    if (this.isHost) {
      // Deux hôtes : l'époque la plus récente gagne (à égalité, le plus petit identifiant).
      const theyWin = m.epoch > this.epoch || m.hostId < this.me.id;
      if (!theyWin) return;
      this.stepDown();
    }
    this.epoch = m.epoch;
    this.hostId = m.hostId;
    this.isPublic = m.isPublic;
    this.lastSyncAt = this.sched.now();
    this.lastSnapshot = m.snapshot;
    this.cb.view(m.view);
  }

  private onEvent(raw: unknown): void {
    const msg = eventMessageSchema.safeParse(raw);
    if (!msg.success || this.isHost || msg.data.epoch < this.epoch) return;
    this.cb.event(msg.data.event);
  }

  private onAnswer(raw: unknown): void {
    if (!this.isHost) return;
    const msg = answerMessageSchema.safeParse(raw);
    if (msg.success) this.handleAnswer(msg.data);
  }

  private onNotice(raw: unknown): void {
    const msg = noticeMessageSchema.safeParse(raw);
    if (msg.success && (msg.data.to === this.me.id || msg.data.to === '*')) this.cb.notice(msg.data.notice);
  }

  // ---------- Hôte ----------

  private handleAnswer(a: z.infer<typeof answerMessageSchema>): void {
    const game = this.game;
    if (!game) return;
    const { error, events } = game.answer(a.from, a.category, a.text, this.sched.now());
    if (error) this.noticeTo(a.from, { level: 'error', text: error });
    this.publish(events);
  }

  private noticeTo(to: string, notice: Notice): void {
    if (to === this.me.id || to === '*') this.cb.notice(notice);
    if (to !== this.me.id) this.channel?.send('notice', { to, notice });
  }

  private becomeHost(game: CardGame, epoch: number): void {
    this.game = game;
    this.epoch = epoch;
    this.hostId = this.me.id;
    this.sendSync();
  }

  private stepDown(): void {
    this.game = null;
    this.lobby?.leave();
    this.lobby = null;
    this.lobbyKey = '';
  }

  private publish(events: GameEvent[]): void {
    for (const event of events) {
      this.channel?.send('event', { epoch: this.epoch, event });
      this.cb.event(event);
    }
    if (events.length > 0) this.sendSync();
  }

  private sendSync(): void {
    const game = this.game;
    if (!game || !this.channel) return;
    const now = this.sched.now();
    const view = game.view(now);
    this.channel.send('sync', { hostId: this.me.id, epoch: this.epoch, isPublic: this.isPublic, view, snapshot: game.snapshot(now) });
    this.lastSentAt = now;
    this.cb.view(view);
    this.updateLobby(view);
  }

  /** Qui est à la table : arrivées, retours, départs (un bot remplace qui ne revient pas). */
  private membership(game: CardGame, now: number): void {
    const present = new Map<string, z.infer<typeof memberSchema>>();
    for (const raw of this.channel?.present() ?? []) {
      const m = memberSchema.safeParse(raw);
      if (m.success) present.set(m.data.id, m.data);
    }
    for (const m of present.values()) {
      this.absentSince.delete(m.id);
      if (game.rejoin(m.id)) continue;
      if (!game.players.some((p) => p.id === m.id) && game.phase === 'waiting') game.addPlayer(m.id, safeName(m.name), false);
    }
    // Un joueur absent garde sa place un moment (réseau qui saute), puis un bot le remplace.
    const grace = game.phase === 'waiting' ? ONLINE.hostTimeoutMs : ONLINE.reconnectSeconds * 1000;
    for (const p of [...game.players]) {
      if (p.bot || p.id === this.me.id || present.has(p.id)) continue;
      const since = this.absentSince.get(p.id) ?? now;
      this.absentSince.set(p.id, since);
      if (now - since >= grace) {
        game.removePlayer(p.id);
        this.absentSince.delete(p.id);
      }
    }
    game.scheduleStart(now);
  }

  private tick(): void {
    if (this.closed) return;
    const now = this.sched.now();
    const game = this.game;
    if (game) {
      const before = JSON.stringify(game.players.map((p) => [p.id, p.bot]));
      this.membership(game, now);
      const events = game.tick(now);
      this.publish(events);
      const changed = before !== JSON.stringify(game.players.map((p) => [p.id, p.bot]));
      if (changed || now - this.lastSentAt >= ONLINE.syncMs) this.sendSync();
      return;
    }
    // Plus de nouvelles de l'hôte : le joueur arrivé le plus tôt reprend la partie.
    if (this.lastSyncAt > 0 && now - this.lastSyncAt > ONLINE.hostTimeoutMs && this.lastSnapshot) {
      const candidates = (this.channel?.present() ?? [])
        .map((raw) => memberSchema.safeParse(raw))
        .flatMap((m) => (m.success && m.data.id !== this.hostId ? [m.data] : []))
        .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
      if (candidates[0]?.id !== this.me.id) return;
      const previous = this.hostId;
      const restored = CardGame.restore(this.lastSnapshot, now, this.rand);
      this.absentSince.set(previous, now);
      this.becomeHost(restored, this.epoch + 1);
      this.noticeTo('*', { level: 'info', text: `L’hôte est parti : ${safeName(this.me.name)} reprend la partie.` });
    }
  }

  // ---------- Salon (partie rapide) ----------

  private updateLobby(view: GameView): void {
    if (!this.isPublic || !this.game) return;
    const entry = { id: this.code, code: this.code, players: view.players.filter((p) => !p.bot).length, phase: view.phase, max: CARD_GAME.players.max };
    const key = JSON.stringify(entry);
    if (key === this.lobbyKey) return;
    this.lobbyKey = key;
    if (this.lobby) return this.lobby.track(entry);
    void this.transport.join(LOBBY_CHANNEL).then((lobby) => {
      if (!this.game || this.closed) return lobby.leave();
      this.lobby = lobby;
      lobby.track(JSON.parse(this.lobbyKey) as PresenceMeta);
    });
  }

  private close(): void {
    this.closed = true;
    this.stops.forEach((stop) => stop());
    this.lobby?.leave();
    this.channel?.leave();
    this.game = null;
  }
}

/** Partie rapide : une table publique qui attend des joueurs, ou null s'il n'y en a pas. */
export async function findPublicTable(transport: Transport, sched: Scheduler): Promise<string | null> {
  const lobby = await transport.join(LOBBY_CHANNEL);
  await new Promise<void>((resolve) => sched.after(ONLINE.lobbyScanMs, resolve));
  const open = lobby
    .present()
    .map((raw) => lobbyEntrySchema.safeParse(raw))
    .flatMap((e) => (e.success && e.data.phase === 'waiting' && e.data.players < e.data.max ? [e.data] : []))
    .sort((a, b) => b.players - a.players);
  lobby.leave();
  return open[0]?.code ?? null;
}

/** Nouveau code de table (lettres et chiffres faciles à dicter). */
export function newTableCode(rand: () => number = Math.random): string {
  return Array.from({ length: ONLINE.codeLength }, () => ONLINE.codeAlphabet[Math.floor(rand() * ONLINE.codeAlphabet.length)]).join('');
}
