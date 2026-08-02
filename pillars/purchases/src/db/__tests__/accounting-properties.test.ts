/**
 * Property-based coverage of the accounting split.
 *
 * The example-based tests beside this one pin the shapes we know about —
 * gift-card partials, refunds, authorizations, FX. Those were written from
 * the same understanding that produced the code, so they share its blind
 * spots. These generate orders instead and assert the invariants that must
 * hold for *any* combination, which is the only way to find the case nobody
 * thought to write down.
 *
 * Generation is seeded rather than random. A property test that fails once
 * on CI and never again is worse than no test: the seed is printed with
 * every failure so the exact order can be replayed.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isResidualBearing } from '../../contract/constants.js';
import { createPurchase, getPurchase, purchaseChargeLinks, purchaseCharges } from '../index.js';
import { openTempDb, seedAmazonSource } from './helpers.js';

import type { SettlementRole } from '../../contract/constants.js';
import type { CreateChargeInput, CreatePurchaseInput, OpenedPurchasesDb } from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
});

afterEach(() => {
  cleanup();
});

/**
 * Deterministic PRNG (mulberry32). Seeded per case from the case index, so
 * every generated order is reproducible from the seed printed on failure.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROLES: readonly SettlementRole[] = ['capture', 'authorization', 'refund', 'adjustment'];

interface GeneratedOrder {
  readonly input: CreatePurchaseInput;
  /** Which charges the generator decided to back with a transaction. */
  readonly matchedRefs: readonly string[];
}

function generateOrder(seed: number): GeneratedOrder {
  const rand = rng(seed);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

  const totalCents = int(1, 500_000);
  const chargeCount = int(0, 5);
  const charges: CreateChargeInput[] = [];
  const matchedRefs: string[] = [];

  for (let i = 0; i < chargeCount; i += 1) {
    const role = ROLES[int(0, ROLES.length - 1)] ?? 'capture';
    const magnitude = int(0, Math.max(1, Math.floor(totalCents * 1.2)));
    // Refunds are negative money; everything else is positive.
    const amountCents = role === 'refund' ? -magnitude : magnitude;
    const ref = `c${String(i)}`;
    charges.push({ sourceChargeRef: ref, amountCents, role });
    if (rand() < 0.5) matchedRefs.push(ref);
  }

  return {
    input: {
      source: 'amazon',
      sourceOrderId: `order-${String(seed)}`,
      ingestMethod: 'export',
      orderedAt: '2026-02-02T01:41:21Z',
      currency: 'AUD',
      totalCents,
      checksum: `checksum-${String(seed)}`,
      charges,
    },
    matchedRefs,
  };
}

function matchCharge(purchaseId: string, ref: string, seed: number): void {
  const charge = opened.db
    .select()
    .from(purchaseCharges)
    .all()
    .find((c) => c.purchaseId === purchaseId && c.sourceChargeRef === ref);
  if (charge === undefined) throw new Error(`no charge ${ref}`);
  opened.db
    .insert(purchaseChargeLinks)
    .values({
      chargeId: charge.id,
      transactionUri: `pops://finance/transaction/t-${String(seed)}-${ref}`,
      amountCents: charge.amountCents,
      linkType: 'exact',
    })
    .run();
}

const CASES = 300;

