/**
 * Schéma de la base. Le jeu de cartes ne garde que les comptes (pseudo + jeton
 * de session) : les parties vivent en mémoire dans les rooms Colyseus.
 */
import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pseudo: text('pseudo').notNull(),
    /** Hash SHA-256 du jeton de session (le jeton lui-même n'est jamais stocké). */
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('players_pseudo_lower_idx').on(sql`lower(${t.pseudo})`)],
);
