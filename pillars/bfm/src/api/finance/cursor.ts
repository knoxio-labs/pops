/**
 * The opaque page cursor the mobile transaction list hands out.
 *
 * It carries finance's keyset anchor — the `(date, id)` of the last row
 * already served — because that is what makes the walk stable: an anchor names
 * a position in the data, so an import landing at the head mid-scroll cannot
 * shift the window the way an offset would.
 *
 * Opaque to the app on purpose. It is base64url'd JSON, which is *encoding*
 * and not secrecy — anyone can read it, and nothing here may ever carry
 * something that matters if they do. What opacity buys is freedom: the day
 * this anchor grows a third component, no handset in the field has to be
 * taught the new shape, because none of them was ever allowed to parse the
 * old one.
 */
import { z } from 'zod';

/** The decoded anchor: the last row a previous page served. */
export const PageCursorSchema = z.object({
  /** `date` of the last row served, `YYYY-MM-DD`. */
  d: z.string().min(1),
  /** `id` of the last row served — what separates rows sharing that date. */
  i: z.string().min(1),
});

export type PageCursor = z.infer<typeof PageCursorSchema>;

export function encodePageCursor(cursor: PageCursor): string {
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
export function decodePageCursor(encoded: string): PageCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const result = PageCursorSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
