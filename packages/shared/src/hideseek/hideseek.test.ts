import { describe, expect, it } from 'vitest';
import { HIDE_SEEK } from '../config/hideSeek.js';
import { MapGrid } from '../map/grid.js';
import { makeGrid } from '../map/testGrid.js';
import { reachableTiles } from '../map/passersby.js';
import { getArena } from './arena.js';
import { HideSeekMatch, type HideSeekEvent } from './match.js';
import { splitRoles } from './roles.js';
import { canSee, hasLineOfSight } from './sight.js';
import { hidingSpots, spotBlocksTile } from './spots.js';

const LOOK = { sex: 'male', baseLook: 0, skinTone: 0, hairColor: 0, bodyType: 0 } as const;
const { hidingMs, seekingMs, lobbyMs, resultsMs } = HIDE_SEEK.phases;

/** Générateur pseudo-aléatoire reproductible. */
function seeded(seed = 42): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Fait tourner la partie jusqu'à `until` (ms), par pas de 100 ms. */
function run(match: HideSeekMatch, from: number, until: number): HideSeekEvent[] {
  const events: HideSeekEvent[] = [];
  for (let t = from + 100; t <= until; t += 100) events.push(...match.tick(100, t));
  return events;
}

/** Amène le joueur `id` juste à côté de la cachette (sans marcher). */
function teleportNextTo(match: HideSeekMatch, id: string, spotId: string): void {
  const p = match.participants.get(id)!;
  const spot = match.spotById.get(spotId)!;
  Object.assign(p, { x: spot.access.x, y: spot.access.y, tile: { ...spot.access }, path: [] });
}

describe('quartier et cachettes', () => {
  const arena = getArena();
  const spots = hidingSpots(arena.map, arena.start);

  it('découpe un seul quartier de la carte', () => {
    expect(arena.map.width).toBe(HIDE_SEEK.arena.bounds.width);
    expect(arena.map.height).toBe(HIDE_SEEK.arena.bounds.height);
    expect(new MapGrid(arena.map).isWalkable(arena.start.x, arena.start.y)).toBe(true);
  });

  it('propose les cinq types de cachettes, de façon déterministe', () => {
    for (const kind of Object.keys(HIDE_SEEK.spots)) expect(spots.some((s) => s.kind === kind)).toBe(true);
    expect(hidingSpots(arena.map, arena.start)).toEqual(spots);
    expect(new Set(spots.map((s) => s.id)).size).toBe(spots.length);
  });

  it('toutes les cachettes restent accessibles depuis le départ malgré les objets posés', () => {
    const grid = new MapGrid(arena.map);
    const blocked = new Set(spots.filter(spotBlocksTile).map((s) => `${s.x},${s.y}`));
    const open = { ...grid, isWalkable: (x: number, y: number) => grid.isWalkable(x, y) && !blocked.has(`${x},${y}`) } as MapGrid;
    const reach = new Set(reachableTiles(open, arena.start).map((p) => `${p.x},${p.y}`));
    for (const s of spots) expect(reach.has(`${s.access.x},${s.access.y}`), s.id).toBe(true);
  });
});

