import { validDate } from '../visit/periods';

/** Count checkout-exclusive calendar nights between two valid ISO dates. */
export function calendarDaysBetween(start: string, end: string): number {
  if (!validDate(start) || !validDate(end)) return 0;
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const endTime = Date.parse(`${end}T00:00:00Z`);
  return Math.max(0, (endTime - startTime) / 86_400_000);
}
