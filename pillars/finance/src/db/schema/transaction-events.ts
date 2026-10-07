import { sql } from 'drizzle-orm';
import { check, index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** What happened to the transaction. */
export const TRANSACTION_EVENT_ACTIONS = [
  'create',
  'update',
  'delete',
  'restore',
  'attach',
  'detach',
] as const;
export type TransactionEventAction = (typeof TRANSACTION_EVENT_ACTIONS)[number];

/** Who did it, as the request classified them. */
export const TRANSACTION_EVENT_ACTOR_KINDS = ['operator', 'guest', 'service', 'system'] as const;
export type TransactionEventActorKind = (typeof TRANSACTION_EVENT_ACTOR_KINDS)[number];

/**
 * Append-only audit log of changes to a transaction (POPS-5827).
 *
 * Neither `transaction_id` nor `account_id` is a foreign key. An event has to
 * outlive what it describes: delete is a hard delete and the entry is rebuilt
 * from the `before` snapshot of its delete event, and an account removed by a
 * merge still has a history.
 */
export const transactionEvents = sqliteTable(
  'transaction_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    transactionId: text('transaction_id').notNull(),
    /** The account the transaction sat on once the action had been applied. */
    accountId: text('account_id').notNull(),
    action: text('action', { enum: TRANSACTION_EVENT_ACTIONS }).notNull(),
    actorKind: text('actor_kind', { enum: TRANSACTION_EVENT_ACTOR_KINDS }).notNull(),
    /** Null for an actor with no email: a service, the system, an operator with no token. */
    actorEmail: text('actor_email'),
    at: text('at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
    /** JSON snapshot of the row before the action. Null when there was none. */
    before: text('before'),
    /** JSON snapshot of the row after the action. Null when none remains. */
    after: text('after'),
  },
  (table) => [
    index('idx_transaction_events_transaction_at').on(table.transactionId, table.at),
    index('idx_transaction_events_account_at').on(table.accountId, table.at),
    check(
      'transaction_events_action_check',
      sql`${table.action} IN ('create', 'update', 'delete', 'restore', 'attach', 'detach')`
    ),
    check(
      'transaction_events_actor_kind_check',
      sql`${table.actorKind} IN ('operator', 'guest', 'service', 'system')`
    ),
  ]
);
