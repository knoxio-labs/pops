import { aiTagSuggestionOutcomesService, type FinanceDb } from '../../../db/index.js';

import type { CommitPayload } from './types.js';

/**
 * Record what the model suggested for `txn` beside what it is being committed
 * with (POPS-3677). A row with no AI suggestion records nothing, and neither
 * does one whose suggestions carry no prompt version: a draft processed before
 * versions were stamped has nothing to join the outcome to.
 */
export function recordAiSuggestionOutcome(
  tx: FinanceDb,
  txn: CommitPayload['transactions'][number],
  transactionId: string
): void {
  const aiSuggestions = (txn.suggestedTags ?? []).filter((s) => s.source === 'ai');
  const promptVersion = aiSuggestions.find((s) => s.promptVersion !== undefined)?.promptVersion;
  if (promptVersion === undefined) return;
  aiTagSuggestionOutcomesService.recordAiTagSuggestionOutcome(tx, {
    transactionId,
    promptVersion,
    suggestedTags: aiSuggestions.map((s) => s.tag),
    committedTags: txn.tags ?? [],
  });
}
