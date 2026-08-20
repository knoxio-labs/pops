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
 * One helper rather than one per fold. The product leaderboard, the
 * merchant roll-up, the dictionary's printed name and search's recency
 * ordering all answer "which order came later", and five implementations of
 * that would agree only by inspection — the first correction to any of them
 * would leave the rest behind.
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

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * Newest first, for a sort rather than a fold.
 *
 * A comparator cannot borrow {@link isNewer}: that answers false both ways
 * for an unreadable timestamp, which is the right answer for "is this one
 * the newest" and no answer at all for a sort, so such a row would land
 * wherever the scan left it. Here it sorts last — after every order whose
 * instant is known, and among its own kind by the tie-break — so the one
 * row nothing is known about cannot take the top of a list ordered by
 * recency.
 */
export function byNewestFirst(a: OrderRank, b: OrderRank): number {
  if (hasInstant(a) !== hasInstant(b)) return hasInstant(a) ? -1 : 1;
  if (hasInstant(a) && a.instant !== b.instant) return b.instant - a.instant;
  return compareText(a.tieBreaker, b.tieBreaker);
}
