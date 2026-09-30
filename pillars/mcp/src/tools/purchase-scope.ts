/** The purchase order statuses accepted by the purchases pillar contract. */
export const PURCHASE_STATUSES = [
  'awaiting_settlement',
  'linked',
  'partial',
  'settled_cash',
  'ignored',
] as const;

/** JSON Schema fields shared by tools that filter purchase orders by scope. */
export const PURCHASE_SCOPE_PROPERTIES = {
  sources: {
    type: 'array',
    items: { type: 'string' },
    description: 'Filter by ingest source id (e.g. "amazon", "woolworths")',
  },
  statuses: {
    type: 'array',
    items: { type: 'string', enum: PURCHASE_STATUSES },
    description: 'Filter by settlement status',
  },
  from: {
    type: 'string',
    format: 'date-time',
    description:
      'Earliest order date, inclusive (ISO-8601 timestamp with a timezone, e.g. 2026-02-02T01:41:21Z)',
  },
  to: {
    type: 'string',
    format: 'date-time',
    description:
      'Latest order date, inclusive (ISO-8601 timestamp with a timezone, e.g. 2026-02-02T01:41:21Z)',
  },
} as const;

const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

const SCOPE_DATE_FIELDS = ['from', 'to'] as const;

function isValidTimestamp(value: string): boolean {
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (match === null) return false;

  const [, year, month, day, hour, minute, second] = match;
  const parsed = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
  );

  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() === Number(month) - 1 &&
    parsed.getUTCDate() === Number(day) &&
    parsed.getUTCHours() === Number(hour) &&
    parsed.getUTCMinutes() === Number(minute) &&
    parsed.getUTCSeconds() === Number(second)
  );
}

/**
 * Return a field-specific error when an order scope date is not a timestamp
 * with a timezone, so callers can correct it before the purchases contract
 * rejects the request with a generic schema error.
 */
export function purchaseScopeDateError(args: Record<string, unknown>): string | undefined {
  for (const field of SCOPE_DATE_FIELDS) {
    const value = args[field];
    if (typeof value !== 'string' || isValidTimestamp(value)) continue;

    return (
      `Invalid field '${field}': expected an ISO-8601 timestamp with a timezone, ` +
      'e.g. 2026-02-02T01:41:21Z.'
    );
  }

  return undefined;
}
