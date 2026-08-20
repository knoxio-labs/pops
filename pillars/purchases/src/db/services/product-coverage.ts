/**
 * How many lines each grouping basis accounted for.
 *
 * Kept beside the fold rather than inside it because the two answer
 * different questions: the fold decides what a group reports, this decides
 * how much of the answer rests on a proposal rather than on something a
 * source or a person asserted. A consumer that cannot tell those apart is a
 * consumer presenting a guess as a fact.
 */
import type { ProductIdentity } from './product-identity.js';

/** The running per-basis tally {@link countCoverage} adds to. */
export interface CoverageTally {
  skuKeyedLines: number;
  confirmedProductLines: number;
  proposedProductLines: number;
  nameKeyedLines: number;
  unidentifiedLines: number;
}

/**
 * Tally one line against the basis that grouped it.
 *
 * The `never` assignment is what makes it exhaustive: a basis added later
 * fails to compile here instead of falling through, uncounted, and breaking
 * the invariant that the buckets sum to the line count — which is how a
 * coverage figure comes to overstate the identified share of an answer, the
 * one error this route must not make.
 */
export function countCoverage(coverage: CoverageTally, identity: ProductIdentity): void {
  switch (identity.basis) {
    case 'sku':
      coverage.skuKeyedLines += 1;
      return;
    case 'product':
      if (identity.confirmed) coverage.confirmedProductLines += 1;
      else coverage.proposedProductLines += 1;
      return;
    case 'name':
      coverage.nameKeyedLines += 1;
      return;
    case 'unidentified':
      coverage.unidentifiedLines += 1;
      return;
    default: {
      const unhandled: never = identity;
      throw new Error(`no coverage bucket is defined for ${JSON.stringify(unhandled)}`);
    }
  }
}
