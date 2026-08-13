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

/**
 * What blocking needs beyond the charge itself.
 *
 * One object rather than two arguments because every stage that narrows a
 * candidate pool passes the whole thing straight through, and a rejection
 * set that has to be looked up by the caller is one a caller can forget to
 * look up — which fails silently, as a pairing quietly proposed again.
 */
export interface BlockingContext {
  /** Settlement window for a source that declares none. */
  readonly defaultWindowDays: number;
  /** Pairings a human ruled out, indexed by charge. */
  readonly rejected: ReadonlyMap<string, ReadonlySet<string>>;
}

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
 * Stage 0 — blocking, compiled once per charge.
 *
 * Narrows the field to transactions that could plausibly settle this
 * charge: inside its window, matching its source descriptor, same sign,
 * non-zero on both sides.
 *
 * Returned as a predicate rather than applied directly because the combined
 * phase tests one charge against many transactions in a nested loop. Doing
 * the window arithmetic and — worse — recompiling the descriptor regex per
 * pair is exactly what `descriptor.ts` was changed to avoid.
 *
 * Sign matters more than it looks. A refund is a negative charge, and
 * without that guard a refund could be "settled" by an ordinary purchase of
 * the same magnitude.
 *
 * A **zero-amount charge accepts nothing**. There is no transaction that
 * could settle it, and treating it as merely sign-less would let every
 * negative transaction in the window count as a candidate — routing it to
 * `ambiguous` review as though the problem were too much evidence rather
 * than a charge that cannot be matched at all.
 *
 * Rejections are the one input here that came from a human rather than
 * from the data. They belong at this stage precisely because blocking is
 * the only place a candidate can be removed without the ladder ever forming
 * an opinion about it: a rejected pairing produces no link, no review entry
 * and no claim on the transaction, which is what leaves that transaction
 * free for the charge it actually settles.
 */
export function eligibilityFor(
  charge: SolvableCharge,
  blocking: BlockingContext
): (transaction: SolvableTransaction) => boolean {
  if (charge.amountCents === 0) return () => false;

  const window = settlementWindowFor(
    charge.orderedAt,
    charge.settlementWindowDays ?? blocking.defaultWindowDays
  );
  if (window === null) return () => false;

  const wantPositive = charge.amountCents > 0;
  const matchesDescriptor = descriptorMatcherFor(charge.descriptorPattern);
  const rejected = blocking.rejected.get(charge.id);

  return (transaction) => {
    if (rejected?.has(transaction.uri) === true) return false;
    if (!isWithinWindow(transaction.date, window)) return false;
    if (transaction.amountCents === 0) return false;
    if (transaction.amountCents > 0 !== wantPositive) return false;
    return matchesDescriptor(transaction.description);
  };
}

/** {@link eligibilityFor}, applied to the unclaimed transactions. */
export function candidatesFor(
  charge: SolvableCharge,
  transactions: readonly SolvableTransaction[],
  claimed: ReadonlySet<string>,
  blocking: BlockingContext
): readonly SolvableTransaction[] {
  const accepts = eligibilityFor(charge, blocking);
  return orderedTransactions(
    transactions.filter((transaction) => !claimed.has(transaction.uri) && accepts(transaction))
  );
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
    transactionDescription: transaction.description,
    amountCents,
    linkType,
    confidence: STAGE_CONFIDENCE[linkType],
  };
}
