/**
 * The solver's vocabulary.
 *
 * Everything here is plain data. The solver takes a snapshot of the world
 * and returns what it *would* write; nothing in this directory touches the
 * database, calls finance, or reads a clock. That is what makes the
 * arithmetic testable against adversarial cases and what makes
 * re-derivation safe: the same snapshot always produces the same output.
 */
import type { LinkType, MatchType, SettlementRole } from '../contract/constants.js';

/**
 * A charge presented for matching.
 *
 * Charges, not orders, are what the solver matches. An order whose merchant
 * states three charges presents three amounts rather than one total, which
 * is both easier and more accurate. An order whose source states none — the
 * Amazon export states none at all — is presented as a single `derived`
 * charge for its total, minted by the caller from the order (ADR-042).
 */
export interface SolvableCharge {
  readonly id: string;
  readonly purchaseId: string;
  /**
   * The parent order's `purchases.source`.
   *
   * Carried for stage 4 alone: a learned rule is scoped to the source it
   * was decided for, so matching a rule against a charge means knowing
   * which merchant the charge came from. Blocking reads
   * {@link descriptorPattern}, which is the source's registered pattern
   * rather than its identity.
   */
  readonly source: string;
  /**
   * `purchase_charges.position` — the charge's place in its source
   * document.
   *
   * This is the stable ordering key, and the reason the column exists at
   * all (ADR-042). Ids are random UUIDs and every row of one ingest shares
   * a `createdAt` to the second, so neither can order charges reproducibly;
   * worse, a re-ingest re-mints the UUIDs, so an id-ordered solver could
   * reach a different answer from the same source document.
   */
  readonly position: number;
  /** Signed, integer cents, in the settlement currency. */
  readonly amountCents: number;
  readonly role: SettlementRole;
  /** The parent order's `orderedAt`, which anchors the settlement window. */
  readonly orderedAt: string;
  /**
   * Descriptor pattern from the order's `purchase_sources` row, for stage-0
   * blocking. Null when the source declares none, which blocks nothing.
   */
  readonly descriptorPattern: string | null;
  /** Per-source window override; falls back to the caller's default. */
  readonly settlementWindowDays: number | null;
}

/** A transaction the solver may link to, already in integer cents. */
export interface SolvableTransaction {
  readonly uri: string;
  readonly description: string;
  /** Signed, integer cents. */
  readonly amountCents: number;
  /** Date-only `YYYY-MM-DD`. */
  readonly date: string;
}

/**
 * A link a human accepted. Pinned: never revised, and it removes both its
 * charge and its transaction from the solvable set, acting as a fixed
 * constraint on everything else (ADR-042).
 */
export interface ConfirmedLink {
  readonly chargeId: string;
  readonly transactionUri: string;
}

/**
 * A pairing a human ruled out. The mirror image of {@link ConfirmedLink}:
 * one pins a charge to a transaction, the other keeps them apart.
 *
 * It removes the transaction from THIS charge's candidates and from
 * nothing else's. A rejection says the engine paired the wrong two things,
 * not that the transaction is spent — leaving it available is what lets the
 * charge it does belong to claim it on the same sweep.
 */
export interface RejectedPairing {
  readonly chargeId: string;
  readonly transactionUri: string;
}

/**
 * A `purchase_match_rules` row as the solver sees it.
 *
 * **A descriptor pattern, not a pointer from an order to the transaction
 * that settled it.** The queue writes one when a human confirms a link,
 * keyed on the accepted transaction's normalised descriptor and scoped to
 * the order's source — so what it remembers is which descriptors belong to
 * a merchant, which is the only form of an answer that can still be useful
 * for an order nobody has imported yet.
 *
 * `isActive` and `confidence` are carried rather than being left to the
 * reader's WHERE clause. The solver is a pure function of this input, so a
 * caller that forgot the filter would otherwise change the answer silently;
 * with them here the same snapshot always produces the same links.
 */
export interface SolvableRule {
  readonly id: string;
  /** Already normalised by `matchPatternFor` when the rule was written. */
  readonly descriptionPattern: string;
  readonly matchType: MatchType;
  /** The source the rule was decided for. Null applies it everywhere. */
  readonly source: string | null;
  readonly isActive: boolean;
  readonly confidence: number;
  /** Selection order when several rules match. Lower wins. */
  readonly priority: number;
}

