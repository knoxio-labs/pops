/**
 * Record what a commit wrote, per account, as `import_batches` rows
 * (POPS-2916, ADR-052).
 *
 * Runs inside the commit's SQLite transaction after every row and checkpoint
 * has landed, so a batch counts rows that are actually there and can name the
 * checkpoint its source minted. A commit spans accounts once a row is
 * retargeted in review, so one batch is written per account that received a
 * row; an account whose every row failed to write gets none, because a batch
 * of nothing that was not a deliberate empty sync would read as "checked,
 * nothing new".
 *
 * `payload.source` is recorded verbatim when the client sent it. When it did
 * not — a client predating the field — the kind is read off the rows: only
 * the PDF statement parser stamps `balanceCents`, so a batch carrying one is a
 * statement and anything else is a CSV. That inference stays here, at the one
 * seam that has to cope with an old client, and nowhere else.
 */
import { importBatchesService, type FinanceDb } from '../../../db/index.js';

import type { ImportSource } from '../../../contract/import-source.js';
import type { CommitBatch, CommitCheckpoint, ConfirmedTransaction } from './types.js';

/** What the write phase knows about a row it inserted, enough to batch it. */
export interface InsertedTransaction {
  id: string;
  accountId: string;
  date: string;
}

interface AccountRows {
  ids: string[];
  dateFrom: string;
  dateTo: string;
}

function groupByAccount(rows: readonly InsertedTransaction[]): Map<string, AccountRows> {
  const byAccount = new Map<string, AccountRows>();
  for (const row of rows) {
    const existing = byAccount.get(row.accountId);
    if (existing === undefined) {
      byAccount.set(row.accountId, { ids: [row.id], dateFrom: row.date, dateTo: row.date });
      continue;
    }
    existing.ids.push(row.id);
    if (row.date < existing.dateFrom) existing.dateFrom = row.date;
    if (row.date > existing.dateTo) existing.dateTo = row.date;
  }
  return byAccount;
}

function inferredSource(transactions: readonly ConfirmedTransaction[]): ImportSource {
  const carriesBalance = transactions.some((t) => t.balanceCents !== undefined);
  return carriesBalance ? { kind: 'pdf-statement' } : { kind: 'csv-dialect' };
}

function sourceRefOf(source: ImportSource): string | null {
  switch (source.kind) {
    case 'csv-dialect':
      return source.dialectId ?? null;
    case 'pdf-statement':
      return source.parserId ?? null;
    case 'api':
      return source.provider ?? null;
  }
}

/**
 * Write one batch per account that received a row, stamping
 * `transactions.import_batch_id` on each, and link each to the checkpoint
 * minted for that account in this commit if there was one.
 */
export function recordImportBatchesPhase(
  tx: FinanceDb,
  args: {
    inserted: readonly InsertedTransaction[];
    transactions: readonly ConfirmedTransaction[];
    source: ImportSource | undefined;
    checkpoints: readonly CommitCheckpoint[];
    commitKey: string | undefined;
  }
): CommitBatch[] {
  const source = args.source ?? inferredSource(args.transactions);
  const checkpointByAccount = new Map(args.checkpoints.map((c) => [c.accountId, c.id]));
  const batches: CommitBatch[] = [];

  for (const [accountId, rows] of groupByAccount(args.inserted)) {
    const checkpointId = checkpointByAccount.get(accountId) ?? null;
    const row = importBatchesService.insertBatch(
      tx,
      {
        accountId,
        sourceKind: source.kind,
        sourceRef: sourceRefOf(source),
        parserVersion: source.parserVersion ?? null,
        commitKey: args.commitKey ?? null,
        rowCount: rows.ids.length,
        dateFrom: rows.dateFrom,
        dateTo: rows.dateTo,
        checkpointId,
      },
      rows.ids
    );
    batches.push({
      id: row.id,
      accountId,
      sourceKind: row.sourceKind,
      rowCount: row.rowCount,
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
      checkpointId: row.checkpointId,
    });
  }

  return batches;
}
