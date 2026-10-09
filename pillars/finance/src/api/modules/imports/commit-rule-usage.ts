import { transactionCorrectionsService, type FinanceDb } from '../../../db/index.js';
import { creditTagRuleUsage } from '../tag-suggester/index.js';

import type { CommitPayload } from './types.js';

/** Credits learned corrections and matched tag rules for an inserted import row. */
export function recordMatchedRuleUsage(
  tx: FinanceDb,
  txn: CommitPayload['transactions'][number]
): void {
  if (txn.matchType === 'learned' && txn.matchRuleId) {
    transactionCorrectionsService.incrementTransactionCorrectionUsage(tx, txn.matchRuleId);
  }
  creditTagRuleUsage(tx, [...new Set(txn.matchedTagRuleIds ?? [])]);
}
