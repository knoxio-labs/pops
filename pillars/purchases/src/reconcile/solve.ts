/**
 * The reconciliation ladder: a pure function from a snapshot to proposals.
 *
 * > Auto-links are a pure function of (charges, transactions, confirmed
 * > links, rules) scoped to a source and date window.
 *
 * That invariant is the reason this file has no I/O, no clock and no
 * randomness. Links are re-derived from scratch on every sweep rather than
 * patched, so identical inputs must produce identical output — otherwise a
 * sweep could unlink and relink the same order forever.
 *
 * Deterministic first, AI never. Matching is arithmetic, and a model asked
 * to partition a set of amounts will produce a plausible partition that is
 * wrong (ADR-042).
 */
import { findSubsetSummingTo, MIN_SPLIT_SIZE } from './subset-sum.js';
import {
  STAGE_CONFIDENCE,
  type ChargeForReview,
  type ProposedLink,
  type SolvableCharge,
  type SolvableTransaction,
  type SolverInput,
  type SolverOutput,
} from './types.js';
import { isWithinWindow, settlementWindowFor } from './window.js';

export function solve(input: SolverInput): SolverOutput {
  const links: ProposedLink[] = [];
  const review: ChargeForReview[] = [];

  const confirmedCharges = new Set(input.confirmed.map((link) => link.chargeId));
  const claimed = new Set(input.confirmed.map((link) => link.transactionUri));

  for (const charge of orderedCharges(input.charges)) {
    if (confirmedCharges.has(charge.id)) continue;

    const candidates = candidatesFor(charge, input, claimed);
    const outcome = matchCharge(charge, candidates, input);

    if (outcome.kind === 'linked') {
      for (const link of outcome.links) {
        links.push(link);
        claimed.add(link.transactionUri);
      }
    } else {
      review.push({
        chargeId: charge.id,
        purchaseId: charge.purchaseId,
        reason: outcome.reason,
        candidateCount: candidates.length,
      });
    }
  }

  return { links, review };
}

/**
 * Deterministic processing order.
 *
 * Row ids are random UUIDs written within the same second, so neither id
 * nor creation time is stable. Ordering by the order's date, then the
 * amount, then the id gives a total order that depends only on the data —
 * which is what makes two runs over the same snapshot agree.
 */
function orderedCharges(charges: readonly SolvableCharge[]): readonly SolvableCharge[] {
  return [...charges].toSorted(
    (a, b) =>
      a.orderedAt.localeCompare(b.orderedAt) ||
      a.amountCents - b.amountCents ||
      a.id.localeCompare(b.id)
  );
}

/** Same reasoning as {@link orderedCharges}, for the candidate side. */
function orderedTransactions(
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
function candidatesFor(
  charge: SolvableCharge,
  input: SolverInput,
  claimed: ReadonlySet<string>
): readonly SolvableTransaction[] {
  const window = settlementWindowFor(
    charge.orderedAt,
    charge.settlementWindowDays ?? input.defaultWindowDays
  );
  if (window === null) return [];

  const pattern = charge.descriptorPattern?.toLowerCase();
  const wantPositive = charge.amountCents > 0;

  return orderedTransactions(
    input.transactions.filter((transaction) => {
      if (claimed.has(transaction.uri)) return false;
      if (!isWithinWindow(transaction.date, window)) return false;
      if (transaction.amountCents === 0) return false;
      if (transaction.amountCents > 0 !== wantPositive) return false;
      if (pattern !== undefined && !transaction.description.toLowerCase().includes(pattern)) {
        return false;
      }
      return true;
    })
  );
}

type MatchOutcome =
  | { kind: 'linked'; links: readonly ProposedLink[] }
  | { kind: 'review'; reason: ChargeForReview['reason'] };

/**
 * Walk the ladder for one charge. Each stage is tried only when the
 * stronger ones above it found nothing, so a rule can rescue a miss but
 * never overrule an exact amount.
 *
 * **Rules are consulted before partial-payment detection, which inverts the
 * order ADR-042 states.** The ADR lists partial at stage 3 and learned
 * rules at stage 4; this is a deliberate deviation, for one reason: a rule
 * is a decision a human already made about this order, while a partial
 * match is the weakest guess the ladder makes and it *consumes* a
 * transaction. Running partial first lets a speculative link claim the very
 * transaction a rule was written to point at, and the rule then finds
 * nothing left to match — so the user's correction silently stops working.
 * Every other stage keeps its ADR order.
 */
function matchCharge(
  charge: SolvableCharge,
  candidates: readonly SolvableTransaction[],
  input: SolverInput
): MatchOutcome {
  const exact = matchExact(charge, candidates);
  if (exact !== null) return exact;

  const split = matchSplit(charge, candidates);
  if (split !== null) return split;

  const rule = matchRule(charge, candidates, input);
  if (rule !== null) return rule;

  const partial = matchPartial(charge, candidates);
  if (partial !== null) return partial;

  return { kind: 'review', reason: candidates.length === 0 ? 'no-candidate' : 'ambiguous' };
}

/** Stage 1 — a single transaction for exactly the charge amount. */
function matchExact(
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
  return {
    kind: 'linked',
    links: [linkOf(charge, only, only.amountCents, 'exact')],
  };
}

/**
 * Stage 2 — subset-sum. A charge settled by several transactions, which is
 * what a multi-shipment order looks like on a statement.
 *
 * The combined case (several charges, one transaction) is the same search
 * with the sides exchanged and arrives with the sweep that can see all of
 * an order's charges at once; this slice covers the split direction.
 */
function matchSplit(
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

/** Stage 4 — a learned rule, honoured only if its transaction is still free. */
function matchRule(
  charge: SolvableCharge,
  candidates: readonly SolvableTransaction[],
  input: SolverInput
): MatchOutcome | null {
  const rule = input.rules.find((candidate) => candidate.purchaseId === charge.purchaseId);
  if (rule === undefined) return null;

  const transaction = candidates.find((t) => t.uri === rule.transactionUri);
  if (transaction === undefined) return null;

  return {
    kind: 'linked',
    links: [
      {
        chargeId: charge.id,
        transactionUri: transaction.uri,
        amountCents: transaction.amountCents,
        linkType: 'rule',
        confidence: rule.confidence,
      },
    ],
  };
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
function matchPartial(
  charge: SolvableCharge,
  candidates: readonly SolvableTransaction[]
): MatchOutcome | null {
  const smaller = candidates.filter((t) => Math.abs(t.amountCents) < Math.abs(charge.amountCents));
  if (smaller.length === 0) return null;
  if (smaller.length > 1) return { kind: 'review', reason: 'ambiguous-partial' };

  const [only] = smaller;
  if (only === undefined) return null;
  return {
    kind: 'linked',
    links: [linkOf(charge, only, only.amountCents, 'partial')],
  };
}

function linkOf(
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
