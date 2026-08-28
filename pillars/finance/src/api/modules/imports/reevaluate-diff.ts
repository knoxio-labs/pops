/**
 * Detects whether re-evaluation changed a transaction.
 *
 * Two questions, deliberately not the same one. {@link transactionChanged} asks
 * whether the *classification* moved — a bucket move, status flip, type/entity
 * change or match-type change, copied verbatim from the monolith
 * `lib/correction-helpers.ts` — and it drives the `affectedCount` the FE shows.
 * {@link correctionApplicationChanged} asks whether the rule *did anything at
 * all*, which is the question a usage counter answers and a strictly wider one.
 */
import type { ProcessedTransaction, SuggestedTag } from './types.js';

export function transactionChanged(
  prev: ProcessedTransaction,
  next: ProcessedTransaction,
  prevBucket?: 'matched' | 'uncertain' | 'failed',
  nextBucket?: 'matched' | 'uncertain' | 'failed'
): boolean {
  if (prevBucket && nextBucket && prevBucket !== nextBucket) return true;
  if (prev.status !== next.status) return true;
  if (prev.transactionType !== next.transactionType) return true;
  if (prev.entity.entityId !== next.entity.entityId) return true;
  if (prev.entity.entityName !== next.entity.entityName) return true;
  return prev.entity.matchType !== next.entity.matchType;
}

/** Order-sensitive identity of a suggested-tag list, for the comparison below. */
function tagFingerprint(tags: SuggestedTag[] | undefined): string {
  return (tags ?? []).map((t) => `${t.tag}|${t.source}|${t.pattern ?? ''}`).join('\n');
}

/**
 * Did applying a correction to `prev` actually produce something different?
 *
 * Strictly wider than {@link transactionChanged}, because a correction writes
 * more than the classification: it can rewrite the location and the suggested
 * tags while leaving the entity and the bucket alone. Editing a rule's tags and
 * re-evaluating is exactly that shape, and it is a real application — so the
 * usage counter has to see it, even though `affectedCount` should not
 * (POPS-2641).
 */
export function correctionApplicationChanged(
  prev: ProcessedTransaction,
  next: ProcessedTransaction
): boolean {
  if (transactionChanged(prev, next)) return true;
  if (prev.location !== next.location) return true;
  return tagFingerprint(prev.suggestedTags) !== tagFingerprint(next.suggestedTags);
}
