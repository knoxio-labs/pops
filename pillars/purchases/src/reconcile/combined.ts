/**
 * Combined settlement: several charges paid by one transaction.
 *
 * The same exhaustive subset-sum as a split, with the two sides exchanged —
 * there, one charge is the target and transactions are the candidates; here,
 * one transaction is the target and charges are the candidates.
 *
 * It cannot be done in the per-charge loop, which is why it is a phase of
 * its own. Deciding that three charges together settle one transaction
 * requires seeing all three at once; a loop that considers one charge at a
 * time can only ever ask "does something here sum to *me*".
 */

import { eligibilityFor, linkOf, orderedTransactions, type BlockingContext } from './stages.js';
import { findSubsetSummingTo, MIN_SPLIT_SIZE } from './subset-sum.js';

import type { ProposedLink, SolvableCharge, SolvableTransaction } from './types.js';

export interface CombinedResult {
  readonly links: readonly ProposedLink[];
  /** Charges this phase claimed, so later phases skip them. */
  readonly matchedChargeIds: ReadonlySet<string>;
  /** Transactions this phase spent. */
  readonly claimedUris: ReadonlySet<string>;
}

/**
 * Find combined settlements among the charges nothing else matched.
 *
 * Runs **after** exact and split and **before** partial. Ordering matters
 * in both directions: exact and split are stronger evidence and should win,
 * while partial is the weakest guess and consumes a transaction — letting it
 * run first would let one speculative link eat the very transaction a clean
 * multi-charge partition needed.
 *
 * A charge only takes part if the transaction is eligible for it on its own
 * terms — inside *its* window, matching *its* source descriptor, same sign.
 * Two orders from different merchants cannot be combined just because their
 * amounts happen to add up.
 */
export function matchCombined(
  charges: readonly SolvableCharge[],
  transactions: readonly SolvableTransaction[],
  claimed: ReadonlySet<string>,
  blocking: BlockingContext
): CombinedResult {
  const links: ProposedLink[] = [];
  const matchedChargeIds = new Set<string>();
  const claimedUris = new Set<string>();

  // Compiled once per charge, not once per (charge, transaction) pair. The
  // loop below is nested, and `eligibilityFor` builds a regex.
  const admissible = charges.map((charge) => ({
    charge,
    accepts: eligibilityFor(charge, blocking),
  }));

  for (const transaction of orderedTransactions(transactions)) {
    if (claimed.has(transaction.uri) || claimedUris.has(transaction.uri)) continue;

    const eligible = admissible
      .filter((entry) => !matchedChargeIds.has(entry.charge.id) && entry.accepts(transaction))
      .map((entry) => entry.charge);
    // Fewer than two eligible charges cannot be a *combined* settlement; a
    // single charge for this amount is an exact match and was already tried.
    if (eligible.length < MIN_SPLIT_SIZE) continue;

    const search = findSubsetSummingTo(
      eligible.map((charge) => charge.amountCents),
      transaction.amountCents,
      { minSize: MIN_SPLIT_SIZE }
    );
    // Ambiguity is left alone rather than routed to review here: the charges
    // are still unmatched, so the caller's fallback reports each of them on
    // its own terms. Reporting them from this phase would say "ambiguous
    // combined" about charges that may have a perfectly good reason of their
    // own for being unmatched.
    if (search.kind !== 'unique') continue;

    for (const index of search.indices) {
      const charge = eligible[index];
      if (charge === undefined) continue;
      links.push(linkOf(charge, transaction, charge.amountCents, 'combined'));
      matchedChargeIds.add(charge.id);
    }
    claimedUris.add(transaction.uri);
  }

  return { links, matchedChargeIds, claimedUris };
}
