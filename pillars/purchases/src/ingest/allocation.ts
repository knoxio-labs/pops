/**
 * Splitting one order-level cents figure across its line items.
 *
 * `Σ allocated === total` is the only property that matters here: a
 * caller summing `landedCostCents` across a shipment's items must recover
 * exactly what the merchant charged for shipping, not a cent more or less.
 * Proportional division by weight (line value, unit count, whatever the
 * caller passes) never lands on whole cents on its own — 3 items sharing
 * 100c at equal weight want 33.33c each — so the fractional remainder has
 * to go *somewhere* deterministically, or two runs over the same input
 * could disagree.
 *
 * The largest-remainder method: give every item `floor(share)`, then hand
 * the leftover cents one at a time to the items whose true share had the
 * largest fraction dropped, ties broken by index. That is the standard
 * apportionment fix for exactly this problem (it's how legislative seats
 * get apportioned to states). Done in `BigInt` rather than float division —
 * `totalCents * weight` can exceed what a double represents exactly for
 * large orders, and a remainder computed from a rounding error would defeat
 * the one property this function exists to guarantee.
 */

/**
 * Divide `totalCents` across `weights.length` shares proportional to
 * `weights`, summing back to `totalCents` exactly.
 *
 * When every weight is zero (nothing to allocate by), falls back to an
 * equal split rather than producing an all-zero allocation — an order
 * whose every line is a $0 promotional item still gets a share of
 * shipping.
 */
export function allocateProRata(totalCents: number, weights: readonly number[]): number[] {
  if (weights.length === 0) return [];

  const weightSum = weights.reduce((total, weight) => total + weight, 0);
  const effectiveWeights = weightSum > 0 ? weights : weights.map(() => 1);
  const effectiveSum = weightSum > 0 ? weightSum : weights.length;

  const total = BigInt(totalCents);
  const denominator = BigInt(effectiveSum);

  const shares = effectiveWeights.map((weight, index) => {
    const numerator = total * BigInt(weight);
    let quotient = numerator / denominator;
    let remainder = numerator % denominator;
    // BigInt division truncates toward zero; floor division needs the
    // remainder nudged positive whenever the raw quotient rounded up.
    if (remainder < 0n) {
      quotient -= 1n;
      remainder += denominator;
    }
    return { index, floor: quotient, remainder };
  });

  const leftoverCents = Number(total - shares.reduce((sum, share) => sum + share.floor, 0n));

  const byRemainder = shares.toSorted((a, b) => {
    if (b.remainder > a.remainder) return 1;
    if (b.remainder < a.remainder) return -1;
    return a.index - b.index;
  });

  const result = shares.map((share) => share.floor);
  for (let k = 0; k < leftoverCents; k++) {
    const slot = byRemainder[k];
    if (slot === undefined) break;
    const current = result[slot.index];
    if (current === undefined) break;
    result[slot.index] = current + 1n;
  }

  return result.map(Number);
}
