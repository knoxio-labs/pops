/**
 * The transaction audit log: who created, changed, deleted or restored a
 * transaction, and what the row looked like either side (POPS-5865, epic
 * POPS-5827).
 *
 * Only the four `transactions.ts` writers record here, and only when their
 * caller names an actor, which the REST transaction routes always do. Import
 * commit, Up Bank sync, transfer pairing and unlinking, account merge, and the
 * tag-rule and correction bulk applies write transactions through their own
 * paths and deliberately produce no events: the log answers "which person did
 * this", and none of those is a person editing one entry.
 *
 * A snapshot is the complete drizzle row, the shape `restoreTransaction`
 * inserts, so the `before` of a delete event rebuilds the entry exactly. That
 * includes `rawRow`, `checksum` and the match columns; keeping them away from a
 * reader who should not see them is the caller's job, not this table's.
 *
 * Nothing here updates or deletes an event.
 */
import { and, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';

import { transactionEvents, transactions } from '../schema.js';

import type {
  TransactionEventAction,
  TransactionEventActorKind,
} from '../schema/transaction-events.js';
import type { FinanceDb, TransactionRow } from './internal.js';

/** Raw drizzle row shape for `transaction_events`; `before` and `after` are JSON text. */
export type TransactionEventRow = typeof transactionEvents.$inferSelect;

/** Who made a change. `email` is null for a caller that carried none. */
export interface TransactionActor {
  kind: TransactionEventActorKind;
  email: string | null;
}

/** One change to record. At least one of `before` and `after` is a row. */
export interface TransactionEventInput {
  action: TransactionEventAction;
  actor: TransactionActor;
  /** The row before the change; null for a create or a restore. */
  before: TransactionRow | null;
  /** The row after the change; null for a delete. */
  after: TransactionRow | null;
}

const transactionRowSchema = createSelectSchema(transactions);

/**
 * Append one event. Call it with the handle of the database transaction that
 * makes the row change, so the two commit or roll back together.
 *
 * The event is filed under the account the row sits on afterwards (its last
 * account, for a delete). A move keeps the account it left in `before`, which
 * is how {@link listAccountEvents} finds it from the old account too.
 */
export function recordTransactionEvent(tx: FinanceDb, event: TransactionEventInput): void {
  const filedUnder = event.after ?? event.before;
  if (filedUnder === null) {
    throw new Error('recordTransactionEvent: an event needs a before or an after row');
  }
  tx.insert(transactionEvents)
    .values({
      transactionId: filedUnder.id,
      accountId: filedUnder.accountId,
      action: event.action,
      actorKind: event.actor.kind,
      actorEmail: event.actor.email,
      before: event.before === null ? null : JSON.stringify(event.before),
      after: event.after === null ? null : JSON.stringify(event.after),
    })
    .run();
}

/**
 * Decode a stored snapshot back into the row it was taken from.
 *
 * @throws when the text is not a complete transaction row, which means the
 *   event was not written by {@link recordTransactionEvent}.
 */
export function parseTransactionSnapshot(snapshot: string): TransactionRow {
  return transactionRowSchema.parse(JSON.parse(snapshot));
}

/** `at` has millisecond resolution; insertion order separates events sharing one. */
const NEWEST_FIRST = [desc(transactionEvents.at), desc(sql`rowid`)];

const BEFORE_ACCOUNT_ID = sql<string>`json_extract(${transactionEvents.before}, '$.accountId')`;

/**
 * Holds an event to a set of accounts: the one it is filed under and, where it
 * has a `before` row, the one that row sat on must both be in the set. A move
 * between an account in the set and one outside it is therefore excluded
 * whole, because either side of it describes the entry on the other account.
 * An empty set matches nothing.
 */
function withinAccounts(accountIds: readonly string[]): SQL | undefined {
  const ids = [...accountIds];
  return and(
    inArray(transactionEvents.accountId, ids),
    or(isNull(transactionEvents.before), inArray(BEFORE_ACCOUNT_ID, ids))
  );
}

/**
 * Every event of one transaction, newest first. A deleted transaction keeps
 * its events, so this answers for an id that no longer has a row.
 *
 * @param within Only events that lie wholly on these accounts, for a reader
 *   who may see only some. Omitted, every event is returned.
 */
export function listTransactionEvents(
  db: FinanceDb,
  transactionId: string,
  within?: readonly string[]
): TransactionEventRow[] {
  return db
    .select()
    .from(transactionEvents)
    .where(
      and(
        eq(transactionEvents.transactionId, transactionId),
        within === undefined ? undefined : withinAccounts(within)
      )
    )
    .orderBy(...NEWEST_FIRST)
    .all();
}

/** One page of an account's events, and how many there are in all. */
export interface AccountEventsPage {
  rows: TransactionEventRow[];
  total: number;
}

/**
 * An account's events, newest first: everything filed under it, plus every
 * event whose `before` row sat on it, which is a transaction moved away.
 * Events of deleted transactions are included.
 *
 * `page.within` holds the result to events lying wholly on those accounts, for
 * a reader who may see only some; it narrows `total` as well as the rows.
 */
export function listAccountEvents(
  db: FinanceDb,
  accountId: string,
  page: { limit: number; offset: number; within?: readonly string[] | undefined }
): AccountEventsPage {
  const { limit, offset, within } = page;
  const onAccount = and(
    or(eq(transactionEvents.accountId, accountId), sql`${BEFORE_ACCOUNT_ID} = ${accountId}`),
    within === undefined ? undefined : withinAccounts(within)
  );
  const rows = db
    .select()
    .from(transactionEvents)
    .where(onAccount)
    .orderBy(...NEWEST_FIRST)
    .limit(limit)
    .offset(offset)
    .all();
  const counted = db
    .select({ total: sql<number>`count(*)` })
    .from(transactionEvents)
    .where(onAccount)
    .get();
  return { rows, total: counted?.total ?? 0 };
}
