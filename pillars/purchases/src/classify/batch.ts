/**
 * Batching lines so one product is one decision.
 *
 * Amazon spend repeats: 54 ASINs in the reference bundle were bought in more
 * than one order, 12.6% of spend, so keying on the sku means one answer
 * covers every past and future repeat of it.
 *
 * Which lines are one product is decided by
 * {@link identifyProduct} — the same rule the product-grain aggregate groups
 * on, so a decision the pass made about a product and a row the leaderboard
 * shows for it describe the same set of lines. That module carries why the
 * key falls back the way it does.
 */
import { identifyProduct, normalisedName } from '../db/services/product-identity.js';

import type { ProductLine } from '../db/services/product-identity.js';

export { normalisedName };

/** What the pass needs to know about a line to decide how to batch it. */
export type BatchableItem = ProductLine;

/** The batching key for one line. */
export function batchingKey(item: BatchableItem): string {
  return identifyProduct(item).key;
}

/** One product: every line that shares a batching key. */
export interface ProposalCandidate {
  readonly key: string;
  /**
   * The merchant every line in this group came from, or null when they came
   * from more than one.
   *
   * Only a cross-source scheme can produce a group spanning merchants, and
   * for such a group there is no merchant to name: naming the first line's
   * would hand a consumer — the classification prompt above all — a fact
   * that is true of one line and asserted about all of them.
   */
  readonly source: string | null;
  /** The first line's name, which is what the model is shown. */
  readonly name: string;
  readonly sku: string | null;
  /** Every line this one decision will be written to. */
  readonly itemIds: readonly string[];
}

/**
 * Fold lines into candidates, preserving input order.
 *
 * Order matters for resumability: the caller reads lines highest-value
 * first and expects the batches to follow, so a run that is interrupted has
 * spent its budget on the lines worth deciding.
 */
export function toCandidates(items: readonly BatchableItem[]): readonly ProposalCandidate[] {
  interface Group {
    readonly key: string;
    source: string | null;
    readonly name: string;
    readonly sku: ProductIdentity | null;
    readonly itemIds: string[];
  }

  const byKey = new Map<string, Group>();
  for (const item of items) {
    const key = batchingKey(item);
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, {
        key,
        source: item.source,
        name: item.name,
        sku: item.sku,
        itemIds: [item.id],
      });
      continue;
    }
    existing.itemIds.push(item.id);
    // An ASIN group can span merchants, and then no single merchant is a
    // fact about the group. Dropping the first line's is what stops it from
    // being reported as one.
    if (existing.source !== item.source) existing.source = null;
  }
  return [...byKey.values()];
}

/** Split candidates into fixed-size batches, in order. */
export function intoBatches<T>(candidates: readonly T[], size: number): readonly (readonly T[])[] {
  if (size < 1) throw new Error(`batch size must be at least 1, got ${String(size)}`);
  const batches: T[][] = [];
  for (let i = 0; i < candidates.length; i += size) {
    batches.push([...candidates.slice(i, i + size)]);
  }
  return batches;
}
