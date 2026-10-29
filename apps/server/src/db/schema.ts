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
    /** Bonté (missions du quotidien) : bonus de bonheur qui s'estompe depuis `kindnessUpdatedAt`. */
    kindness: real('kindness').notNull().default(0),
    kindnessUpdatedAt: timestamp('kindness_updated_at', { withTimezone: true }).notNull().defaultNow(),
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
    /** Réputation du commerce (0 à 100) : monte quand on y cuisine bien, augmente les recettes. */
    businessReputation: integer('business_reputation').notNull().default(0),
  },
  (t) => [
    index('properties_owner_idx').on(t.ownerCharacterId),
    index('properties_tenant_idx').on(t.tenantCharacterId),
    // Un bien n'a jamais à la fois un propriétaire joueur et un locataire joueur (pour l'instant).
    check('properties_owner_xor_tenant', sql`${t.ownerCharacterId} is null or ${t.tenantCharacterId} is null`),
  ],
);

/** Emploi actuel (un à la fois), chez un employeur bot de la carte. */
export const jobs = pgTable('jobs', {
  characterId: uuid('character_id')
    .primaryKey()
    .references(() => characters.id),
  /** Employeur (Employer.id, ex. « fastfood-117-99 »). */
  employerId: text('employer_id').notNull(),
  jobType: text('job_type').notNull(),
  hiredAt: timestamp('hired_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Expérience par métier (garde la progression même après une démission). */
export const jobExperience = pgTable(
  'job_xp',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id),
    jobType: text('job_type').notNull(),
    xp: integer('xp').notNull().default(0),
  },
  (t) => [uniqueIndex('job_xp_character_type_idx').on(t.characterId, t.jobType)],
);

/** Chat : joueurs qu'un personnage ne veut plus lire. */
export const chatBlocks = pgTable(
  'chat_blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => characters.id),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => characters.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('chat_blocks_pair_idx').on(t.blockerId, t.blockedId)],
);

/** Chat : signalements pour la modération (copie du message signalé). */
export const chatReports = pgTable(
  'chat_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterId: uuid('reporter_id')
      .notNull()
      .references(() => characters.id),
    reportedId: uuid('reported_id')
      .notNull()
      .references(() => characters.id),
    /** Identifiant du message dans le chat (un signalement par message et par joueur). */
    messageId: text('message_id').notNull(),
    messageText: text('message_text').notNull(),
    messageAt: timestamp('message_at', { withTimezone: true }).notNull(),
    /** « open » tant qu'un modérateur ne l'a pas traité. */
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('chat_reports_reporter_message_idx').on(t.reporterId, t.messageId), index('chat_reports_status_idx').on(t.status)],
);

/** Missions du quotidien réussies : une fois par demande et par joueur (récompense idempotente). */
export const errandsDone = pgTable(
  'errands_done',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id),
    /** ErrandOffer.id (« 2026-10-28:3 »), propre au quartier. */
    offerId: text('offer_id').notNull(),
    districtId: text('district_id').notNull(),
    /** Jour réel (Paris) : pour la limite quotidienne. */
    day: text('day').notNull(),
    type: text('type').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('errands_done_offer_idx').on(t.characterId, t.districtId, t.offerId),
    index('errands_done_day_idx').on(t.characterId, t.day),
  ],
);

/**
 * Amitiés : une ligne par paire de joueurs (`lowId` < `highId`), en attente
 * (demande de `requestedBy`) ou acceptée. L'index unique empêche les doublons.
 */
export const friendships = pgTable(
  'friendships',
  {
    lowId: uuid('low_id')
      .notNull()
      .references(() => characters.id),
    highId: uuid('high_id')
      .notNull()
      .references(() => characters.id),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => characters.id),
    /** 'pending' ou 'accepted'. */
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('friendships_pair_idx').on(t.lowId, t.highId),
    index('friendships_high_idx').on(t.highId),
    check('friendships_ordered', sql`${t.lowId} < ${t.highId}`),
  ],
);
