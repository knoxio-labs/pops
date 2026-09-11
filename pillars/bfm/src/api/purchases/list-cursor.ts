/**
 * The opaque page cursor the mobile purchases list hands out.
 *
 * It carries a keyset anchor — the `(orderedAt, id)` of the last row served —
 * the same shape the finance leg's cursor beside this one carries, and for
 * the same reason: an anchor names a position in the data rather than a
 * distance from the start of a result set that can move underneath a scroll.
 * `purchases`' `GET /purchases` grew `beforeOrderedAt`/`beforeId` for this
 * (POPS-2476), so this leg no longer has to compromise on an offset — an
 * order landing at the head mid-scroll used to shift every offset by one,
 * repeating a row the walk had already served and skipping one it never did.
 *
 * Opacity is what makes the cursor's own shape changeable without teaching a
 * handset in the field about it. The app must echo the cursor back unmodified
 * and must never construct or read one, so a cursor of the old `{ o }` shape
 * simply fails to decode — the app gets the existing `invalid_cursor` 400
 * rather than a walk that silently restarts from page one.
 */
import { z } from 'zod';

/** The decoded position: the last row the walk has already served. */
export const PurchasesPageCursorSchema = z.object({
  /** `orderedAt` of the last row served, exactly as `purchases` sent it. */
  orderedAt: z.string().min(1),
  /** `id` of the last row served. Together with `orderedAt`, the full anchor. */
  id: z.string().min(1),
});

export type PurchasesPageCursor = z.infer<typeof PurchasesPageCursorSchema>;

export function encodePurchasesCursor(cursor: PurchasesPageCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

/**
 * Decode a cursor the app echoed back.
 *
 * Returns `null` for anything that is not one this pillar minted rather than
 * throwing or coercing: a garbled cursor is the app's bug and answers 400.
 * Silently restarting from page one instead would look like a successful
 * scroll that quietly repeats itself forever.
 */
export function decodePurchasesCursor(encoded: string): PurchasesPageCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const result = PurchasesPageCursorSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
