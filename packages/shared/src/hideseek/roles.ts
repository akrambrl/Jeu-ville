import { HIDE_SEEK } from '../config/hideSeek.js';

export interface RoleSplit {
  /** Joueurs réels qui cherchent. */
  seekers: number;
  /** Joueurs réels qui se cachent. */
  hiders: number;
  /** Bots chercheurs ajoutés pour compléter. */
  bots: number;
}

/**
 * Répartition des rôles pour `players` joueurs réels : il reste toujours au moins
 * un caché, et les bots complètent les chercheurs quand il y a peu de monde.
 */
export function splitRoles(players: number, cfg = HIDE_SEEK.roles): RoleSplit {
  if (players <= 0) return { seekers: 0, hiders: 0, bots: 0 };
  const seekers = players < 2 ? 0 : Math.min(players - 1, Math.max(1, Math.round(players * cfg.seekerShare)));
  const bots = Math.min(cfg.maxBots, Math.max(0, cfg.minSeekers - seekers));
  return { seekers, hiders: players - seekers, bots };
}
