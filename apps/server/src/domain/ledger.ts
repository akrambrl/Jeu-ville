import { eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client.js';
import { characters, ledgerEntries } from '../db/schema.js';
import { GameError } from './errors.js';

export interface LedgerInput {
  characterId: string;
  /** Positif = crédit, négatif = débit (centimes). */
  amountCents: number;
  /** Motif lisible par les outils d'admin (ex. `home_action:eat`). */
  reason: string;
  idempotencyKey?: string;
}

/**
 * SEUL point d'entrée pour modifier un solde : met à jour l'argent du perso
 * et écrit la ligne de journal dans la même transaction. Renvoie le nouveau solde.
 */
export async function recordLedgerEntry(tx: Tx, input: LedgerInput): Promise<number> {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents === 0) {
    throw new GameError('Montant invalide.', 500);
  }
  const [updated] = await tx
    .update(characters)
    .set({ moneyCents: sql`${characters.moneyCents} + ${input.amountCents}` })
    .where(
      input.amountCents < 0
        ? sql`${characters.id} = ${input.characterId} and ${characters.moneyCents} >= ${-input.amountCents}`
        : eq(characters.id, input.characterId),
    )
    .returning({ moneyCents: characters.moneyCents });
  if (!updated) throw new GameError("Pas assez d'argent.");

  await tx.insert(ledgerEntries).values({
    characterId: input.characterId,
    amountCents: input.amountCents,
    balanceAfterCents: updated.moneyCents,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey ?? null,
  });
  return updated.moneyCents;
}
