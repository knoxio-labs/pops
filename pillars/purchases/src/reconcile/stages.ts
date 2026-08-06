/**
 * The per-charge ladder stages, and the blocking that feeds them.
 *
 * Each stage answers one question about one charge: is there a single
 * transaction for exactly this amount, a set of them that sums to it, or a
 * smaller one that partly paid it. `solve.ts` decides the order they run in
 * and what happens between them.
 */
import { descriptorMatcherFor } from './descriptor.js';
import { findSubsetSummingTo, MIN_SPLIT_SIZE } from './subset-sum.js';
import {
  STAGE_CONFIDENCE,
  type ChargeForReview,
  type ProposedLink,
  type SolvableCharge,
  type SolvableTransaction,
} from './types.js';
import { isWithinWindow, settlementWindowFor } from './window.js';

export type MatchOutcome =
  | { kind: 'linked'; links: readonly ProposedLink[] }
  | { kind: 'review'; reason: ChargeForReview['reason'] };

/**
 * Deterministic candidate order.
 *
 * Ids are random and creation times collide within a sweep, so date then
 * amount then uri is the only total order that depends purely on the data.
 */
export function orderedTransactions(
  transactions: readonly SolvableTransaction[]
): readonly SolvableTransaction[] {
  return [...transactions].toSorted(
    (a, b) =>
      a.date.localeCompare(b.date) || a.amountCents - b.amountCents || a.uri.localeCompare(b.uri)
  );
}

/**
 * Stage 0 — blocking. Narrow the field to transactions that could plausibly
 * settle this charge: unclaimed, inside the window, matching the source's
 * descriptor, and of the same sign.
 *
 * Sign matters more than it looks. A refund is a negative charge, and
 * without this guard a refund could be "settled" by an ordinary purchase of
 * the same magnitude.
 */
export function candidatesFor(
  charge: SolvableCharge,
  transactions: readonly SolvableTransaction[],
  claimed: ReadonlySet<string>,
  defaultWindowDays: number
): readonly SolvableTransaction[] {
  const window = settlementWindowFor(
    charge.orderedAt,
    charge.settlementWindowDays ?? defaultWindowDays
  );
  if (window === null) return [];

  const wantPositive = charge.amountCents > 0;
  // Compiled once per charge rather than once per candidate.
  const matchesDescriptor = descriptorMatcherFor(charge.descriptorPattern);

  return orderedTransactions(
    transactions.filter((transaction) => {
      if (claimed.has(transaction.uri)) return false;
      if (!isWithinWindow(transaction.date, window)) return false;
      if (transaction.amountCents === 0) return false;
      if (transaction.amountCents > 0 !== wantPositive) return false;
      return matchesDescriptor(transaction.description);
    })
  );
}

/** True when this transaction could settle this charge at all (stage 0). */
export function isEligible(
  charge: SolvableCharge,
  transaction: SolvableTransaction,
  defaultWindowDays: number
): boolean {
  const window = settlementWindowFor(
    charge.orderedAt,
    charge.settlementWindowDays ?? defaultWindowDays
  );
  if (window === null) return false;
  if (!isWithinWindow(transaction.date, window)) return false;
  if (transaction.amountCents === 0 || charge.amountCents === 0) return false;
  if (transaction.amountCents > 0 !== charge.amountCents > 0) return false;
  return descriptorMatcherFor(charge.descriptorPattern)(transaction.description);
}

/** Stage 1 — a single transaction for exactly the charge amount. */
export function matchExact(
  charge: SolvableCharge,
  candidates: readonly SolvableTransaction[]
): MatchOutcome | null {
  const hits = candidates.filter((t) => t.amountCents === charge.amountCents);
  if (hits.length === 0) return null;

  // Two transactions of the same amount in the same window is exactly the
  // case a coin flip gets wrong half the time — a duplicate charge and its
  // correction look identical from here.
  if (hits.length > 1) return { kind: 'review', reason: 'ambiguous' };

  const [only] = hits;
  if (only === undefined) return null;
  return { kind: 'linked', links: [linkOf(charge, only, only.amountCents, 'exact')] };
}

/**
 * Stage 2 — subset-sum in the split direction: one charge settled by
 * several transactions, which is what a multi-shipment order looks like on
 * a statement.
 */
export function matchSplit(
  charge: SolvableCharge,
  candidates: readonly SolvableTransaction[]
): MatchOutcome | null {
  const search = findSubsetSummingTo(
    candidates.map((t) => t.amountCents),
    charge.amountCents,
    { minSize: MIN_SPLIT_SIZE }
  );

  switch (search.kind) {
    case 'unique':
      return {
        kind: 'linked',
        links: search.indices.flatMap((index) => {
          const transaction = candidates[index];
          return transaction === undefined
            ? []
            : [linkOf(charge, transaction, transaction.amountCents, 'split')];
        }),
      };
    case 'ambiguous':
      return { kind: 'review', reason: 'ambiguous' };
    case 'too-many':
      return { kind: 'review', reason: 'too-many-candidates' };
    case 'none':
      return null;
  }
}

/**
 * Stage 3 — partial payment: a gift card, rewards balance or points paid
 * part of the order, so the card was charged less than the total and no
 * partition can ever close the gap.
 *
 * Deliberately the most conservative stage. It fires only when exactly one
 * candidate remains, because "the charge is bigger than this transaction"
 * describes every unrelated transaction in the window too — with two
 * candidates there is no evidence for choosing either, and the residual it
 * would record is a number invented to make the arithmetic close.
 */
export function matchPartial(
  charge: SolvableCharge,
  candidates: readonly SolvableTransaction[]
): MatchOutcome | null {
  const smaller = candidates.filter((t) => Math.abs(t.amountCents) < Math.abs(charge.amountCents));
  if (smaller.length === 0) return null;
  if (smaller.length > 1) return { kind: 'review', reason: 'ambiguous-partial' };

  const [only] = smaller;
  if (only === undefined) return null;
  return { kind: 'linked', links: [linkOf(charge, only, only.amountCents, 'partial')] };
}

export function linkOf(
  charge: SolvableCharge,
  transaction: SolvableTransaction,
  amountCents: number,
  linkType: ProposedLink['linkType']
): ProposedLink {
  return {
    chargeId: charge.id,
    transactionUri: transaction.uri,
    amountCents,
    linkType,
    confidence: STAGE_CONFIDENCE[linkType],
  };
}