describe('accounting invariants hold for any generated order', () => {
  it('the three buckets always reconstruct the total exactly', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { input, matchedRefs } = generateOrder(seed);
      const id = createPurchase(opened.db, input);
      for (const ref of matchedRefs) matchCharge(id, ref, seed);

      const a = getPurchase(opened.db, id)?.accounting;
      if (a === undefined) throw new Error('missing accounting');

      // The identity the whole split rests on. If this can drift, every
      // headline spend figure is unsound.
      expect(a.matchedCents + a.awaitingImportCents + a.residualCents, `seed ${String(seed)}`).toBe(
        a.totalCents
      );
    }
  });

  it('authorizations never move any bucket', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { input } = generateOrder(seed);
      const withoutAuths: CreatePurchaseInput = {
        ...input,
        checksum: `${input.checksum}-noauth`,
        sourceOrderId: `${String(input.sourceOrderId)}-noauth`,
        charges: (input.charges ?? []).filter((c) => c.role !== 'authorization'),
      };

      const withId = createPurchase(opened.db, input);
      const withoutId = createPurchase(opened.db, withoutAuths);

      // A card hold and its capture are two records of one payment.
      // Dropping every hold must leave the split untouched.
      expect(getPurchase(opened.db, withoutId)?.accounting, `seed ${String(seed)}`).toEqual(
        getPurchase(opened.db, withId)?.accounting
      );
    }
  });

  it('matched plus awaiting-import equals the sum of non-refund residual-bearing charges', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { input, matchedRefs } = generateOrder(seed);
      const id = createPurchase(opened.db, input);
      for (const ref of matchedRefs) matchCharge(id, ref, seed);

      const expected = (input.charges ?? [])
        .filter((c) => isResidualBearing(c.role ?? 'capture') && c.role !== 'refund')
        .reduce((sum, c) => sum + c.amountCents, 0);
      const a = getPurchase(opened.db, id)?.accounting;
      if (a === undefined) throw new Error('missing accounting');

      expect(a.matchedCents + a.awaitingImportCents, `seed ${String(seed)}`).toBe(expected);
    }
  });

  it('linking a charge moves money from awaiting-import to matched and nowhere else', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { input } = generateOrder(seed);
      const id = createPurchase(opened.db, input);
      const before = getPurchase(opened.db, id)?.accounting;

      const firstRef = (input.charges ?? [])[0]?.sourceChargeRef;
      if (firstRef == null) continue;
      matchCharge(id, firstRef, seed);
      const after = getPurchase(opened.db, id)?.accounting;
      if (before === undefined || after === undefined) throw new Error('missing accounting');

      // Importing a bank statement cannot change what an order cost, nor
      // how much of it is unaccounted for — only whether we can prove it.
      expect(after.totalCents, `seed ${String(seed)}`).toBe(before.totalCents);
      expect(after.residualCents, `seed ${String(seed)}`).toBe(before.residualCents);
      expect(after.matchedCents + after.awaitingImportCents, `seed ${String(seed)}`).toBe(
        before.matchedCents + before.awaitingImportCents
      );
      // Stronger than monotonicity, which is false for a refund: linking a
      // charge moves exactly that charge's amount, or nothing at all when
      // it is an authorization or a refund.
      const linked = (input.charges ?? []).find((c) => c.sourceChargeRef === firstRef);
      const role = linked?.role ?? 'capture';
      const moved = isResidualBearing(role) && role !== 'refund' ? (linked?.amountCents ?? 0) : 0;
      expect(after.matchedCents - before.matchedCents, `seed ${String(seed)}`).toBe(moved);
    }
  });

  it('refunds are reported as a positive magnitude, never as negative payment', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { input } = generateOrder(seed);
      const id = createPurchase(opened.db, input);
      const a = getPurchase(opened.db, id)?.accounting;
      if (a === undefined) throw new Error('missing accounting');

      const expected = (input.charges ?? [])
        .filter((c) => c.role === 'refund')
        .reduce((sum, c) => sum + Math.abs(c.amountCents), 0);
      expect(a.refundedCents, `seed ${String(seed)}`).toBe(expected);
      expect(a.refundedCents, `seed ${String(seed)}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('a refund never increases the residual', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { input } = generateOrder(seed);
      const charges = input.charges ?? [];
      if (!charges.some((c) => c.role === 'refund')) continue;

      const withRefunds = createPurchase(opened.db, input);
      const withoutRefunds = createPurchase(opened.db, {
        ...input,
        checksum: `${input.checksum}-norefund`,
        sourceOrderId: `${String(input.sourceOrderId)}-norefund`,
        charges: charges.filter((c) => c.role !== 'refund'),
      });

      // Getting money back must never make the "something is unexplained"
      // number go up. This is the property the old model violated.
      expect(
        getPurchase(opened.db, withRefunds)?.accounting.residualCents,
        `seed ${String(seed)}`
      ).toBe(getPurchase(opened.db, withoutRefunds)?.accounting.residualCents);
    }
  });

  it('net spend is what was paid less what came back', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { input } = generateOrder(seed);
      const id = createPurchase(opened.db, input);
      const a = getPurchase(opened.db, id)?.accounting;
      if (a === undefined) throw new Error('missing accounting');

      expect(a.netSpendCents, `seed ${String(seed)}`).toBe(
        a.matchedCents + a.awaitingImportCents - a.refundedCents
      );
    }
  });

  it('an order with no charges is entirely residual', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { input } = generateOrder(seed);
      const id = createPurchase(opened.db, { ...input, charges: [] });
      const a = getPurchase(opened.db, id)?.accounting;

      expect(a?.residualCents, `seed ${String(seed)}`).toBe(input.totalCents);
      expect(a?.matchedCents, `seed ${String(seed)}`).toBe(0);
      expect(a?.awaitingImportCents, `seed ${String(seed)}`).toBe(0);
    }
  });

  it('every bucket is an integer — no float ever leaks in', () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const { input, matchedRefs } = generateOrder(seed);
      const id = createPurchase(opened.db, input);
      for (const ref of matchedRefs) matchCharge(id, ref, seed);

      const a = getPurchase(opened.db, id)?.accounting;
      if (a === undefined) throw new Error('missing accounting');
      for (const [label, value] of Object.entries(a)) {
        expect(Number.isSafeInteger(value), `seed ${String(seed)} ${label}=${String(value)}`).toBe(
          true
        );
      }
    }
  });
});
