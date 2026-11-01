/** Cerveau des chercheurs bots : quelle cachette aller fouiller ensuite. */
import { HIDE_SEEK } from '../config/hideSeek.js';
import type { TilePoint } from '../map/types.js';
import type { HidingSpot } from './spots.js';

export interface BotContext {
  now: number;
  /** Dernier indice sonore encore intéressant, ou null. */
  hint: TilePoint | null;
  /** Dernière fouille de chaque cachette (ms). */
  searchedAt: ReadonlyMap<string, number>;
  /** Cachettes déjà visées par un autre bot. */
  claimed: ReadonlySet<string>;
}

/** Pénalités (en « cases équivalentes ») ajoutées à la distance. */
const RECENTLY_SEARCHED = 1_000;
const CLAIMED = 25;
const OUTSIDE_HINT = 40;

/** Cachettes de la plus intéressante à la moins intéressante pour ce bot. */
export function rankSpotsForBot(spots: readonly HidingSpot[], bot: TilePoint, ctx: BotContext): HidingSpot[] {
  const score = (s: HidingSpot) => {
    let v = Math.hypot(s.x - bot.x, s.y - bot.y);
    const last = ctx.searchedAt.get(s.id);
    if (last !== undefined && ctx.now - last < HIDE_SEEK.bots.researchAfterMs) v += RECENTLY_SEARCHED;
    if (ctx.claimed.has(s.id)) v += CLAIMED;
    if (ctx.hint && Math.hypot(s.x - ctx.hint.x, s.y - ctx.hint.y) > HIDE_SEEK.bots.hintFocusRadius) v += OUTSIDE_HINT;
    return v;
  };
  return spots
    .map((s) => ({ s, v: score(s) }))
    .sort((a, b) => a.v - b.v)
    .map((e) => e.s);
}
