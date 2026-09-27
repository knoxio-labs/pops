const PURCHASE_DAY = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

/** Formats a purchase instant as an en-AU calendar date in UTC. */
export function purchaseDateText(date: string): string {
  return PURCHASE_DAY.format(new Date(date));
}
