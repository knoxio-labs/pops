/**
 * Read-only projections over the `transactions` table that back the
 * autocomplete / rule-preview endpoints. Split from `transactions.ts` to
 * keep that file under the per-file line cap; re-exported through it so
 * they stay on the `transactionsService` namespace.
 */
import { asc, count, max } from 'drizzle-orm';

import { transactions } from '../schema.js';

import type { FinanceDb } from './internal.js';

/** One transaction projected for a full-history ChangeSet-preview scan (POPS-15). */
export interface ChangeSetPreviewScanRow {
  id: string;
  description: string;
  entityId: string | null;
  accountId: string;
  checksum: string | null;
}

/** Result of {@link getLastImportInfo}. */
export interface LastImportInfo {
  /** ISO timestamp of the most recently created/edited transaction, or `null` with an empty table. */
  lastEditedTime: string | null;
  /**
   * Whole days between `lastEditedTime` and `now`. `null` when there is no data
   * (empty table) or when `lastEditedTime` is present but unparseable, so callers
   * can distinguish "no imports yet" from "elapsed time unknown".
   */
  daysSinceLastImport: number | null;
}

/** A `{ description, checksum }` projection for in-memory rule-preview on the client. */
export interface DescriptionPreviewRow {
  description: string;
  checksum: string | null;
}

/** Result of {@link listDescriptionsForPreview}. */
export interface DescriptionPreviewResult {
  data: DescriptionPreviewRow[];
  total: number;
  truncated: boolean;
}

/**
 * Fetch up to `limit` `{ description, checksum }` rows for client-side rule
 * preview. Reads one extra row to detect truncation; `total` reflects the
 * real row count so the client can surface a "preview truncated" hint.
 */
export function listDescriptionsForPreview(db: FinanceDb, limit: number): DescriptionPreviewResult {
  const rows = db
    .select({ description: transactions.description, checksum: transactions.checksum })
    .from(transactions)
    .limit(limit + 1)
    .all();
  const truncated = rows.length > limit;
  const data = truncated ? rows.slice(0, limit) : rows;
  const totalRow = db.select({ total: count() }).from(transactions).all()[0];
  return { data, total: totalRow?.total ?? 0, truncated };
}

/**
 * Ops signal for import staleness: the most recent `lastEditedTime` across
 * every transaction (set to the wall-clock time on both create and edit, so
 * it tracks when data was last touched rather than the transaction's own
 * business date) and how many whole days have elapsed since then.
 *
 * Backs the `/health` staleness warning — no ingestion path (CSV import or
 * the Up Bank webhook) currently updates a row without also bumping this
 * column, so a growing gap here is a reliable "imports have stopped" signal.
 */
export function getLastImportInfo(db: FinanceDb, now: Date = new Date()): LastImportInfo {
  const row = db
    .select({ lastEditedTime: max(transactions.lastEditedTime) })
    .from(transactions)
    .all()[0];
  const lastEditedTime = row?.lastEditedTime ?? null;
  if (!lastEditedTime) return { lastEditedTime: null, daysSinceLastImport: null };

  const lastEditedMs = new Date(lastEditedTime).getTime();
  if (Number.isNaN(lastEditedMs)) return { lastEditedTime, daysSinceLastImport: null };

  const elapsedMs = now.getTime() - lastEditedMs;
  const daysSinceLastImport = Math.max(0, Math.floor(elapsedMs / (24 * 60 * 60 * 1000)));
  return { lastEditedTime, daysSinceLastImport };
}

/**
 * Every transaction in the finance DB, projected for a full-history
 * ChangeSet-preview diff (POPS-15) — the shared scan behind both
 * `previewTagRuleChangeSet`'s and `previewChangeSetImpact`'s full-history
 * mode, so the two previews cannot drift on what "every transaction" means.
 *
 * Ordered by `id` for a stable, deterministic scan order; the diff itself is
 * computed over the whole result in memory (mirroring
 * `previewRuleMatchTransactions`'s full-DB scan) rather than paged at the SQL
 * level, because the interesting page is of CHANGED rows, a predicate SQL
 * cannot evaluate.
 */
export function listAllTransactionsForChangeSetPreview(db: FinanceDb): ChangeSetPreviewScanRow[] {
  return db
    .select({
      id: transactions.id,
      description: transactions.description,
      entityId: transactions.entityId,
      accountId: transactions.accountId,
      checksum: transactions.checksum,
    })
    .from(transactions)
    .orderBy(asc(transactions.id))
    .all();
}
