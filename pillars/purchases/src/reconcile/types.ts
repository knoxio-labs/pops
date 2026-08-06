/**
 * The solver's vocabulary.
 *
 * Everything here is plain data. The solver takes a snapshot of the world
 * and returns what it *would* write; nothing in this directory touches the
 * database, calls finance, or reads a clock. That is what makes the
 * arithmetic testable against adversarial cases and what makes
 * re-derivation safe: the same snapshot always produces the same output.
 */
import type { LinkType, SettlementRole } from '../contract/constants.js';

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
 * A learned rule, mirroring finance's `transaction_corrections`. Stage 4:
 * consulted only after the arithmetic stages find nothing, so a rule can
 * rescue a miss but never overrule an exact match.
 */
export interface MatchRule {
  readonly id: string;
  readonly purchaseId: string;
  readonly transactionUri: string;
  readonly confidence: number;
}

export interface SolverInput {
  readonly charges: readonly SolvableCharge[];
  readonly transactions: readonly SolvableTransaction[];
  readonly confirmed: readonly ConfirmedLink[];
  readonly rules: readonly MatchRule[];
  /** Default settlement window when a source states none. */
  readonly defaultWindowDays: number;
}

/** A link the solver proposes writing. */
export interface ProposedLink {
  readonly chargeId: string;
  readonly transactionUri: string;
  /** The portion of the transaction attributed to this charge. */
  readonly amountCents: number;
  readonly linkType: LinkType;
  readonly confidence: number;
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
  split: 0.9,
  combined: 0.85,
  partial: 0.6,
  rule: 0.8,
  /** Only ever written by a human action, never proposed by the solver. */
  manual: 1,
};
