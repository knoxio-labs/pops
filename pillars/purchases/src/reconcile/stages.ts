/**
 * The per-charge ladder stages, and the blocking that feeds them.
 *
 * Each stage answers one question about one charge: is there a single
 * transaction for exactly this amount, a set of them that sums to it, or a
 * smaller one that partly paid it. `solve.ts` decides the order they run in
 * and what happens between them.
 */
import { descriptorMatcherFor, type DescriptorMatcher } from './descriptor.js';
import { ruleMatcherFor } from './rules.js';
import { findSubsetSummingTo, MIN_SPLIT_SIZE } from './subset-sum.js';
import {
  STAGE_CONFIDENCE,
  type ChargeForReview,
  type ProposedLink,
  type SolvableCharge,
  type SolvableRule,
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
  /**
   * Learned descriptor patterns, for stage 4.
   *
   * Here rather than passed alongside because a rule decides the same
   * question the source's `descriptorPattern` does — which descriptors
   * count as this merchant's — and only stage 4 reads them.
   */
  readonly rules: readonly SolvableRule[];
}

/** Leaves the descriptor to stage 4's rules, which decide it per candidate. */
const ANY_DESCRIPTOR: DescriptorMatcher = () => true;

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
 * from the data. They belong at this stage because blocking is the only
 * place a candidate can leave without the ladder forming an opinion about
 * the PAIRING: the transaction is not linked and not claimed, so it stays
 * available to the charge that actually settles it. The charge still
 * reaches an outcome of its own — with nothing else in range it reports
 * `no-candidate`, which is the honest reading of a window whose only
 * candidate the operator has ruled out.
 */
export function eligibilityFor(
  charge: SolvableCharge,
  blocking: BlockingContext
): (transaction: SolvableTransaction) => boolean {
  return eligibilityWith(charge, blocking, descriptorMatcherFor(charge.descriptorPattern));
}

/**
 * {@link eligibilityFor} with the descriptor test supplied.
 *
 * Every other test blocking makes — window, sign, non-zero, rejected — is
 * a fact about the charge and the transaction, and holds whatever admitted
 * the descriptor. Stage 4 swaps that one test and nothing else, which is
 * both what makes it a widening of blocking rather than a second ladder,
 * and what stops a learned rule from ever reaching past a rejection or
 * outside a window.
 */
function eligibilityWith(
  charge: SolvableCharge,
  blocking: BlockingContext,
  matchesDescriptor: DescriptorMatcher
): (transaction: SolvableTransaction) => boolean {
  if (charge.amountCents === 0) return () => false;

  const window = settlementWindowFor(
    charge.orderedAt,
    charge.settlementWindowDays ?? blocking.defaultWindowDays
  );
  if (window === null) return () => false;

  const wantPositive = charge.amountCents > 0;
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

/** A candidate stage 4 admitted, and the rule that admitted it. */
export interface RuleCandidate {
  readonly transaction: SolvableTransaction;
  readonly rule: SolvableRule;
}

/**
 * Stage 4's candidate pool: everything blocking would accept if the
 * source's registered pattern were replaced by the merchant descriptors a
 * human has already accepted for it.
 *
 * A source declares ONE `descriptorPattern`, registered by hand, and a
 * merchant bills under several — so a pattern that is right for most of an
 * account's charges silently blocks the rest, every night, forever. That is
 * the miss this rescues, and it is the only thing a descriptor-pattern rule
 * can rescue: the rule names the merchant, so the ladder still has to find
 * the transaction itself.
 *
 * Every other blocking test still applies, including the rejection set —
 * see {@link eligibilityWith}.
 */
export function ruleCandidatesFor(
  charge: SolvableCharge,
  transactions: readonly SolvableTransaction[],
  claimed: ReadonlySet<string>,
  blocking: BlockingContext
): readonly RuleCandidate[] {
  const ruleFor = ruleMatcherFor(charge, blocking.rules);
  const inScope = eligibilityWith(charge, blocking, ANY_DESCRIPTOR);

  return orderedTransactions(
    transactions.filter((transaction) => !claimed.has(transaction.uri) && inScope(transaction))
  ).flatMap((transaction) => {
    const rule = ruleFor(transaction.description);
    return rule === null ? [] : [{ transaction, rule }];
  });
}

/**
 * Stage 4 — a single rule-admitted transaction for exactly the charge
 * amount.
 *
 * **The amount test is stage 1's, unchanged.** A rule moves the descriptor
 * boundary and nothing else: it never licenses a near-miss amount, and it
 * runs no subset-sum of its own. Both were considered and both are the same
 * mistake — a learned descriptor is a claim about a merchant, and treating
 * it as evidence about an amount would let a stale rule reconcile money to
 * the wrong order, which is strictly worse than leaving the order in the
 * queue. A rule whose merchant has nothing at the right amount in the
 * window therefore contributes no candidate and the charge falls through to
 * partial and review exactly as it did before the rule existed.
 *
 * Two rule-admitted candidates at the charge amount go to review for the
 * same reason stage 1's do: a human accepted this merchant, not this
 * transaction, so the rule cannot break the tie it just created.
 */
export function matchLearnedRule(
  charge: SolvableCharge,
  candidates: readonly RuleCandidate[]
): MatchOutcome | null {
  const hits = candidates.filter(
    (candidate) => candidate.transaction.amountCents === charge.amountCents
  );
  if (hits.length === 0) return null;
  if (hits.length > 1) return { kind: 'review', reason: 'ambiguous' };

  const [only] = hits;
  if (only === undefined) return null;
  return {
    kind: 'linked',
    links: [
      {
        ...linkOf(charge, only.transaction, only.transaction.amountCents, 'rule'),
        // The rule's own confidence, inherited from the link that taught
        // it, capped by the stage. A rule learned from a part-payment is
        // weaker evidence than one learned from an exact match, and the
        // queue sorts on this.
        confidence: Math.min(only.rule.confidence, STAGE_CONFIDENCE.rule),
        matchRuleId: only.rule.id,
      },
    ],
  };
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
    matchRuleId: null,
  };
}
