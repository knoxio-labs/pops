/**
 * Data access for `import_batches` (POPS-2916, ADR-052).
 *
 * Pure persistence: append a batch, list an account's batches, find its
 * newest. No cadence maths lives here — deriving "how often is this account
 * fed" from the gaps between batches is the status read's job (POPS-2917),
 * and keeping it out of this layer is what stops a stored cadence creeping
 * in beside the derived one.
 *
 * Rows are APPEND-ONLY. There is no update and no delete primitive: a batch
 * is what an import did, and undoing an import is a transaction-level
 * operation that would leave this row true as a record of the attempt.
 */
import { and, desc, eq, inArray, lt } from 'drizzle-orm';

import { importBatches, transactions } from '../schema.js';

import type { ImportSourceKind } from '../../contract/import-source.js';
import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape for `import_batches`. */
export type ImportBatchRow = typeof importBatches.$inferSelect;

/** Fields accepted by {@link insertBatch}. */
export interface InsertBatchInput {
  accountId: string;
  sourceKind: ImportSourceKind;
  /** The dialect id, parser id or provider the source named. */
  sourceRef?: string | null;
  parserVersion?: string | null;
  commitKey?: string | null;
  rowCount: number;
  /** Inclusive `YYYY-MM-DD`; both required when `rowCount > 0`, both null otherwise. */
  dateFrom?: string | null;
  dateTo?: string | null;
  checkpointId?: string | null;
}

/**
 * Append a batch and stamp `transactions.import_batch_id` on `transactionIds`.
 *
 * The stamp is an UPDATE after the insert rather than a column on each row's
 * INSERT because the batch id does not exist until every row has been written
 * and counted — the commit writes rows first, then records what it wrote.
 */
export function insertBatch(
  db: FinanceDb,
  input: InsertBatchInput,
  transactionIds: readonly string[]
): ImportBatchRow {
  const row = db
    .insert(importBatches)
    .values({
      accountId: input.accountId,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef ?? null,
      parserVersion: input.parserVersion ?? null,
      commitKey: input.commitKey ?? null,
      rowCount: input.rowCount,
      dateFrom: input.dateFrom ?? null,
      dateTo: input.dateTo ?? null,
      checkpointId: input.checkpointId ?? null,
    })
    .returning()
    .get();

  if (transactionIds.length > 0) {
    db.update(transactions)
      .set({ importBatchId: row.id })
      .where(inArray(transactions.id, [...transactionIds]))
      .run();
  }

  return row;
}

/** One page of an account's batches, newest first. */
export interface BatchPage {
  items: ImportBatchRow[];
  /** `createdAt` of the last item, to pass back as `before` for the next page; undefined when this is the last page. */
  nextBefore?: string;
}

/**
 * An account's batches, newest first, paginated on `createdAt`. `before` is
 * exclusive: pass the previous page's `nextBefore` to continue.
 */
export function listBatchesForAccount(
  db: FinanceDb,
  accountId: string,
  options: { limit: number; before?: string }
): BatchPage {
  const filters = [eq(importBatches.accountId, accountId)];
  if (options.before !== undefined) filters.push(lt(importBatches.createdAt, options.before));

  const rows = db
    .select()
    .from(importBatches)
    .where(and(...filters))
    .orderBy(desc(importBatches.createdAt), desc(importBatches.id))
    .limit(options.limit + 1)
    .all();

  if (rows.length <= options.limit) return { items: rows };
  const items = rows.slice(0, options.limit);
  return { items, nextBefore: items[items.length - 1]?.createdAt };
}

/** The account's newest batch, or undefined when it has never been fed through one. */
export function latestBatchForAccount(
  db: FinanceDb,
  accountId: string
): ImportBatchRow | undefined {
  return db
    .select()
    .from(importBatches)
    .where(eq(importBatches.accountId, accountId))
    .orderBy(desc(importBatches.createdAt), desc(importBatches.id))
    .limit(1)
    .get();
}

/** One batch by id, or undefined. */
export function getBatch(db: FinanceDb, id: string): ImportBatchRow | undefined {
  return db.select().from(importBatches).where(eq(importBatches.id, id)).get();
}
