import { purchasesQueue } from '@/fixtures/purchases-queue';
import { describe, expect, it } from 'vitest';

/**
 * The delta is the one figure on a queue row a reviewer reads against the two
 * columns beside it. A fixture whose delta disagrees with its own proposals
 * makes the row unreviewable — the reader cannot tell a layout question from
 * arithmetic that never held.
 */
describe('the reconcile queue fixture', () => {
  it.each(purchasesQueue.map((entry) => [entry.chargeId, entry] as const))(
    '%s carries the delta its proposals imply',
    (_chargeId, entry) => {
      const proposed = entry.proposed.reduce((sum, link) => sum + link.amountCents, 0);
      expect(entry.deltaCents).toBe(proposed - entry.amountCents);
    }
  );

  it('leaves an unexplained charge short by the whole charge, never balanced', () => {
    const unexplained = purchasesQueue.filter((entry) => entry.proposed.length === 0);
    expect(unexplained.length).toBeGreaterThan(0);
    for (const entry of unexplained) expect(entry.deltaCents).toBe(-entry.amountCents);
  });

  it('offers a row of each shape the decision bar has to survive', () => {
    const shapes = {
      balanced: purchasesQueue.some((entry) => entry.deltaCents === 0 && entry.proposed.length > 0),
      short: purchasesQueue.some((entry) => entry.deltaCents < 0 && entry.proposed.length > 0),
      over: purchasesQueue.some((entry) => entry.deltaCents > 0),
      unexplained: purchasesQueue.some((entry) => entry.proposed.length === 0),
      split: purchasesQueue.some((entry) => entry.proposed.length > 1),
      autoLinked: purchasesQueue.some((entry) => entry.autoLinkedSource),
      unnamedMerchant: purchasesQueue.some((entry) => entry.merchantEntityName === null),
    };
    expect(shapes).toEqual({
      balanced: true,
      short: true,
      over: true,
      unexplained: true,
      split: true,
      autoLinked: true,
      unnamedMerchant: true,
    });
  });
});
