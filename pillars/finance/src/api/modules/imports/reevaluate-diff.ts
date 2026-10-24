/**
 * Detects whether re-evaluation changed a transaction's classification.
 *
 * Copied verbatim from the monolith `lib/correction-helpers.ts`. A change is
 * any bucket move, status flip, type/entity change, or match-type change —
 * this drives the `affectedCount` returned to the FE.
 */
import { entityIdentity, type EntityIdentities } from '../../../db/services/entity-identity.js';

import type { ProcessedTransaction, SuggestedTag } from './types.js';

export function transactionChanged(
  prev: ProcessedTransaction,
  next: ProcessedTransaction,
  prevBucket?: 'matched' | 'uncertain' | 'failed',
  options?:
    | 'matched'
    | 'uncertain'
    | 'failed'
    | { nextBucket?: 'matched' | 'uncertain' | 'failed'; identities?: EntityIdentities }
): boolean {
  const { nextBucket, identities } =
    typeof options === 'object' ? options : { nextBucket: options, identities: undefined };
  if (prevBucket && nextBucket && prevBucket !== nextBucket) return true;
  if (prev.status !== next.status) return true;
  if (prev.transactionType !== next.transactionType) return true;
  if (
    entityIdentity(prev.entity.entityId ?? null, identities) !==
    entityIdentity(next.entity.entityId ?? null, identities)
  )
    return true;
  if (prev.entity.entityName !== next.entity.entityName) return true;
  return prev.entity.matchType !== next.entity.matchType;
}

/**
 * A tag set's identity for change comparison — same shape `tag-rules/preview.ts`
 * already diffs by (a `Set` of tag names), so a rule that reorders the same
 * tags reads as unchanged here too rather than as new output.
 */
function tagFingerprint(tags: readonly SuggestedTag[] | undefined): string {
  return [...new Set((tags ?? []).map((t) => t.tag))].toSorted().join(',');
}

/**
 * Detects whether re-applying a correction rule produced different output for
 * a transaction — the question `countsAsUsage` asks, which is broader than
 * {@link transactionChanged}: a rule that only rewrites `suggestedTags` or
 * `location` is real work a rule did, even though neither is a classification
 * change `affectedCount` should report to the FE (POPS-2659).
 *
 * `affectedCount` keeps `transactionChanged` on purpose — a tag-only rewrite
 * is not a reclassification — so this predicate exists only for usage
 * telemetry, never as a replacement for the other.
 */
export function correctionApplicationChanged(
  prev: ProcessedTransaction,
  next: ProcessedTransaction,
  prevBucket?: 'matched' | 'uncertain' | 'failed',
  options?:
    | 'matched'
    | 'uncertain'
    | 'failed'
    | { nextBucket?: 'matched' | 'uncertain' | 'failed'; identities?: EntityIdentities }
): boolean {
  const { nextBucket, identities } =
    typeof options === 'object' ? options : { nextBucket: options, identities: undefined };
  if (transactionChanged(prev, next, prevBucket, { nextBucket, identities })) return true;
  if (prev.location !== next.location) return true;
  return tagFingerprint(prev.suggestedTags) !== tagFingerprint(next.suggestedTags);
}
