import { describe, expect, it } from 'vitest';
import { CARD_GAME, ONLINE } from '../config/cards.js';
import type { GameEvent, GameView } from '../cards/game.js';
import type { Notice } from '../protocol/index.js';
import { OnlineTable, findPublicTable } from './table.js';
import { ManualScheduler, MemoryTransport } from './transport.js';

/** Laisse passer les promesses en attente (abonnements aux canaux). */
const flush = () => new Promise((r) => setTimeout(r, 0));

function phone(net: MemoryTransport, sched: ManualScheduler, id: string, code: string, isPublic = false) {
  const views: GameView[] = [];
  const events: GameEvent[] = [];
  const notices: Notice[] = [];
  const transport = net.client();
  const table = new OnlineTable(transport, sched, code, { id, name: `Joueur${id}` }, isPublic, {
    view: (v) => views.push(v),
    event: (e) => events.push(e),
    notice: (n) => notices.push(n),
  });
  return { table, transport, views, events, notices, last: () => views.at(-1)! };
}

async function openBoth(net: MemoryTransport, sched: ManualScheduler) {
  const a = phone(net, sched, 'aaa', 'CODE1');
  const b = phone(net, sched, 'bbb', 'CODE1');
  expect(await a.table.open('create')).toBe('ok');
  sched.advance(10);
  const joining = b.table.open('join');
  await flush();
  sched.advance(ONLINE.syncMs + ONLINE.tickMs);
  expect(await joining).toBe('ok');
  return { a, b };
}

describe('table en ligne (sans serveur)', () => {
  it('l’hôte crée la table, un ami la rejoint, la partie démarre pour les deux', async () => {
    const net = new MemoryTransport();
    const sched = new ManualScheduler();
    const { a, b } = await openBoth(net, sched);
    expect(a.table.isHost).toBe(true);
    expect(b.table.isHost).toBe(false);
    expect(b.last().players.map((p) => p.id)).toEqual(['aaa', 'bbb']);
    sched.advance(CARD_GAME.timing.lobbyMs + 200);
    expect(b.last().phase).toBe('ante');
    expect(b.events.some((e) => e.kind === 'ante')).toBe(true);
  });

  it('les réponses sont relayées à l’hôte, qui répond au seul joueur concerné', async () => {
    const net = new MemoryTransport();
    const sched = new ManualScheduler();
    const { a, b } = await openBoth(net, sched);
    b.table.answer(null, 'banane');
    expect(b.notices.at(-1)?.text).toMatch(/catégories/);
    expect(a.notices).toHaveLength(0);
  });

  it('un code inconnu : personne ne répond', async () => {
    const net = new MemoryTransport();
    const sched = new ManualScheduler();
    const c = phone(net, sched, 'ccc', 'ZZZZZ');
    const joining = c.table.open('join');
    await flush();
    sched.advance(ONLINE.joinTimeoutMs + ONLINE.tickMs);
    expect(await joining).toBe('not-found');
  });

  it('l’hôte perd le réseau : l’autre joueur reprend la partie là où elle en était', async () => {
    const net = new MemoryTransport();
    const sched = new ManualScheduler();
    const { a, b } = await openBoth(net, sched);
    sched.advance(CARD_GAME.timing.lobbyMs + CARD_GAME.timing.anteMs + 500);
    const round = b.last().round;
    const coins = b.last().players.map((p) => p.coins);
    a.transport.cut(true);
    sched.advance(ONLINE.hostTimeoutMs + ONLINE.syncMs);
    expect(b.table.isHost).toBe(true);
    expect(b.notices.at(-1)?.text).toMatch(/reprend la partie/);
    expect(b.last().round).toBeGreaterThanOrEqual(round);
    expect(b.last().players.map((p) => p.coins)).toEqual(coins);
    // L'ancien hôte ne revient pas : un bot prend sa place.
    sched.advance(ONLINE.reconnectSeconds * 1000 + ONLINE.syncMs);
    expect(b.last().players.find((p) => p.id === 'aaa')).toMatchObject({ bot: true, left: true });
  });

  it('l’ancien hôte revient : il se range derrière le nouveau et reprend sa place', async () => {
    const net = new MemoryTransport();
    const sched = new ManualScheduler();
    const { a, b } = await openBoth(net, sched);
    sched.advance(CARD_GAME.timing.lobbyMs + 500);
    a.transport.cut(true);
    sched.advance(ONLINE.hostTimeoutMs + ONLINE.syncMs);
    expect(b.table.isHost).toBe(true);
    a.transport.cut(false);
    sched.advance(ONLINE.syncMs * 2);
    expect(a.table.isHost).toBe(false);
    expect(b.table.isHost).toBe(true);
    expect(a.last().players.find((p) => p.id === 'aaa')).toMatchObject({ bot: false });
  });

  it('l’hôte quitte la table : la main passe tout de suite', async () => {
    const net = new MemoryTransport();
    const sched = new ManualScheduler();
    const { a, b } = await openBoth(net, sched);
    sched.advance(CARD_GAME.timing.lobbyMs + 500);
    a.table.leave();
    sched.advance(ONLINE.tickMs * 2);
    expect(b.table.isHost).toBe(true);
  });

  it('partie rapide : une table publique en attente se trouve dans le salon', async () => {
    const net = new MemoryTransport();
    const sched = new ManualScheduler();
    const host = phone(net, sched, 'hhh', 'PUB01', true);
    await host.table.open('create');
    await flush();
    sched.advance(ONLINE.syncMs);
    await flush();
    const finding = findPublicTable(net.client(), sched);
    await flush();
    sched.advance(ONLINE.lobbyScanMs);
    expect(await finding).toBe('PUB01');
    // Une table privée n'apparaît pas.
    const net2 = new MemoryTransport();
    const priv = phone(net2, sched, 'ppp', 'PRIV1', false);
    await priv.table.open('create');
    const finding2 = findPublicTable(net2.client(), sched);
    await flush();
    sched.advance(ONLINE.lobbyScanMs);
    expect(await finding2).toBeNull();
  });
});
