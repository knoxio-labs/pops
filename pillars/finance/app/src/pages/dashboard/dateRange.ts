export interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * Formats a `Date`'s local calendar fields as `YYYY-MM-DD`. Deliberately
 * avoids `toISOString()`, which converts to UTC first and would shift the
 * date across the month boundary in any timezone ahead of or behind UTC.
 */
function toISODate(d: Date): string {
  const year = String(d.getFullYear()).padStart(4, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** First and last calendar day of `reference`'s month, as `YYYY-MM-DD`. */
export function getCurrentMonthRange(reference: Date = new Date()): DateRange {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  return {
    startDate: toISODate(new Date(year, month, 1)),
    endDate: toISODate(new Date(year, month + 1, 0)),
  };
}
