/**
 * The words the purchases contract uses at more than one grain, in one place.
 *
 * The pillar has a single accounting schema and a single link vocabulary, and
 * they mean the same thing on an order as on a merchant roll-up. Typing them
 * once per screen is how two surfaces come to disagree about what the same
 * figure is called.
 */

/**
 * How a proposed or confirmed link between a charge and a transaction was
 * derived.
 */
export type LinkType = 'exact' | 'split' | 'combined' | 'partial' | 'rule' | 'manual';

/** Where an order stands against the money that settles it. */
export type PurchaseStatus =
  | 'awaiting_settlement'
  | 'linked'
  | 'partial'
  | 'settled_cash'
  | 'ignored';

/**
 * What is accounted for, at whatever grain it is rolled up to.
 *
 * `matched + awaiting + residual === total`, and the residual is the figure
 * that must never drift: it comes from the server and everything else is read
 * against it, never the other way round.
 */
export interface PurchaseAccounting {
  totalCents: number;
  matchedCents: number;
  awaitingImportCents: number;
  refundedCents: number;
  residualCents: number;
  netSpendCents: number;
}
