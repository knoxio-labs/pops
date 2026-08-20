/**
 * Where an order sits in time, for the folds that decide which of a group's
 * orders is its newest or its oldest.
 *
 * `purchases.ordered_at` now holds one spelling of an instant, so ranking
 * the raw string would in fact agree with ranking the instant — for every
 * row the current writer wrote. The rows it did not are why this parses
 * anyway: a value the canonicalising migration could not read was left as it
 * was, and a fold reading that as text would place it wherever its first
 * character happened to fall.
 *
 * One helper rather than one per fold. The product leaderboard and the
 * merchant roll-up both answer "which order came later", and two
 * implementations of that would agree only by inspection — the first
 * correction to either would leave the other behind.
 */

/** An order's position in time, with a deterministic tie-break. */
export interface OrderRank {
  /** Epoch milliseconds. NaN where the stored timestamp does not parse. */
  readonly instant: number;
  /**
   * Separates two orders on the same instant, so which one a fold calls
   * later does not depend on the order the query returned rows in.
   */
  readonly tieBreaker: string;
}

export function orderRank(orderedAt: string, tieBreaker: string): OrderRank {
  return { instant: Date.parse(orderedAt), tieBreaker };
}

/** Whether the stored timestamp behind this rank parsed to an instant. */
export function hasInstant(rank: OrderRank): boolean {
  return Number.isFinite(rank.instant);
}

/**
 * Whether `candidate` happened after `incumbent`.
 *
 * An unparseable timestamp loses this comparison and {@link isOlder} both,
 * so such an order becomes neither end of a group while any order with a
 * readable instant is present. Sorting it last instead would hand it the
 * newest end outright, and sorting it first the oldest; it belongs at
 * neither, because nothing is known about where it belongs. A group whose
 * every order is unparseable keeps whichever line opened it, which is the
 * only answer left.
 */
export function isNewer(candidate: OrderRank, incumbent: OrderRank): boolean {
  if (!hasInstant(candidate)) return false;
  if (!hasInstant(incumbent)) return true;
  if (candidate.instant !== incumbent.instant) return candidate.instant > incumbent.instant;
  return candidate.tieBreaker > incumbent.tieBreaker;
}

/** Whether `candidate` happened before `incumbent`. The mirror of {@link isNewer}. */
export function isOlder(candidate: OrderRank, incumbent: OrderRank): boolean {
  if (!hasInstant(candidate)) return false;
  if (!hasInstant(incumbent)) return true;
  if (candidate.instant !== incumbent.instant) return candidate.instant < incumbent.instant;
  return candidate.tieBreaker < incumbent.tieBreaker;
}
