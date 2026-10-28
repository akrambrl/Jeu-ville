/**
 * Chat général : liste de blocage (persistée) et signalements pour la
 * modération (copie du message, un signalement par message et par joueur).
 */
import { and, count, eq } from 'drizzle-orm';
import { CHAT, type ChatLine } from '@jeu-ville/shared';
import type { Db } from '../db/client.js';
import { chatBlocks, chatReports } from '../db/schema.js';
import { GameError } from './errors.js';

export async function listBlocked(db: Db, characterId: string): Promise<string[]> {
  const rows = await db.select({ id: chatBlocks.blockedId }).from(chatBlocks).where(eq(chatBlocks.blockerId, characterId));
  return rows.map((r) => r.id);
}

export async function setBlocked(db: Db, characterId: string, targetId: string, blocked: boolean): Promise<string[]> {
  if (targetId === characterId) throw new GameError('Tu ne peux pas te bloquer toi-même.');
  if (blocked) {
    const [{ n }] = (await db.select({ n: count() }).from(chatBlocks).where(eq(chatBlocks.blockerId, characterId))) as [{ n: number }];
    if (n >= CHAT.maxBlocked) throw new GameError('Tu bloques déjà trop de joueurs.');
    await db.insert(chatBlocks).values({ blockerId: characterId, blockedId: targetId }).onConflictDoNothing();
  } else {
    await db.delete(chatBlocks).where(and(eq(chatBlocks.blockerId, characterId), eq(chatBlocks.blockedId, targetId)));
  }
  return listBlocked(db, characterId);
}

/** Signale un message ; renvoie false s'il était déjà signalé par ce joueur. */
export async function reportLine(db: Db, reporterId: string, line: ChatLine): Promise<boolean> {
  if (line.characterId === reporterId) throw new GameError('Tu ne peux pas signaler ton propre message.');
  const inserted = await db
    .insert(chatReports)
    .values({
      reporterId,
      reportedId: line.characterId,
      messageId: line.id,
      messageText: line.text,
      messageAt: new Date(line.at),
    })
    .onConflictDoNothing()
    .returning({ id: chatReports.id });
  return inserted.length > 0;
}
