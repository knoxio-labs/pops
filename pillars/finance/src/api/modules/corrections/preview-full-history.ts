/**
 * `previewChangeSetImpact`'s full-history mode (POPS-15): the same before/
 * after diff, computed over every transaction in the finance DB rather than
 * a caller-supplied capped batch (`corrections.previewChangeSet` caps at
 * `CALLER_SUPPLIED_TRANSACTIONS_MAX`).
 *
 * `summary` still covers every scanned transaction, exactly as
 * `previewChangeSetImpact` already promises — a ChangeSet whose matches lie
 * beyond what a caller-supplied list would have contained is fully counted
 * here, not just in the returned page. The returned `diffs`, though, is a
 * true `limit`/`offset` window over the CHANGED rows only: most transactions
 * in a real ledger are untouched by any one ChangeSet, and a page of
 * unchanged rows would tell a caller nothing — mirroring
 * `previewRuleMatchTransactions`'s full-DB scan, which pages MATCHES, not
 * every row it scanned.
 */
import { transactionsService, type FinanceDb } from '../../../db/index.js';
import { paginationMeta, type PaginationMeta } from '../../shared/pagination.js';
import { previewChangeSetImpact } from './preview-impact.js';

import type { ChangeSet } from '../../../contract/rest-corrections.js';
import type {
  ChangeSetPreviewDiff,
  ChangeSetPreviewSummary,
  PreviewTransaction,
} from './preview-impact.js';
import type { CorrectionRow } from './types.js';

export interface ChangeSetFullHistoryPreview {
  /** A `limit`/`offset` window over the changed rows, in scan order. */
  diffs: ChangeSetPreviewDiff[];
  /** Totals over every scanned transaction — never truncated to `diffs`'s page. */
  summary: ChangeSetPreviewSummary;
  /** `total` is the changed-row count `diffs` pages over, not the full scan size. */
  pagination: PaginationMeta;
}

export function previewChangeSetFullHistory(
  db: FinanceDb,
  args: { rules: CorrectionRow[]; changeSet: ChangeSet; limit: number; offset: number }
): ChangeSetFullHistoryPreview {
  const rows = transactionsService.listAllTransactionsForChangeSetPreview(db);
  const transactions: PreviewTransaction[] = rows.map((row) => ({
    ...(row.checksum !== null && { checksum: row.checksum }),
    description: row.description,
    accountId: row.accountId,
  }));

  const { diffs, summary } = previewChangeSetImpact({
    rules: args.rules,
    changeSet: args.changeSet,
    transactions,
  });

  const changed = diffs.filter((diff) => diff.changed);
  return {
    diffs: changed.slice(args.offset, args.offset + args.limit),
    summary,
    pagination: paginationMeta(changed.length, args.limit, args.offset),
  };
}
