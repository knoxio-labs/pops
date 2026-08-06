/**
 * The settlement window: which transaction dates may settle which order.
 *
 * Stage 0 of the ladder, and the place two different notions of "date"
 * meet. `purchases.orderedAt` is a full ISO instant; a finance transaction
 * carries a date-only `YYYY-MM-DD`. Comparing them needs an explicit rule,
 * because the obvious implementations disagree at the edges by a day — and
 * a day is a meaningful fraction of a 14–21 day window.
 *
 * **The rule: compare calendar dates in UTC, inclusive at both ends.**
 *
 * An order placed at `2026-03-04T23:40:00Z` is on `2026-03-04`, and with a
 * 21-day window a transaction dated anywhere from `2026-02-11` to
 * `2026-03-25` is in scope. Truncating to the UTC date rather than a local
 * one keeps the boundary stable regardless of where the process runs, which
 * matters because a container's timezone is not a property of the purchase.
 *
 * The window is deliberately narrow. Import lag is absorbed by perpetual
 * retry, not by widening it — a wider window trades precision away to solve
 * a problem retry already solves (ADR-042).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A `YYYY-MM-DD` date-only string, as finance publishes. */
export type CalendarDate = string;

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * The UTC calendar date of an ISO instant. Returns null for a value that
 * does not parse, so a malformed `orderedAt` produces no window rather than
 * a window around the epoch.
 */
export function calendarDateOf(isoInstant: string): CalendarDate | null {
  const parsed = new Date(isoInstant);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export interface SettlementWindow {
  /** Inclusive lower bound, `YYYY-MM-DD`. */
  readonly startDate: CalendarDate;
  /** Inclusive upper bound, `YYYY-MM-DD`. */
  readonly endDate: CalendarDate;
}

/**
 * The window around an order, `windowDays` either side of its UTC date.
 *
 * Symmetric on purpose: a card is charged after the order as a rule, but a
 * pre-authorisation lands before it, and a receipt captured at the till can
 * be dated a day ahead of the statement entry that settles it.
 */
export function settlementWindowFor(
  orderedAt: string,
  windowDays: number
): SettlementWindow | null {
  const anchor = calendarDateOf(orderedAt);
  if (anchor === null) return null;

  const anchorMs = Date.parse(`${anchor}T00:00:00Z`);
  const offset = Math.max(windowDays, 0) * MS_PER_DAY;

  return {
    startDate: new Date(anchorMs - offset).toISOString().slice(0, 10),
    endDate: new Date(anchorMs + offset).toISOString().slice(0, 10),
  };
}

/**
 * Whether a transaction's date falls inside the window.
 *
 * Both bounds are inclusive, and the comparison is lexicographic — which is
 * exact for `YYYY-MM-DD` and avoids re-parsing a date the producer already
 * validated. A value that is not date-only is rejected rather than coerced:
 * `'2026-03-04T00:00:00Z'` sorts after `'2026-03-04'` and would silently
 * fall outside a window ending on its own day.
 */
export function isWithinWindow(date: string, window: SettlementWindow): boolean {
  if (!CALENDAR_DATE_RE.test(date)) return false;
  return date >= window.startDate && date <= window.endDate;
}

/**
 * The union of several windows, for one query covering many orders.
 *
 * A sweep pulls candidates once for a batch rather than per order, so the
 * fetch spans the outermost bounds; each order still applies its own window
 * afterwards via {@link isWithinWindow}. Returns null for an empty batch —
 * there is nothing to ask finance for.
 */
export function unionOfWindows(windows: readonly SettlementWindow[]): SettlementWindow | null {
  const [first, ...rest] = windows;
  if (first === undefined) return null;

  let { startDate, endDate } = first;
  for (const window of rest) {
    if (window.startDate < startDate) startDate = window.startDate;
    if (window.endDate > endDate) endDate = window.endDate;
  }
  return { startDate, endDate };
}
