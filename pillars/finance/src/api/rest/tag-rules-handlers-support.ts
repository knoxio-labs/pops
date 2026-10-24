/**
 * Read/error-translation helpers shared by the `tagRules.*` handlers.
 *
 * Split out of `tag-rules-handlers.ts` so the handler factory stays under the
 * line cap — see that file's header for the surface it exposes.
 */
import {
  type FinanceDb,
  transactionTagRulesService,
  EmptyTagRuleTagsError,
  InvalidPatternError,
  MarkerFacetTagRuleError,
  PlaceholderEntityScopeError,
  TransactionTagRuleNotFoundError,
  UnmatchablePatternError,
} from '../../db/index.js';
import { type EntityIdentities } from '../../db/services/entity-identity.js';
import { findTagRuleOverlaps } from '../modules/tag-rules/overlap.js';
import { toTagRule } from '../modules/tag-rules/service.js';
import { NotFoundError, ValidationError } from '../shared/errors.js';

import type { TagRuleLedgerMatchStatus } from '../../db/index.js';
import type { TagRuleOverlap } from '../modules/tag-rules/overlap.js';
import type { TagRule } from '../modules/tag-rules/service.js';

/** {@link TagRule} plus its ledger-match verdict (POPS-2941) and its overlaps with other rules (POPS-3691). */
export type TagRuleWithLedgerStatus = TagRule & {
  ledgerMatchStatus: TagRuleLedgerMatchStatus;
  overlaps: TagRuleOverlap[];
};

/**
 * Annotate rules with whether their pattern matches anything in the ledger,
 * and with the other active rules each overlaps.
 *
 * One `loadTagRuleLedgerSnapshot` fetch for the whole call, reused across
 * every rule passed in, and one more for the overlaps — the cost the
 * `list`/`get` handlers pay is per request, not per rule (POPS-2941, POPS-3691).
 */
export function withLedgerMatchStatus(
  db: FinanceDb,
  rules: readonly TagRule[],
  identities?: EntityIdentities
): TagRuleWithLedgerStatus[] {
  const snapshot = transactionTagRulesService.loadTagRuleLedgerSnapshot(db);
  const overlaps = findTagRuleOverlaps(db, rules, identities);
  return rules.map((rule) => ({
    ...rule,
    ledgerMatchStatus: transactionTagRulesService.tagRuleLedgerMatchStatus(
      rule,
      snapshot,
      identities
    ),
    overlaps: overlaps.get(rule.id) ?? [],
  }));
}

/** {@link withLedgerMatchStatus} for the single-rule `get` response. */
export function withLedgerMatchStatusOne(
  db: FinanceDb,
  rule: TagRule,
  identities?: EntityIdentities
): TagRuleWithLedgerStatus {
  const snapshot = transactionTagRulesService.loadTagRuleLedgerSnapshot(db);
  return {
    ...rule,
    ledgerMatchStatus: transactionTagRulesService.tagRuleLedgerMatchStatus(
      rule,
      snapshot,
      identities
    ),
    overlaps: findTagRuleOverlaps(db, [rule], identities).get(rule.id) ?? [],
  };
}

export function translateTagRuleError(err: unknown, id?: string): never {
  if (err instanceof TransactionTagRuleNotFoundError) {
    throw new NotFoundError('TagRule', id ?? err.id);
  }
  if (err instanceof InvalidPatternError || err instanceof UnmatchablePatternError) {
    throw new ValidationError(err.message, { pattern: err.pattern });
  }
  if (err instanceof EmptyTagRuleTagsError) {
    throw new ValidationError(err.message, { tags: [] });
  }
  if (err instanceof MarkerFacetTagRuleError) {
    throw new ValidationError(err.message, { tags: err.tags });
  }
  if (err instanceof PlaceholderEntityScopeError) {
    throw new ValidationError(err.message, { entityId: err.entityId });
  }
  throw err;
}

/** Patch a rule while retaining an equivalent historical scope and translating persistence failures. */
export function updateTagRuleWithIdentity(
  db: FinanceDb,
  id: string,
  input: transactionTagRulesService.UpdateTransactionTagRuleInput,
  identities: EntityIdentities
): TagRule {
  try {
    const row = transactionTagRulesService.updateTransactionTagRule(db, id, input, identities);
    return toTagRule(row);
  } catch (error) {
    translateTagRuleError(error, id);
  }
}
