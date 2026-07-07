import { requiresEntity } from '../../../lib/transaction-type';

import type { ConfirmedTransaction } from '@pops/finance';

import type { ProcessedTransaction } from '../../../store/importStore';

/**
 * Whether a matched row can actually be committed. A type that
 * {@link requiresEntity} (a `purchase`/`refund`, or an unset/unknown type) needs
 * a resolved merchant (`entityId` + `entityName`); the entity-optional types
 * commit without one. This is the single predicate behind both the commit
 * filter and the pre-commit count/notice, so the two can never drift (#3765).
 */
export function isConfirmable(t: ProcessedTransaction): boolean {
  return !requiresEntity(t.transactionType) || Boolean(t.entity?.entityId && t.entity?.entityName);
}

/**
 * Split the matched bucket into what will commit and what will be dropped for
 * want of a merchant, so the Review step can show a truthful count and surface
 * the dropped rows instead of losing them silently (#3765). The two arrays are
 * disjoint and exhaustive over `matched`.
 */
export function partitionConfirmable(matched: ProcessedTransaction[]): {
  confirmed: ProcessedTransaction[];
  dropped: ProcessedTransaction[];
} {
  const confirmed: ProcessedTransaction[] = [];
  const dropped: ProcessedTransaction[] = [];
  for (const t of matched) (isConfirmable(t) ? confirmed : dropped).push(t);
  return { confirmed, dropped };
}

export function buildConfirmedTransactions(
  matched: ProcessedTransaction[]
): ConfirmedTransaction[] {
  return matched.filter(isConfirmable).map((t) => ({
    date: t.date,
    description: t.description,
    amount: t.amount,
    account: t.account,
    location: t.location,
    rawRow: t.rawRow,
    checksum: t.checksum,
    transactionType: t.transactionType,
    entityId: t.entity?.entityId,
    entityName: t.entity?.entityName,
    tags: (t.suggestedTags ?? []).map((s) => s.tag),
    suggestedTags: t.suggestedTags,
    matchType: t.entity?.matchType,
    matchRuleId: t.ruleProvenance?.ruleId,
    matchConfidence: t.entity?.confidence,
  }));
}
