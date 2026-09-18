import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Stored mutation outcomes. `deferred` is deliberately absent: a deferred
 * mutation is never stored, so its retry is evaluated afresh.
 */
export const MUTATION_STATUSES = ['applied', 'conflict', 'rejected'] as const;
/** One of {@link MUTATION_STATUSES}. */
export type MutationStatus = (typeof MUTATION_STATUSES)[number];

/**
 * The idempotency record of every mutation the sync endpoint has decided
 * (Inventory ADR-002 D9). A retried `mutation_id` replays `outcome` instead of
 * applying twice; a replay naming a different `op` or `entity_id` than the
 * stored one is rejected, which is why `entity_id` is stored as well.
 * `outcome` is the wire Outcome as a JSON object.
 */
export const mutations = sqliteTable(
  'mutations',
  {
    mutationId: text('mutation_id').primaryKey(),
    actorId: text('actor_id').notNull(),
    op: text('op').notNull(),
    entityId: text('entity_id').notNull(),
    status: text('status', { enum: MUTATION_STATUSES }).notNull(),
    outcome: text('outcome').notNull(),
    receivedAt: text('received_at').notNull(),
  },
  (table) => [
    index('mutations_actor').on(table.actorId, table.receivedAt),
    check('ck_mutations_status', sql`${table.status} IN ('applied','conflict','rejected')`),
    check(
      'ck_mutations_outcome',
      sql`json_valid(${table.outcome}) AND json_type(${table.outcome}) = 'object'`
    ),
  ]
);
