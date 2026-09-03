/**
 * Commit-time paired-transfer phase (#3607 Stage 3c). After the batch has been
 * written, link each freshly-imported row to its unique transfer counterpart —
 * matched against both the rest of the batch and the existing committed rows,
 * all visible on the same open transaction.
 *
 * Gated OFF by default: when `FINANCE_TRANSFER_PAIR_ENABLED` is unset this is a
 * no-op that never touches the DB. Real per-account identity now exists and the
 * "different account" predicate correctly compares `accountId` (POPS-2769), but
 * the flag stays off pending a separate decision to enable it — this is not
 * that decision. It runs LAST in the commit — after correction rules and the
 * retroactive reclassify — so a rule-classified row is already stamped and is
 * skipped by the pairing engine, honouring "rules take precedence".
 */
import { transactionsService, type FinanceDb } from '../../../db/index.js';
import { attemptPairForRow } from '../transfers/pair-runner.js';
import { getTransferPairWindowDays, isTransferPairEnabled } from '../transfers/pair-transfers.js';

/**
 * Link freshly-imported transfers to their counterparts and return the number
 * of pairs linked. Each row is re-read inside the loop, so a row already linked
 * as an earlier row's counterpart is correctly skipped.
 *
 * Pairing is enrichment, not essential to the import, so a per-row failure is
 * logged and swallowed rather than allowed to roll back the whole commit — the
 * same isolation `writeTransactionsPhase` gives individual inserts. Each
 * `linkTransferPair` runs in its own savepoint, so a rolled-back link leaves the
 * rest of the committed batch intact.
 *
 * @returns the count of transfer pairs linked (0 when the feature gate is off).
 */
export function pairTransfersPhase(db: FinanceDb, insertedIds: readonly string[]): number {
  if (!isTransferPairEnabled()) return 0;

  const windowDays = getTransferPairWindowDays();
  let linked = 0;
  for (const id of insertedIds) {
    try {
      const row = transactionsService.getTransaction(db, id);
      if (attemptPairForRow(db, row, windowDays) === 'linked') linked += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[CommitImport] Transfer pairing failed for ${id}: ${message}`);
    }
  }
  return linked;
}
