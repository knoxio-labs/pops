/**
 * One-off catch-up run for the paired-transfer engine (POPS-2753). Enabling
 * `FINANCE_TRANSFER_PAIR_ENABLED` only pairs transactions going forward
 * (commit-time) or on the next nightly reconcile tick — this sweeps every
 * currently-unpaired row once immediately, the "immediate catch-up" the
 * reconcile worker's own doc comment anticipated but never wired up
 * (`src/api/cron/reconcile-paired-transfers.ts`).
 *
 * DRY RUN by default — reports what each row would resolve to (match,
 * ambiguous, or no-match) without writing, via the same `predictPairOutcome`
 * (mutuality check included) that `attemptPairForRow` uses to actually link —
 * so a dry run's prediction and a subsequent `--apply` run agree exactly.
 * Pass `--apply` to write for real.
 *
 *   # dry run (default): show what would link
 *   FINANCE_SQLITE_PATH=... pnpm --filter @pops/finance exec tsx scripts/backfill-transfer-pairs.ts
 *
 *   # apply (after a snapshot):
 *   ... tsx scripts/backfill-transfer-pairs.ts --apply
 *
 * Idempotent — a second run after a successful apply finds nothing left to
 * link (every row is either linked or genuinely has no counterpart).
 */
import { resolveFinanceSqlitePath } from '../src/api/finance-sqlite-path.js';
import {
  attemptPairForRow,
  predictPairOutcome,
  type PairPrediction,
} from '../src/api/modules/transfers/pair-runner.js';
import { getTransferPairWindowDays } from '../src/api/modules/transfers/pair-transfers.js';
import {
  openFinanceDb,
  transactionsService,
  transferPairsService,
  type FinanceDb,
} from '../src/db/index.js';

function logIfMatch(id: string, prediction: PairPrediction, seenMatches: Set<string>): boolean {
  if (prediction.kind !== 'match') return false;
  const key = [id, prediction.counterpart.id].toSorted().join('|');
  if (seenMatches.has(key)) return false;
  seenMatches.add(key);
  console.warn(`  MATCH ${id} <-> ${prediction.counterpart.id}`);
  return true;
}

function runDryRun(db: FinanceDb, ids: readonly string[], days: number): void {
  let matches = 0;
  let ambiguous = 0;
  const seenMatches = new Set<string>();
  for (const id of ids) {
    const row = transactionsService.getTransaction(db, id);
    const prediction = predictPairOutcome(db, row, days);
    if (logIfMatch(id, prediction, seenMatches)) {
      matches += 1;
      continue;
    }
    if (prediction.kind === 'ambiguous') {
      ambiguous += 1;
      console.warn(
        `  AMBIGUOUS ${id} (multiple equally-close candidates, left for manual resolution)`
      );
    }
  }
  console.warn(
    `[backfill-transfer-pairs] DRY RUN — predicted pairs=${matches} ambiguous=${ambiguous} ` +
      're-run with --apply to write (take a snapshot first)'
  );
}

function runApply(db: FinanceDb, ids: readonly string[], days: number): void {
  let linked = 0;
  let ambiguous = 0;
  let noMatch = 0;
  let skipped = 0;
  for (const id of ids) {
    const row = transactionsService.getTransaction(db, id);
    const outcome = attemptPairForRow(db, row, days);
    if (outcome === 'linked') linked += 1;
    else if (outcome === 'ambiguous') ambiguous += 1;
    else if (outcome === 'no-match') noMatch += 1;
    else skipped += 1;
  }
  console.warn(
    `[backfill-transfer-pairs] APPLIED — examined=${ids.length} linked=${linked} ` +
      `ambiguous=${ambiguous} no-match=${noMatch} skipped=${skipped}`
  );
}

function main(): void {
  const apply = process.argv.includes('--apply');
  const days = getTransferPairWindowDays();

  const opened = openFinanceDb(resolveFinanceSqlitePath());
  try {
    const ids = transferPairsService.listUnpairedTransactionIds(opened.db);
    console.warn(
      `[backfill-transfer-pairs] examining ${ids.length} unpaired row(s), window=${days}d`
    );

    if (apply) runApply(opened.db, ids, days);
    else runDryRun(opened.db, ids, days);
  } finally {
    opened.raw.close();
  }
}

main();