describe('vue des chercheurs', () => {
  const grid = makeGrid(['.....', '..B..', '.....']);
  it('les bâtiments bloquent la vue', () => {
    expect(hasLineOfSight(grid, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(false);
    expect(hasLineOfSight(grid, { x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true);
  });
  it('la portée est limitée', () => {
    expect(canSee(grid, { x: 0, y: 0 }, { x: 4, y: 0 }, 3)).toBe(false);
    expect(canSee(grid, { x: 0, y: 0 }, { x: 3, y: 0 }, 3)).toBe(true);
  });
});

describe('répartition des rôles', () => {
  it('un joueur seul se cache, les bots cherchent', () => {
    expect(splitRoles(1)).toEqual({ seekers: 0, hiders: 1, bots: HIDE_SEEK.roles.minSeekers });
  });
  it('il reste toujours au moins un caché', () => {
    for (let n = 2; n <= 16; n++) {
      const s = splitRoles(n);
      expect(s.hiders).toBeGreaterThanOrEqual(1);
      expect(s.seekers).toBeGreaterThanOrEqual(1);
      expect(s.seekers + s.bots).toBeGreaterThanOrEqual(HIDE_SEEK.roles.minSeekers);
    }
  });
});

describe('déroulement d’une partie', () => {
  /** Deux joueurs : un chercheur et un caché (plus un bot chercheur). */
  function twoPlayers() {
    const match = new HideSeekMatch(getArena(), seeded());
    match.join('a', 'Alice', LOOK, 0);
    match.join('b', 'Bob', LOOK, 0);
    run(match, 0, lobbyMs);
    const seeker = [...match.participants.values()].find((p) => !p.bot && p.role === 'seeker')!;
    const hider = [...match.participants.values()].find((p) => p.role === 'hider')!;
    // Bot hors jeu pour des tests déterministes.
    for (const p of match.participants.values()) if (p.bot) p.status = 'eliminated';
    return { match, seeker, hider, t0: lobbyMs };
  }

  it('commence après le salon : 1 min de cache puis 4 min de recherche', () => {
    const { match, t0 } = twoPlayers();
    expect(match.phase).toBe('hiding');
    expect(match.phaseEndsAt).toBe(t0 + hidingMs);
    run(match, t0, t0 + hidingMs);
    expect(match.phase).toBe('seeking');
    expect(match.phaseEndsAt).toBe(t0 + hidingMs + seekingMs);
  });

  it('les chercheurs ne bougent pas et ne voient rien pendant la première minute', () => {
    const { match, seeker, hider } = twoPlayers();
    expect(match.move(seeker.id, { x: seeker.x + 3, y: seeker.y })).toMatch(/Yeux fermés/);
    expect(seeker.path).toEqual([]);
    expect(match.privateBodiesFor(seeker.id)).toEqual([]);
    expect(match.isPublic(hider)).toBe(false);
  });

  it('un caché dans une cachette disparaît ; la fouille l’élimine et les cachés perdent', () => {
    const { match, seeker, hider, t0 } = twoPlayers();
    const spot = match.spots[0]!;
    expect(match.hide(hider.id, spot.id)).toMatch(/Approche-toi/);
    teleportNextTo(match, hider.id, spot.id);
    expect(match.hide(hider.id, spot.id)).toBeNull();
    expect(hider.spotId).toBe(spot.id);
    run(match, t0, t0 + hidingMs);
    teleportNextTo(match, seeker.id, spot.id);
    expect(match.privateBodiesFor(seeker.id)).toEqual([]);
    const { events } = match.search(seeker.id, spot.id, t0 + hidingMs + 100);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'eliminated', id: hider.id, how: 'search' }));
    expect(hider.status).toBe('eliminated');
    expect(match.phase).toBe('ended');
    expect(match.winner).toBe('seekers');
  });

  it('il faut attendre entre deux fouilles', () => {
    const { match, seeker, hider, t0 } = twoPlayers();
    hider.status = 'playing';
    run(match, t0, t0 + hidingMs);
    const now = t0 + hidingMs + 100;
    const [a, b] = match.spots;
    teleportNextTo(match, seeker.id, a!.id);
    expect(match.search(seeker.id, a!.id, now).error).toBeNull();
    teleportNextTo(match, seeker.id, b!.id);
    expect(match.search(seeker.id, b!.id, now + 1000).error).toMatch(/Attends/);
    expect(match.search(seeker.id, b!.id, now + HIDE_SEEK.searchCooldownMs).error).toBeNull();
  });

  it('un caché à découvert repéré est éliminé d’un clic, pas s’il est hors de vue', () => {
    const { match, seeker, hider, t0 } = twoPlayers();
    run(match, t0, t0 + hidingMs);
    const now = t0 + hidingMs + 100;
    expect(match.privateBodiesFor(seeker.id).map((p) => p.id)).toContain(hider.id);
    Object.assign(hider, { x: seeker.x + HIDE_SEEK.sightRange + 3, y: seeker.y });
    expect(match.tag(seeker.id, hider.id, now).error).toMatch(/Trop loin/);
    Object.assign(hider, { x: seeker.x + 1, y: seeker.y });
    expect(match.tag(seeker.id, hider.id, now).events).toContainEqual(expect.objectContaining({ kind: 'eliminated', how: 'spotted' }));
    expect(match.winner).toBe('seekers');
  });

  it('les cachés gagnent si l’un d’eux tient jusqu’au bout, avec un indice par minute', () => {
    const { match, hider, t0 } = twoPlayers();
    const spot = match.spots[5]!;
    teleportNextTo(match, hider.id, spot.id);
    match.hide(hider.id, spot.id);
    const events = run(match, t0, t0 + hidingMs + seekingMs);
    const hints = events.filter((e) => e.kind === 'hint');
    expect(hints).toHaveLength(seekingMs / HIDE_SEEK.hints.everyMs - 1);
    for (const h of hints) {
      if (h.kind !== 'hint') continue;
      expect(Math.hypot(h.x - spot.x, h.y - spot.y)).toBeLessThanOrEqual(HIDE_SEEK.hints.maxOffset + 1);
    }
    expect(match.winner).toBe('hiders');
    expect(match.phase).toBe('ended');
    // Résultats, puis retour au salon : tout le monde rejoue.
    run(match, t0 + hidingMs + seekingMs, t0 + hidingMs + seekingMs + resultsMs);
    expect(match.phase).toBe('lobby');
    expect([...match.participants.values()].every((p) => !p.bot && p.status === 'lobby')).toBe(true);
  });

  it('un joueur éliminé devient spectateur et voit tous les cachés', () => {
    const match = new HideSeekMatch(getArena(), seeded());
    for (const id of ['a', 'b', 'c', 'd']) match.join(id, id, LOOK, 0);
    run(match, 0, lobbyMs + hidingMs);
    const hiders = match.hidersAlive();
    const seeker = [...match.participants.values()].find((p) => !p.bot && p.role === 'seeker')!;
    const victim = hiders[0]!;
    Object.assign(victim, { x: seeker.x + 1, y: seeker.y });
    match.tag(seeker.id, victim.id, lobbyMs + hidingMs + 100);
    expect(victim.status).toBe('eliminated');
    expect(match.isPublic(victim)).toBe(false);
    expect(match.privateBodiesFor(victim.id).map((p) => p.id).sort()).toEqual(hiders.slice(1).map((p) => p.id).sort());
    expect(match.move(victim.id, { x: 1, y: 1 })).toBeNull();
    expect(victim.path).toEqual([]);
  });

  it('un joueur qui arrive en cours de partie attend la suivante', () => {
    const { match } = twoPlayers();
    const late = match.join('z', 'Zoé', LOOK, lobbyMs + 1000);
    expect(late.status).toBe('spectating');
    expect(match.isPublic(late)).toBe(false);
  });

  it('un chercheur qui part est remplacé par un bot', () => {
    const { match, seeker, t0 } = twoPlayers();
    const events = match.leave(seeker.id, t0 + 1000);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'left', replacedBy: expect.any(String) }));
    expect([...match.participants.values()].filter((p) => p.bot && p.status === 'playing')).toHaveLength(1);
  });

  it('les bots chercheurs repèrent un joueur seul resté à découvert', () => {
    const match = new HideSeekMatch(getArena(), seeded(7));
    match.join('solo', 'Solo', LOOK, 0);
    const events = run(match, 0, lobbyMs + hidingMs + 10_000);
    expect(events).toContainEqual(expect.objectContaining({ kind: 'eliminated', id: 'solo', how: 'spotted' }));
    expect(events).toContainEqual({ kind: 'ended', winner: 'seekers' });
  });

  it('les bots chercheurs fouillent les cachettes une à une', () => {
    const match = new HideSeekMatch(getArena(), seeded(3));
    match.join('solo', 'Solo', LOOK, 0);
    run(match, 0, lobbyMs);
    const spot = match.spots.at(-1)!;
    teleportNextTo(match, 'solo', spot.id);
    expect(match.hide('solo', spot.id)).toBeNull();
    const events = run(match, lobbyMs, lobbyMs + hidingMs + seekingMs);
    const searched = events.filter((e) => e.kind === 'searched');
    expect(searched.length).toBeGreaterThan(10);
    expect(new Set(searched.map((e) => e.kind === 'searched' && e.spotId)).size).toBeGreaterThan(10);
    expect(events.some((e) => e.kind === 'ended')).toBe(true);
  });
});