export interface SolverInput {
  readonly charges: readonly SolvableCharge[];
  readonly transactions: readonly SolvableTransaction[];
  readonly confirmed: readonly ConfirmedLink[];
  /**
   * Descriptor patterns learned from confirmed links, for stage 4.
   *
   * Every one of them is a decision a human already made about a merchant,
   * which is why the stage exists at all — but a rule names a merchant,
   * never a transaction, so it can only widen which descriptors are
   * considered. It never licenses an amount the arithmetic rejects.
   */
  readonly rules: readonly SolvableRule[];
  /**
   * Pairings a human ruled out, which the ladder must not propose again.
   * Without them a reject is a button that the next sweep silently undoes.
   */
  readonly rejected: readonly RejectedPairing[];
  /** Default settlement window when a source states none. */
  readonly defaultWindowDays: number;
}

/** A link the solver proposes writing. */
export interface ProposedLink {
  readonly chargeId: string;
  readonly transactionUri: string;
  /**
   * The transaction's descriptor as it read on this sweep.
   *
   * Carried so the decision the link is eventually given can be turned into
   * a `purchase_match_rules` row, whose key is a descriptor pattern. The
   * solver never matches on it — blocking reads the SOURCE's pattern, and a
   * rule that scored its own evidence would be a matcher grading itself.
   */
  readonly transactionDescription: string;
  /** The portion of the transaction attributed to this charge. */
  readonly amountCents: number;
  readonly linkType: LinkType;
  readonly confidence: number;
  /**
   * The learned rule that admitted this transaction, or null when the
   * ladder reached it on the source's own descriptor pattern.
   *
   * Written through to `purchase_charge_links.match_rule_id`, which is what
   * lets a link be explained by naming the rule behind it rather than
   * asserting one exists.
   */
  readonly matchRuleId: string | null;
}

/**
 * Why a charge was not linked. Never a silent absence: an unmatched charge
 * is a normal state, but the reason it went unmatched is what the review
 * queue renders and what makes a wrong answer diagnosable.
 */
export type ReviewReason =
  /** Several candidates fit equally well. Ambiguity routes here rather than guessing. */
  | 'ambiguous'
  /** The window holds more candidates than can be searched honestly. */
  | 'too-many-candidates'
  /** Nothing in the window comes close. */
  | 'no-candidate'
  /** A partial payment was detected but more than one transaction could be it. */
  | 'ambiguous-partial';

export interface ChargeForReview {
  readonly chargeId: string;
  readonly purchaseId: string;
  readonly reason: ReviewReason;
  /** How many candidates were in scope, so the queue can show the near-misses. */
  readonly candidateCount: number;
}

export interface SolverOutput {
  readonly links: readonly ProposedLink[];
  readonly review: readonly ChargeForReview[];
}

/**
 * Confidence attached to each ladder stage.
 *
 * Ordered, not arbitrary: an exact amount inside the window is the
 * strongest evidence available, a partition is weaker because more than one
 * could have existed, and a partial payment is weakest because the residual
 * is unexplained by construction. The review queue sorts on this, so the
 * ordering is the product behaviour, not decoration.
 */
export const STAGE_CONFIDENCE: Readonly<Record<LinkType, number>> = {
  exact: 0.99,
  /**
   * `split` and `combined` share a value because they are the same
   * exhaustive search with the two sides exchanged, and carry the same
   * ambiguity profile. Scoring them differently would sort the review queue
   * by which direction the partition happened to run, which is a property
   * of the merchant's billing rather than of how good the evidence is.
   */
  split: 0.9,
  combined: 0.9,
  partial: 0.6,
  /**
   * The ceiling a stage-4 link may reach, not the value it takes: a rule
   * carries its own confidence, inherited from the link that taught it, and
   * the lower of the two wins. A rule learned from a part-payment is
   * weaker evidence than one learned from an exact match.
   *
   * Below `exact` and below a partition, because the amount agreeing is the
   * same arithmetic either way — what is weaker here is the descriptor,
   * admitted by a learned association rather than by the source's own
   * registered pattern.
   */
  rule: 0.8,
  /** Only ever written by a human action, never proposed by the solver. */
  manual: 1,
};
