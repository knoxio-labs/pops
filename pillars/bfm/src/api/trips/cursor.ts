import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { MobileTripsPage } from '../../contract/mobile-trips-detail-schemas.js';
import type { MobileTrip } from '../../contract/mobile-trips-schemas.js';

const CursorSchema = z.object({
  v: z.literal(1),
  offset: z.number().int().positive(),
  snapshot: z.string().regex(/^[a-f0-9]{64}$/u),
});
/** A continuation tied to the complete producer snapshot, so concurrent inserts cannot silently skip rows. */
export type TripsCursor = z.infer<typeof CursorSchema>;
/** Reject malformed cursors before an upstream request rather than silently restarting the list. */
export function decodeTripsCursor(encoded: string): TripsCursor | null {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = CursorSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
/** Pages an unpaginated source snapshot; a changed or out-of-range continuation requires an explicit restart. */
export function tripsPage(
  trips: MobileTrip[],
  limit: number,
  cursor: TripsCursor | null
): MobileTripsPage | null {
  if (!Number.isSafeInteger(limit) || limit < 1) return null;
  const snapshot = createHash('sha256').update(JSON.stringify(trips)).digest('hex');
  if (cursor !== null && (cursor.snapshot !== snapshot || cursor.offset >= trips.length))
    return null;
  const offset = cursor?.offset ?? 0;
  const items = trips.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  const nextCursor =
    nextOffset < trips.length
      ? Buffer.from(JSON.stringify({ v: 1, offset: nextOffset, snapshot }), 'utf8').toString(
          'base64url'
        )
      : null;
  return { items, nextCursor, totalCount: trips.length };
}
