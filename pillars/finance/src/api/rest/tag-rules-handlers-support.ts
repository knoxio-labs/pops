/**
 * Read/error-translation helpers shared by the `tagRules.*` handlers.
 *
 * Split out of `tag-rules-handlers.ts` so the handler factory stays under the
 * line cap — see that file's header for the surface it exposes.
 */
import {
  type FinanceDb,
  transactionTagRulesService,
  InvalidPatternError,
  TransactionTagRuleNotFoundError,
  UnmatchablePatternError,
} from '../../db/index.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';

import type { TagRuleLedgerMatchStatus } from '../../db/index.js';
import type { TagRule } from '../modules/tag-rules/service.js';

/** {@link TagRule} plus its ledger-match verdict (POPS-2941). */
export type TagRuleWithLedgerStatus = TagRule & { ledgerMatchStatus: TagRuleLedgerMatchStatus };

/**
 * Annotate rules with whether their pattern matches anything in the ledger.
 *
 * One `loadTagRuleLedgerSnapshot` fetch for the whole call, reused across
 * every rule passed in — the cost the `list`/`get` handlers pay is one
 * `transactions` scan per request, not one per rule (POPS-2941).
 */
export function withLedgerMatchStatus(
  db: FinanceDb,
  rules: readonly TagRule[]
): TagRuleWithLedgerStatus[] {
  const snapshot = transactionTagRulesService.loadTagRuleLedgerSnapshot(db);
  return rules.map((rule) => ({
    ...rule,
    ledgerMatchStatus: transactionTagRulesService.tagRuleLedgerMatchStatus(rule, snapshot),
  }));
}

/** {@link withLedgerMatchStatus} for the single-rule `get` response. */
export function withLedgerMatchStatusOne(db: FinanceDb, rule: TagRule): TagRuleWithLedgerStatus {
  const snapshot = transactionTagRulesService.loadTagRuleLedgerSnapshot(db);
  return {
    ...rule,
    ledgerMatchStatus: transactionTagRulesService.tagRuleLedgerMatchStatus(rule, snapshot),
  };
}

export function translateTagRuleError(err: unknown, id?: string): never {
  if (err instanceof TransactionTagRuleNotFoundError) {
    throw new NotFoundError('TagRule', id ?? err.id);
  }
  if (err instanceof InvalidPatternError || err instanceof UnmatchablePatternError) {
    throw new ValidationError(err.message, { pattern: err.pattern });
  }
  throw err;
}
