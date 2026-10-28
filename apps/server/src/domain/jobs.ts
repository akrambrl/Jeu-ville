/**
 * Agence pour l'emploi : embauche chez un employeur bot de la carte, démission,
 * paie des missions (journal, clé d'idempotence par mission) et expérience.
 * Le déroulé des services (où livrer, quoi servir) est suivi par la room.
 */
import { eq, sql } from 'drizzle-orm';
import { JOBS, canBeHired, decayGauges, employers, getDistrictMap, type CharacterSelf, type JobType } from '@jeu-ville/shared';
import type { Db, Tx } from '../db/client.js';
import { characters, jobExperience, jobs } from '../db/schema.js';
import { selfOf } from './characters.js';
import { GameError } from './errors.js';
import { recordLedgerEntry } from './ledger.js';

async function lockCharacter(tx: Tx, characterId: string) {
  const [row] = await tx.select().from(characters).where(eq(characters.id, characterId)).for('update');
  if (!row) throw new GameError('Personnage introuvable.', 404);
  return row;
}

async function reload(tx: Tx, characterId: string): Promise<CharacterSelf> {
  const [row] = await tx.select().from(characters).where(eq(characters.id, characterId));
  return selfOf(tx, row!, Date.now());
}

export async function applyJob(db: Db, characterId: string, districtKey: string, employerId: string, nowMs = Date.now()): Promise<CharacterSelf> {
  const map = getDistrictMap(districtKey);
  const employer = map ? employers(map).find((e) => e.id === employerId) : undefined;
  if (!employer) throw new GameError('Cette offre n’existe plus.');
  return db.transaction(async (tx) => {
    const row = await lockCharacter(tx, characterId);
    const [current] = await tx.select().from(jobs).where(eq(jobs.characterId, characterId));
    if (current) throw new GameError('Tu as déjà un emploi : démissionne d’abord.');
    const gauges = decayGauges(
      { hunger: row.hunger, hygiene: row.hygiene, appearance: row.appearance, health: row.health },
      nowMs - row.gaugesUpdatedAt.getTime(),
    );
    if (!canBeHired(gauges.appearance)) {
      throw new GameError(`Refusé : présente-toi mieux (apparence ${JOBS.minAppearanceToHire} au moins). Change-toi chez toi !`);
    }
    await tx.insert(jobs).values({ characterId, employerId, jobType: employer.jobType });
    return reload(tx, characterId);
  });
}

export async function quitJob(db: Db, characterId: string): Promise<CharacterSelf> {
  return db.transaction(async (tx) => {
    await lockCharacter(tx, characterId);
    await tx.delete(jobs).where(eq(jobs.characterId, characterId));
    return reload(tx, characterId);
  });
}

/** Mission réussie : salaire au journal (une seule fois par mission) et expérience. */
export async function payMission(
  db: Db,
  characterId: string,
  jobType: JobType,
  amountCents: number,
  missionKey: string,
): Promise<CharacterSelf> {
  return db.transaction(async (tx) => {
    await lockCharacter(tx, characterId);
    await recordLedgerEntry(tx, { characterId, amountCents, reason: `salary:${jobType}`, idempotencyKey: `salary:${missionKey}` });
    await tx
      .insert(jobExperience)
      .values({ characterId, jobType, xp: JOBS[jobType].xpPerMission })
      .onConflictDoUpdate({
        target: [jobExperience.characterId, jobExperience.jobType],
        set: { xp: sql`${jobExperience.xp} + ${JOBS[jobType].xpPerMission}` },
      });
    return reload(tx, characterId);
  });
}
