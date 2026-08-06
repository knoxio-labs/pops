/**
 * Bounded exhaustive subset-sum over integer cents.
 *
 * Stage 2 of the reconciliation ladder. One algorithm yields both shapes
 * the real world produces: a **split** (one charge settled by several
 * transactions) and a **combined** settlement (several charges paid by one
 * transaction) are the same search with the roles of the two sides
 * exchanged.
 *
 * Exhaustive rather than greedy, and exact rather than approximate,
 * because the answer must be identical for identical inputs — links are
 * re-derived from scratch on every sweep (ADR-042), so a search that
 * depended on iteration order or floating point would make re-derivation
 * produce a different answer from the same data.
 */

/**
 * Candidate ceiling for the exhaustive search.
 *
 * 2^12 = 4096 subsets, which is trivial. The bound is not really about
 * cost: as the candidate count grows, the number of subsets that happen to
 * hit any given total grows with it, so a wide window does not find better
 * answers — it finds more coincidences. Refusing to search a window this
 * crowded is more honest than returning the arithmetically-valid nonsense a
 * larger one produces.
 */
export const MAX_SUBSET_CANDIDATES = 12;

/** Smallest subset size worth reporting for a split. */
export const MIN_SPLIT_SIZE = 2;

export type SubsetSearch =
  /** No combination reaches the target. */
  | { readonly kind: 'none' }
  /** Exactly one combination does. The only case safe to act on. */
  | { readonly kind: 'unique'; readonly indices: readonly number[] }
  /**
   * More than one combination reaches the target. Ambiguity is a signal,
   * not a coin flip — the caller drops confidence and routes to review
   * rather than picking one (ADR-042).
   */
  | { readonly kind: 'ambiguous'; readonly found: number }
  /** Too many candidates to search honestly. See {@link MAX_SUBSET_CANDIDATES}. */
  | { readonly kind: 'too-many'; readonly candidates: number };

export interface SubsetSearchOptions {
  /** Smallest acceptable subset size. Defaults to 1. */
  readonly minSize?: number;
  /** Override the candidate ceiling. Tests use this; production does not. */
  readonly maxCandidates?: number;
}

/**
 * Find the combinations of `amounts` that sum exactly to `target`.
 *
 * **Zero amounts are excluded from the search**, which is not a
 * micro-optimisation. A zero-valued candidate can be added to or removed
 * from any solution without changing its sum, so a single zero turns every
 * unique answer into an ambiguous one and the whole window routes to review
 * for no reason. Finance can legitimately carry a zero-amount transaction
 * (a fully-discounted line, a corrected import), so this is reachable.
 *
 * **Sign is not mixed.** Only candidates with the same sign as the target
 * take part. Without that, a refund and a purchase can cancel out to hit a
 * target neither belongs to — arithmetically valid and factually absurd.
 */
export function findSubsetSummingTo(
  amounts: readonly number[],
  target: number,
  options: SubsetSearchOptions = {}
): SubsetSearch {
  const minSize = options.minSize ?? 1;
  const maxCandidates = options.maxCandidates ?? MAX_SUBSET_CANDIDATES;

  const eligible = eligibleIndices(amounts, target);
  if (eligible.length > maxCandidates) {
    return { kind: 'too-many', candidates: eligible.length };
  }

  let found: readonly number[] | null = null;
  let count = 0;

  // Enumerate every subset as a bitmask over the eligible list. Ascending
  // mask order is a fixed traversal, so the first solution found for a
  // given input is always the same one.
  for (let mask = 1; mask < 1 << eligible.length; mask++) {
    const size = popcount(mask);
    if (size < minSize) continue;
    if (sumOfMask(amounts, eligible, mask) !== target) continue;

    count += 1;
    found ??= indicesOfMask(eligible, mask);
    if (count > 1) return { kind: 'ambiguous', found: count };
  }

  if (found === null) return { kind: 'none' };
  return { kind: 'unique', indices: found };
}

/**
 * Indices eligible to take part: non-zero, and of the same sign as the
 * target. A zero target admits nothing, since any subset of same-signed
 * non-zero values is non-zero.
 */
function eligibleIndices(amounts: readonly number[], target: number): number[] {
  const wantPositive = target > 0;
  const indices: number[] = [];
  for (const [index, amount] of amounts.entries()) {
    if (amount === 0) continue;
    if (target === 0) continue;
    if (amount > 0 !== wantPositive) continue;
    indices.push(index);
  }
  return indices;
}

function sumOfMask(amounts: readonly number[], eligible: readonly number[], mask: number): number {
  let total = 0;
  for (const [bit, index] of eligible.entries()) {
    if ((mask & (1 << bit)) !== 0) total += amounts[index] ?? 0;
  }
  return total;
}

function indicesOfMask(eligible: readonly number[], mask: number): number[] {
  const indices: number[] = [];
  for (const [bit, index] of eligible.entries()) {
    if ((mask & (1 << bit)) !== 0) indices.push(index);
  }
  return indices;
}

function popcount(mask: number): number {
  let count = 0;
  for (let bits = mask; bits !== 0; bits >>= 1) count += bits & 1;
  return count;
}
