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
import { matchCombined } from './combined.js';
import {
  candidatesFor,
  matchExact,
  matchLearnedRule,
  matchPartial,
  matchSplit,
  ruleCandidatesFor,
  type BlockingContext,
  type MatchOutcome,
} from './stages.js';

import type {
  ChargeForReview,
  ProposedLink,
  SolvableCharge,
  SolverInput,
  SolverOutput,
} from './types.js';

/**
 * Three phases, not one loop.
 *
 * Phases 1 and 3 are per-charge: they ask what settles *this* charge. Phase
 * 2 is the one that cannot be, because deciding that several charges
 * together settle one transaction means seeing them together.
 *
 * The order is evidence strength, and each boundary carries a reason:
 *
 * - **exact and split before combined** — a charge with its own exact match
 *   should take it rather than being swept into someone else's partition.
 * - **combined before partial** — partial is the weakest guess the ladder
 *   makes and it consumes a transaction, so running it first would let one
 *   speculative link eat the transaction a clean partition needed.
 * - **learned rules between the two** — a rule is a decision a human
 *   already made, so it outranks the ladder's weakest guess; and because
 *   partial CONSUMES a transaction, running partial first could claim the
 *   very transaction the rule was written about, silently disabling the
 *   correction. It sits after combined because a rule is weaker evidence
 *   than a partition that closes exactly: it widens which descriptors count
 *   for a merchant, and the arithmetic it then has to satisfy is stage 1's.
 */
export function solve(input: SolverInput): SolverOutput {
  const confirmedCharges = new Set(input.confirmed.map((link) => link.chargeId));
  const claimed = new Set(input.confirmed.map((link) => link.transactionUri));
  const blocking: BlockingContext = {
    defaultWindowDays: input.defaultWindowDays,
    rejected: rejectionsByCharge(input.rejected),
    rules: input.rules,
  };

  const charges = orderedCharges(input.charges).filter(
    (charge) => !confirmedCharges.has(charge.id)
  );

  const state: SolveState = {
    links: [],
    review: [],
    claimed,
    settled: new Set<string>(),
  };
  const deferred: SolvableCharge[] = [];

  for (const charge of charges) {
    const candidates = candidatesFor(charge, input.transactions, claimed, blocking);
    const outcome = matchExact(charge, candidates) ?? matchSplit(charge, candidates);

    if (outcome === null) {
      deferred.push(charge);
    } else {
      apply(state, charge, outcome, candidates.length);
    }
  }

  const combined = matchCombined(deferred, input.transactions, claimed, blocking);
  for (const link of combined.links) {
    state.links.push(link);
    state.claimed.add(link.transactionUri);
    state.settled.add(link.chargeId);
  }

  for (const charge of deferred) {
    if (state.settled.has(charge.id)) continue;
    settleByLearnedRule(state, charge, input, blocking);
  }

  for (const charge of deferred) {
    if (state.settled.has(charge.id)) continue;
    settlePartially(state, charge, input, blocking);
  }

  return { links: state.links, review: state.review };
}

/** Rejections indexed the way blocking asks for them: per charge. */
function rejectionsByCharge(
  rejected: readonly { chargeId: string; transactionUri: string }[]
): ReadonlyMap<string, ReadonlySet<string>> {
  const byCharge = new Map<string, Set<string>>();
  for (const pairing of rejected) {
    const uris = byCharge.get(pairing.chargeId) ?? new Set<string>();
    uris.add(pairing.transactionUri);
    byCharge.set(pairing.chargeId, uris);
  }
  return byCharge;
}

/** The accumulators every phase writes through. */
interface SolveState {
  readonly links: ProposedLink[];
  readonly review: ChargeForReview[];
  /** Transactions already spent, including those pinned by a human. */
  readonly claimed: Set<string>;
  /** Charges that reached an outcome, so later phases skip them. */
  readonly settled: Set<string>;
}

/**
 * Stage 4 for one charge: a merchant descriptor a human already accepted.
 *
 * Silence is the normal outcome and the important one. A charge whose rules
 * admit nothing at the right amount — a rule for a merchant that has since
 * changed its descriptor, one whose transaction is already spent — is left
 * exactly as this phase found it, so the ladder continues to partial and
 * review as though the rule were not there. A stale rule costs a link that
 * was never available; a stale rule allowed to bend the arithmetic would
 * cost the wrong link, silently reconciling money to the wrong order.
 *
 * Silence is not the only outcome, and the exception is worth stating
 * plainly: several rule-admitted candidates for exactly the charge amount
 * SETTLE it, into review as ambiguous, so it never reaches partial. That is
 * a charge the ladder would otherwise have part-paid from a smaller
 * transaction, and declining to is the point — see {@link matchLearnedRule}.
 */
function settleByLearnedRule(
  state: SolveState,
  charge: SolvableCharge,
  input: SolverInput,
  blocking: BlockingContext
): void {
  const candidates = ruleCandidatesFor(charge, input.transactions, state.claimed, blocking);
  const outcome = matchLearnedRule(charge, candidates);
  if (outcome === null) return;
  apply(state, charge, outcome, candidates.length);
}

/** Phase 3 for one charge: partial payment, or the review queue. */
function settlePartially(
  state: SolveState,
  charge: SolvableCharge,
  input: SolverInput,
  blocking: BlockingContext
): void {
  const candidates = candidatesFor(charge, input.transactions, state.claimed, blocking);
  const outcome = matchPartial(charge, candidates) ?? {
    kind: 'review' as const,
    reason: candidates.length === 0 ? ('no-candidate' as const) : ('ambiguous' as const),
  };
  apply(state, charge, outcome, candidates.length);
}

/** Record one charge's outcome — a set of links, or a place in the queue. */
function apply(
  state: SolveState,
  charge: SolvableCharge,
  outcome: MatchOutcome,
  candidateCount: number
): void {
  if (outcome.kind === 'linked') {
    for (const link of outcome.links) {
      state.links.push(link);
      state.claimed.add(link.transactionUri);
    }
  } else {
    state.review.push({
      chargeId: charge.id,
      purchaseId: charge.purchaseId,
      reason: outcome.reason,
      candidateCount,
    });
  }
  state.settled.add(charge.id);
}

/**
 * Deterministic processing order.
 *
 * Keyed on the source document — order date, then the charge's `position`
 * within its order, then amount. Ids are random UUIDs and a re-ingest
 * re-mints them, so ordering primarily by id would let the solver reach a
 * different answer from the same source document; `position` exists
 * precisely to give this a stable key (ADR-042).
 *
 * The id remains only as the last tiebreak, to guarantee a total order when
 * two charges are otherwise indistinguishable. Two such charges are
 * interchangeable by construction, so which one is processed first cannot
 * change the outcome.
 */
function orderedCharges(charges: readonly SolvableCharge[]): readonly SolvableCharge[] {
  return [...charges].toSorted(
    (a, b) =>
      a.orderedAt.localeCompare(b.orderedAt) ||
      a.position - b.position ||
      a.amountCents - b.amountCents ||
      a.id.localeCompare(b.id)
  );
}
