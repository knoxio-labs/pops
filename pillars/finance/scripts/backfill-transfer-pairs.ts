/**
 * One-off catch-up run for the paired-transfer engine (POPS-2753). Enabling
 * `FINANCE_TRANSFER_PAIR_ENABLED` only pairs transactions going forward
 * (commit-time) or on the next nightly reconcile tick — this sweeps every
 * currently-unpaired row once immediately, the "immediate catch-up" the
 * reconcile worker's own doc comment anticipated but never wired up
 * (`src/api/cron/reconcile-paired-transfers.ts`).
 *
 * DRY RUN by default — reports what each row would resolve to (linked,
 * ambiguous, or no-match) without writing. Pass `--apply` to actually link.
 * Uses the same `findPairForTransaction`/`findPairCandidates` the live engine
 * uses, so a dry run's prediction and a subsequent `--apply` run agree exactly.
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
import { attemptPairForRow } from '../src/api/modules/transfers/pair-runner.js';
import {
  findPairForTransaction,
  type PairCandidate,
} from '../src/api/modules/transfers/pair-transfers.js';
import {
  openFinanceDb,
  transactionsService,
  transferPairsService,
  type FinanceDb,
} from '../src/db/index.js';

const DEFAULT_WINDOW_DAYS = 3;

function toPairCandidate(row: {
  id: string;
  amountCents: number;
  accountId: string;
  date: string;
  relatedTransactionId: string | null;
}): PairCandidate {
  return {
    id: row.id,
    amount: row.amountCents,
    accountId: row.accountId,
    date: row.date,
    relatedTransactionId: row.relatedTransactionId,
  };
}

function windowDays(): number {
  const raw = process.env['FINANCE_TRANSFER_PAIR_WINDOW_DAYS'];
  const parsed = raw !== undefined && raw !== '' ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WINDOW_DAYS;
}

interface DryRunOutcome {
  id: string;
  kind: 'match' | 'ambiguous' | 'none';
  counterpartId?: string;
}

function predictOutcome(db: FinanceDb, id: string, days: number): DryRunOutcome {
  const row = transactionsService.getTransaction(db, id);
  const candidates = transferPairsService.findPairCandidates(db, row, days);
  const result = findPairForTransaction(
    toPairCandidate(row),
    candidates.map(toPairCandidate),
    days
  );
  if (result.kind === 'match') return { id, kind: 'match', counterpartId: result.id };
  if (result.kind === 'ambiguous') return { id, kind: 'ambiguous' };
  return { id, kind: 'none' };
}

function logMatch(id: string, outcome: DryRunOutcome, seenMatches: Set<string>): boolean {
  if (outcome.kind !== 'match' || !outcome.counterpartId) return false;
  const key = [id, outcome.counterpartId].toSorted().join('|');
  if (seenMatches.has(key)) return false;
  seenMatches.add(key);
  console.warn(`  MATCH ${id} <-> ${outcome.counterpartId}`);
  return true;
}

function runDryRun(db: FinanceDb, ids: readonly string[], days: number): void {
  let matches = 0;
  let ambiguous = 0;
  const seenMatches = new Set<string>();
  for (const id of ids) {
    const outcome = predictOutcome(db, id, days);
    if (logMatch(id, outcome, seenMatches)) {
      matches += 1;
      continue;
    }
    if (outcome.kind === 'ambiguous') {
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

function main(): void {
  const apply = process.argv.includes('--apply');
  const days = windowDays();

  const opened = openFinanceDb(resolveFinanceSqlitePath());
  try {
    const ids = transferPairsService.listUnpairedTransactionIds(opened.db);
    console.warn(
      `[backfill-transfer-pairs] examining ${ids.length} unpaired row(s), window=${days}d`
    );

    if (!apply) {
      runDryRun(opened.db, ids, days);
      return;
    }

    let linked = 0;
    let ambiguous = 0;
    let noMatch = 0;
    let skipped = 0;
    for (const id of ids) {
      const row = transactionsService.getTransaction(opened.db, id);
      const outcome = attemptPairForRow(opened.db, row, days);
      if (outcome === 'linked') linked += 1;
      else if (outcome === 'ambiguous') ambiguous += 1;
      else if (outcome === 'no-match') noMatch += 1;
      else skipped += 1;
    }
    console.warn(
      `[backfill-transfer-pairs] APPLIED — examined=${ids.length} linked=${linked} ` +
        `ambiguous=${ambiguous} no-match=${noMatch} skipped=${skipped}`
    );
  } finally {
    opened.raw.close();
  }
}

main();
