import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  integer,
  check,
  index,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const cities = pgTable('cities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  unlocked: boolean('unlocked').notNull().default(false),
});

export const districts = pgTable('districts', {
  id: text('id').primaryKey(),
  cityId: text('city_id')
    .notNull()
    .references(() => cities.id),
  name: text('name').notNull(),
});

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

export const dwellings = pgTable(
  'dwellings',
  {
    /** `<quartier>:<bâtiment>:<n°>` */
    id: text('id').primaryKey(),
    districtId: text('district_id')
      .notNull()
      .references(() => districts.id),
    buildingId: text('building_id').notNull(),
    buildingName: text('building_name').notNull(),
    kind: text('kind').notNull(),
    weeklyRentCents: bigint('weekly_rent_cents', { mode: 'number' }).notNull(),
    /** Locataire actuel. Unique : un perso n'a qu'un logement, un logement qu'un locataire. */
    tenantCharacterId: uuid('tenant_character_id').unique(),
  },
  (t) => [index('dwellings_district_kind_idx').on(t.districtId, t.kind)],
);

export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .unique()
      .references(() => players.id),
    name: text('name').notNull(),
    sex: text('sex').notNull(),
    baseLook: smallint('base_look').notNull(),
    skinTone: smallint('skin_tone').notNull(),
    hairColor: smallint('hair_color').notNull(),
    bodyType: smallint('body_type').notNull(),
    cityId: text('city_id')
      .notNull()
      .references(() => cities.id),
    districtId: text('district_id')
      .notNull()
      .references(() => districts.id),
    dwellingId: text('dwelling_id').references(() => dwellings.id),
    moneyCents: bigint('money_cents', { mode: 'number' }).notNull(),
    hunger: real('hunger').notNull(),
    hygiene: real('hygiene').notNull(),
    appearance: real('appearance').notNull(),
    health: real('health').notNull(),
    gaugesUpdatedAt: timestamp('gauges_updated_at', { withTimezone: true }).notNull(),
    posX: real('pos_x').notNull(),
    posY: real('pos_y').notNull(),
    /** Véhicule utilisé ('' = à pied, sinon VehicleKind). */
    activeVehicle: text('active_vehicle').notNull().default(''),
    /** Dernière fois qu'un refuge a recueilli son animal (chagrin temporaire). */
    petLostAt: timestamp('pet_lost_at', { withTimezone: true }),
    /** Logement acheté ou loué via l'agence (sinon : appart de départ, `dwellingId`). */
    homePropertyId: text('home_property_id'),
    /** Dernier déménagement (une fois toutes les deux semaines au plus). */
    movedAt: timestamp('moved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('characters_money_non_negative', sql`${t.moneyCents} >= 0`)],
);

/** Journal de tous les mouvements d'argent : les soldes doivent pouvoir en être recalculés. */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    balanceAfterCents: bigint('balance_after_cents', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    idempotencyKey: text('idempotency_key').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ledger_character_idx').on(t.characterId, t.createdAt)],
);

/** Véhicules possédés (vélo, trottinette) : un de chaque type au plus. */
export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id),
    kind: text('kind').notNull(),
    battery: real('battery').notNull().default(100),
    boughtAt: timestamp('bought_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('vehicles_character_kind_idx').on(t.characterId, t.kind)],
);

/** Animal de compagnie (un par personnage) : jauges paresseuses, comme celles du perso. */
export const pets = pgTable('pets', {
  id: uuid('id').primaryKey().defaultRandom(),
  characterId: uuid('character_id')
    .notNull()
    .unique()
    .references(() => characters.id),
  species: text('species').notNull(),
  coat: smallint('coat').notNull(),
  name: text('name').notNull(),
  hunger: real('hunger').notNull(),
  happiness: real('happiness').notNull(),
  gaugesUpdatedAt: timestamp('gauges_updated_at', { withTimezone: true }).notNull(),
  adoptedAt: timestamp('adopted_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Biens de l'agence immobilière (repérés sur la carte). Propriétaire OU locataire
 * joueur ; sinon le bien appartient à un bot et il est disponible.
 */
export const properties = pgTable(
  'properties',
  {
    /** `<quartier>:<id du bien>` */
    id: text('id').primaryKey(),
    districtId: text('district_id')
      .notNull()
      .references(() => districts.id),
    spotId: text('spot_id').notNull(),
    kind: text('kind').notNull(),
    ownerCharacterId: uuid('owner_character_id').references(() => characters.id),
    tenantCharacterId: uuid('tenant_character_id').references(() => characters.id),
    leaseStartedAt: timestamp('lease_started_at', { withTimezone: true }),
    /** Périodes de loyer déjà payées (tick idempotent). */
    rentPeriodsPaid: integer('rent_periods_paid').notNull().default(0),
    businessType: text('business_type'),
    businessName: text('business_name'),
    businessOpenedAt: timestamp('business_opened_at', { withTimezone: true }),
    /** Périodes de recettes déjà versées (tick idempotent). */
    payoutPeriodsPaid: integer('payout_periods_paid').notNull().default(0),
  },
  (t) => [
    index('properties_owner_idx').on(t.ownerCharacterId),
    index('properties_tenant_idx').on(t.tenantCharacterId),
    // Un bien n'a jamais à la fois un propriétaire joueur et un locataire joueur (pour l'instant).
    check('properties_owner_xor_tenant', sql`${t.ownerCharacterId} is null or ${t.tenantCharacterId} is null`),
  ],
);
