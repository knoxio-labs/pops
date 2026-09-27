const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function clock(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

function dayNumber(date: Date): number {
  return Math.floor(date.getTime() / DAY);
}

/** Formats an event timestamp consistently in UTC for compact Activity rows. */
export function formatWhen(iso: string, now: string): string {
  const at = new Date(iso);
  const reference = new Date(now);
  if (Number.isNaN(at.getTime()) || Number.isNaN(reference.getTime())) return iso;
  const elapsed = reference.getTime() - at.getTime();
  if (elapsed >= 0 && elapsed < MINUTE) return 'Just now';
  if (elapsed >= 0 && elapsed < 60 * MINUTE) return `${Math.floor(elapsed / MINUTE)} min ago`;
  const days = dayNumber(reference) - dayNumber(at);
  if (days === 0) return clock(at);
  if (days === 1) return `Yesterday ${clock(at)}`;
  if (days > 1 && days < 7) return `${WEEKDAYS[at.getUTCDay()] ?? ''} ${clock(at)}`;
  return DATE.format(at);
}
