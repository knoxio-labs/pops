import { importsService, tagVocabularyService, type FinanceDb } from '../../../db/index.js';
import { recordAiSuggestionOutcome } from './commit-ai-outcomes.js';
import { recordImportBatchesPhase, type InsertedTransaction } from './commit-batches.js';
import { mintImportCheckpointsPhase } from './commit-checkpoint.js';
import { transactionColumns } from './commit-columns.js';
import { resolveCommitEntityId } from './commit-entity-resolution.js';
import {
  batchSourceFor,
  commitLiveDraftPhase,
  type LiveDraftContext,
} from './commit-live-draft.js';
import { expandLoanRepaymentRow } from './commit-loan-split.js';
import { pairTransfersPhase } from './commit-pair-transfers.js';
import { recordMatchedRuleUsage } from './commit-rule-usage.js';

import type {
  CommitBatch,
  CommitPayload,
  CommitResult,
  FailedTransactionDetail,
  ImportWarning,
} from './types.js';

/** The inserted rows and failures produced by the import transaction writer. */
export interface WriteTxnsResult {
  imported: number;
  failed: number;
  failedDetails: FailedTransactionDetail[];
  /** The rows successfully inserted this commit, for the pairing and batch phases. */
  inserted: InsertedTransaction[];
}

/** Insert ordered import rows and record their rule and tag usage inside the caller transaction. */
export function writeTransactionsPhase(
  tx: FinanceDb,
  payload: CommitPayload,
  tempIdMap: Map<string, string>
): WriteTxnsResult {
  let imported = 0;
  let failed = 0;
  const failedDetails: FailedTransactionDetail[] = [];
  const inserted: InsertedTransaction[] = [];

  // The loan split (`expandLoanRepaymentRow`) computes each repayment's
  // interest leg from `balanceAsOf` the day before it, which only sees rows
  // already inserted earlier in this loop. A batch is not guaranteed to arrive in
  // date order — a bank statement exported newest-first is a common CSV
  // layout — so an out-of-order batch would let a later-processed-but-
  // earlier-dated repayment be missing from an earlier-processed-but-later-
  // dated repayment's balance lookup, understating the balance the interest
  // is computed against. Sorting the whole batch chronologically before the
  // insert loop fixes that for every account at once; nothing downstream of
  // this loop (dedup-checksum collection, transfer pairing) depends on the
  // original payload order.
  const orderedTransactions = payload.transactions.toSorted((a, b) => a.date.localeCompare(b.date));

  for (const txn of orderedTransactions) {
    const entityId = resolveCommitEntityId(txn.entityId, tempIdMap);
    try {
      // A loan repayment expands to its interest + principal legs here
      // (POPS-2830); every other row is its own single-element array, so the
      // insert loop below doesn't need to know the split happened at all.
      const columns = transactionColumns(txn, entityId);
      const rows = expandLoanRepaymentRow(tx, columns);
      const firstLeg = inserted.length;
      for (const columns of rows) {
        const row = importsService.insertImportTransaction(tx, columns);
        imported++;
        inserted.push({
          id: row.id,
          accountId: row.accountId,
          date: row.date,
          carriesBalance: txn.balanceCents !== undefined,
        });
      }
      recordMatchedRuleUsage(tx, txn);
      // A split loan repayment is one suggestion across its legs; count it once.
      const firstLegId = inserted[firstLeg]?.id;
      if (firstLegId !== undefined) recordAiSuggestionOutcome(tx, txn, firstLegId);
      tagVocabularyService.incrementVocabularyUsage(tx, columns.tags);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CommitImport] Transaction write failed: ${errorMessage}`);
      failed++;
      failedDetails.push({ checksum: txn.checksum ?? null, error: errorMessage });
    }
  }

  return { imported, failed, failedDetails, inserted };
}

/**
 * The phases that read back what the write phase did: pair the rows just
 * written, mint checkpoints from any closing balance the file carried, and
 * record one batch per account. All three run after every row has landed and
 * before `recordCommit`, so a replayed key returns them rather than redoing
 * them.
 */
export function recordOutcomePhases(
  tx: FinanceDb,
  payload: CommitPayload,
  writeResult: WriteTxnsResult,
  liveDraft: LiveDraftContext | undefined
): { checkpoints: CommitResult['checkpoints']; warnings: ImportWarning[]; batches: CommitBatch[] } {
  pairTransfersPhase(
    tx,
    writeResult.inserted.map((row) => row.id)
  );

  const failedChecksums = new Set(
    writeResult.failedDetails.map((d) => d.checksum).filter((c): c is string => c !== null)
  );
  const { checkpoints, warnings } = mintImportCheckpointsPhase(
    tx,
    payload.transactions,
    failedChecksums,
    payload.commitKey
  );

  commitLiveDraftPhase(tx, {
    liveDraft,
    inserted: writeResult.inserted,
    commitKey: payload.commitKey,
    checkpoints,
    warnings,
  });

  const batches = recordImportBatchesPhase(tx, {
    inserted: writeResult.inserted,
    sourceFor: batchSourceFor(liveDraft, payload.source),
    checkpoints,
    commitKey: payload.commitKey,
  });

  return { checkpoints, warnings, batches };
}
