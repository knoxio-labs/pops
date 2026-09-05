import { toISODate } from '../../lib/local-date';

export interface DateRange {
  startDate: string;
  endDate: string;
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
