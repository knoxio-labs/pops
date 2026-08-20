/**
 * The opaque page cursor the mobile purchases list hands out.
 *
 * It carries an OFFSET, and that is a compromise rather than a design. The
 * finance leg's cursor beside this one carries a keyset anchor — the `(date,
 * id)` of the last row served — because an anchor names a position in the data
 * and an offset names a position in a result set that moves. `purchases`'
 * `GET /purchases` exposes only `limit`/`offset` today, so there is no anchor
 * to carry; an order landing at the head mid-scroll shifts every offset by one
 * and the next page repeats a row and skips another. The producer growing an
 * anchor is tracked, and the pillar README says so.
 *
 * Opacity is what makes that fixable. The app must echo the cursor back
 * unmodified and must never construct or read one, so the day the payload
 * becomes an anchor no handset in the field has to be taught the new shape —
 * a cursor of the old shape simply fails to decode, and the list restarts.
 */
import { z } from 'zod';

/** The decoded position: how many rows the walk has already served. */
export const PurchasesPageCursorSchema = z.object({
  /** Rows already served. Never negative; zero is the first page and needs no cursor. */
  o: z.number().int().positive(),
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
