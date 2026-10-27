/**
 * Sessions du prototype : un pseudo, sans mot de passe, et un jeton aléatoire
 * conservé par le navigateur. Les vrais comptes arrivent en phase 3.
 */
import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { SessionResponse } from '@jeu-ville/shared';
import type { Db } from '../db/client.js';
import { players } from '../db/schema.js';
import { GameError } from './errors.js';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(db: Db, pseudo: string): Promise<SessionResponse> {
  const token = randomBytes(32).toString('base64url');
  const [row] = await db
    .insert(players)
    .values({ pseudo, tokenHash: hashToken(token) })
    .onConflictDoNothing()
    .returning({ id: players.id, pseudo: players.pseudo });
  if (!row) throw new GameError('Ce pseudo est déjà pris.', 409);
  return { token, playerId: row.id, pseudo: row.pseudo };
}

export interface AuthenticatedPlayer {
  id: string;
  pseudo: string;
}

export async function playerFromToken(db: Db, token: string): Promise<AuthenticatedPlayer | null> {
  const [row] = await db
    .update(players)
    .set({ lastSeenAt: sql`now()` })
    .where(eq(players.tokenHash, hashToken(token)))
    .returning({ id: players.id, pseudo: players.pseudo });
  return row ?? null;
}
