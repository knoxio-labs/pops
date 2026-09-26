/**
 * Time as the inventory pages say it: minutes for the last hour, the clock
 * for today, the weekday for this week, then the date. Everything is read
 * in UTC so a review screenshot says the same thing on every machine.
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function clock(date: Date): string {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function dayNumber(date: Date): number {
  return Math.floor(date.getTime() / DAY);
}

/** "Just now", "12 min ago", "10:42", "Yesterday 18:10", "Tue 19:45" or "20 Sept", as item pages date. */
export function formatWhen(iso: string, now: string): string {
  const at = new Date(iso);
  const reference = new Date(now);
  const elapsed = reference.getTime() - at.getTime();
  if (elapsed >= 0 && elapsed < MINUTE) return 'Just now';
  if (elapsed >= 0 && elapsed < 60 * MINUTE) return `${Math.floor(elapsed / MINUTE)} min ago`;
  const days = dayNumber(reference) - dayNumber(at);
  if (days === 0) return clock(at);
  if (days === 1) return `Yesterday ${clock(at)}`;
  if (days > 1 && days < 7) return `${WEEKDAYS[at.getUTCDay()] ?? ''} ${clock(at)}`;
  return DATE.format(at);
}
