/**
 * How the list a merchant row opened stands against the count that row
 * carries.
 *
 * `capped` and `short` are separated because the page cap is the only cause
 * this layer can establish: a list that came back at the cap is short for a
 * reason the reader can act on, and a list short of both the cap and the
 * count is two reads of the same corpus disagreeing. Reporting the second as
 * the first names a cause that was never observed, which is the failure this
 * whole layer exists to avoid.
 *
 * `over` is the direction the merchant filter is written to prevent — a
 * label group widened to every order wearing that label under any entity —
 * so it is reported rather than left as a list that quietly holds more than
 * the total above it was computed from.
 */
export type OrderCountAgreement = 'agrees' | 'none' | 'capped' | 'short' | 'over';

export function orderCountAgreement(
  shown: number,
  counted: number,
  cap: number
): OrderCountAgreement {
  if (shown > counted) return 'over';
  if (shown === counted) return 'agrees';
  if (shown === 0) return 'none';
  return shown >= cap ? 'capped' : 'short';
}
