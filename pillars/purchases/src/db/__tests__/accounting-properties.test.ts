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
 *
 * Every generated order is written to the database once, in `beforeAll`,
 * in each of the states the properties below care about; each `it` then
 * reads the accounting snapshots that write produced rather than driving the
 * database itself. The properties are independent statements about the same
 * orders, so writing those orders once per property instead — ten times
 * over — bought nothing, and it made every `it` a few hundred milliseconds
 * of real database work. That fits vitest's 5s default only while the
 * machine is idle: the file used to fail on wall clock, in whichever test
 * the contention happened to land in, rather than on anything it asserts.
 */
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isResidualBearing } from '../../contract/constants.js';
import {
  createPurchase,
  getPurchase,
  listOrdersNeedingDerivedCharge,
  mintDerivedCharge,
  purchaseChargeLinks,
  purchaseCharges,
} from '../index.js';
import { openTempDb, seedAmazonSource } from './helpers.js';

import type { SettlementRole } from '../../contract/constants.js';
import type {
  CreateChargeInput,
  CreatePurchaseInput,
  OpenedPurchasesDb,
  PurchaseAccounting,
} from '../index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;

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

/**
 * The same order with everything but its refunds stripped.
 *
 * This is the shape every refunded Amazon order has: the export publishes
 * what came back and never what was paid.
 */
function refundsOnly(input: CreatePurchaseInput): CreatePurchaseInput {
  return {
    ...input,
    checksum: `${input.checksum}-refunds-only`,
    sourceOrderId: `${String(input.sourceOrderId)}-refunds-only`,
    charges: (input.charges ?? []).filter((charge) => charge.role === 'refund'),
  };
}

function variant(
  seed: number,
  input: CreatePurchaseInput,
  suffix: string,
  charges: readonly CreateChargeInput[]
): CreatePurchaseInput {
  return {
    ...input,
    sourceOrderId: `order-${String(seed)}-${suffix}`,
    checksum: `checksum-${String(seed)}-${suffix}`,
    charges,
  };
}

function accountingOf(purchaseId: string): PurchaseAccounting {
  const detail = getPurchase(opened.db, purchaseId);
  if (detail === undefined) throw new Error(`purchase ${purchaseId} is missing`);
  return detail.accounting;
}

function linkCharge(purchaseId: string, ref: string, seed: number): void {
  const charge = opened.db
    .select()
    .from(purchaseCharges)
    .where(
      and(eq(purchaseCharges.purchaseId, purchaseId), eq(purchaseCharges.sourceChargeRef, ref))
    )
    .get();
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

/** Every accounting reading the properties below need, for one generated order. */
interface Readings {
  readonly seed: number;
  /** The id backing `unlinked` / `afterFirstLink` / `linked` — the order as the generator wrote it. */
  readonly id: string;
  readonly input: CreatePurchaseInput;
  /** As imported: no charge is backed by a transaction yet. */
  readonly unlinked: PurchaseAccounting;
  /** The same order once its first charge is linked. Absent when it has no charges. */
  readonly afterFirstLink: PurchaseAccounting | undefined;
  /** The same order again, once the generator's whole matched set is linked. */
  readonly linked: PurchaseAccounting;
  /** A copy with every authorization dropped. */
  readonly withoutAuthorizations: PurchaseAccounting;
  /** A copy with every refund dropped. Absent when the order has no refunds. */
  readonly withoutRefunds: PurchaseAccounting | undefined;
  /** A copy carrying no charges at all. */
  readonly chargeless: PurchaseAccounting;
  /** A copy stating only the refunds, read before any derived charge is minted onto it. */
  readonly refundsOnly: PurchaseAccounting;
  /** The id backing `refundsOnly`, for the work-set tests that need to re-read it after minting. */
  readonly refundsOnlyId: string;
}

function readOrder(seed: number): Readings {
  const { input, matchedRefs } = generateOrder(seed);
  const charges = input.charges ?? [];

  const id = createPurchase(opened.db, input);
  const unlinked = accountingOf(id);

  const firstRef = charges[0]?.sourceChargeRef;
  let afterFirstLink: PurchaseAccounting | undefined;
  if (firstRef != null) {
    linkCharge(id, firstRef, seed);
    afterFirstLink = accountingOf(id);
  }
  for (const ref of matchedRefs) {
    if (ref !== firstRef) linkCharge(id, ref, seed);
  }

  const withoutRefundsInput = charges.some((c) => c.role === 'refund')
    ? variant(
        seed,
        input,
        'norefund',
        charges.filter((c) => c.role !== 'refund')
      )
    : undefined;

  const refundsOnlyId = createPurchase(opened.db, refundsOnly(input));

  return {
    seed,
    id,
    input,
    unlinked,
    afterFirstLink,
    linked: accountingOf(id),
    withoutAuthorizations: accountingOf(
      createPurchase(
        opened.db,
        variant(
          seed,
          input,
          'noauth',
          charges.filter((c) => c.role !== 'authorization')
        )
      )
    ),
    withoutRefunds:
      withoutRefundsInput === undefined
        ? undefined
        : accountingOf(createPurchase(opened.db, withoutRefundsInput)),
    chargeless: accountingOf(createPurchase(opened.db, variant(seed, input, 'nocharges', []))),
    refundsOnly: accountingOf(refundsOnlyId),
    refundsOnlyId,
  };
}

/** Every split this order produced, whatever it was linked to at the time. */
function everySplit(readings: Readings): readonly PurchaseAccounting[] {
  return [
    readings.unlinked,
    readings.afterFirstLink,
    readings.linked,
    readings.withoutAuthorizations,
    readings.withoutRefunds,
    readings.chargeless,
  ].filter((a) => a !== undefined);
}

/**
 * How many orders to generate. A sampling knob, not a property of the code:
 * every seed costs five inserts and eight reads against a real database, and
 * the suite runs on machines that are already busy. Measured locally, 150
 * seeds build the corpus in ~0.6s and 300 in ~1.3s; under v8 coverage the
 * same builds take ~1.0s and ~1.8s. 150 keeps the whole build an order of
 * magnitude inside vitest's hook budget even when the machine steals most
 * of the CPU, which is the condition this file used to fail under.
 */
const CASES = 150;
const corpus: Readings[] = [];

beforeAll(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  for (let seed = 1; seed <= CASES; seed += 1) corpus.push(readOrder(seed));
});

afterAll(() => {
  cleanup();
});

describe('accounting invariants hold for any generated order', () => {
  it('the three buckets always reconstruct the total exactly', () => {
    for (const readings of corpus) {
      for (const a of everySplit(readings)) {
        // The identity the whole split rests on. If this can drift, every
        // headline spend figure is unsound.
        expect(
          a.matchedCents + a.awaitingImportCents + a.residualCents,
          `seed ${String(readings.seed)}`
        ).toBe(a.totalCents);
      }
    }
  });

  it('authorizations never move any bucket', () => {
    for (const { seed, unlinked, withoutAuthorizations } of corpus) {
      // A card hold and its capture are two records of one payment.
      // Dropping every hold must leave the split untouched.
      expect(withoutAuthorizations, `seed ${String(seed)}`).toEqual(unlinked);
    }
  });

  it('matched plus awaiting-import equals the sum of non-refund residual-bearing charges', () => {
    for (const { seed, input, linked } of corpus) {
      const expected = (input.charges ?? [])
        .filter((c) => isResidualBearing(c.role ?? 'capture') && c.role !== 'refund')
        .reduce((sum, c) => sum + c.amountCents, 0);

      expect(linked.matchedCents + linked.awaitingImportCents, `seed ${String(seed)}`).toBe(
        expected
      );
    }
  });

  it('linking a charge moves money from awaiting-import to matched and nowhere else', () => {
    for (const { seed, input, unlinked: before, afterFirstLink: after } of corpus) {
      if (after === undefined) continue;

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
      const firstCharge = (input.charges ?? [])[0];
      const role = firstCharge?.role ?? 'capture';
      const moved =
        isResidualBearing(role) && role !== 'refund' ? (firstCharge?.amountCents ?? 0) : 0;
      expect(after.matchedCents - before.matchedCents, `seed ${String(seed)}`).toBe(moved);
    }
  });

  it('refunds are reported as a positive magnitude, never as negative payment', () => {
    for (const { seed, input, linked } of corpus) {
      const expected = (input.charges ?? [])
        .filter((c) => c.role === 'refund')
        .reduce((sum, c) => sum + Math.abs(c.amountCents), 0);

      expect(linked.refundedCents, `seed ${String(seed)}`).toBe(expected);
      expect(linked.refundedCents, `seed ${String(seed)}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('a refund never increases the residual', () => {
    for (const { seed, unlinked, withoutRefunds } of corpus) {
      if (withoutRefunds === undefined) continue;

      // Getting money back must never make the "something is unexplained"
      // number go up. This is the property the old model violated.
      expect(unlinked.residualCents, `seed ${String(seed)}`).toBe(withoutRefunds.residualCents);
    }
  });

  it('net spend is what was paid less what came back', () => {
    for (const readings of corpus) {
      for (const a of everySplit(readings)) {
        expect(a.netSpendCents, `seed ${String(readings.seed)}`).toBe(
          a.matchedCents + a.awaitingImportCents - a.refundedCents
        );
      }
    }
  });

  it('an order with no charges is entirely residual', () => {
    for (const { seed, input, chargeless } of corpus) {
      expect(chargeless.residualCents, `seed ${String(seed)}`).toBe(input.totalCents);
      expect(chargeless.matchedCents, `seed ${String(seed)}`).toBe(0);
      expect(chargeless.awaitingImportCents, `seed ${String(seed)}`).toBe(0);
    }
  });

  it('an order stating only refunds is fully residual until a capture is minted', () => {
    for (const { seed, input, refundsOnly: a } of corpus) {
      // The shape the whole minting predicate exists for: money came back,
      // and nothing whatsoever is known about what went out. Read before
      // the work-set describe block below has minted anything.
      expect(a.residualCents, `seed ${String(seed)}`).toBe(input.totalCents);
      expect(a.matchedCents, `seed ${String(seed)}`).toBe(0);
      expect(a.awaitingImportCents, `seed ${String(seed)}`).toBe(0);
    }
  });

  it('every bucket is an integer — no float ever leaks in', () => {
    for (const readings of corpus) {
      for (const a of everySplit(readings)) {
        for (const [label, value] of Object.entries(a)) {
          expect(
            Number.isSafeInteger(value),
            `seed ${String(readings.seed)} ${label}=${String(value)}`
          ).toBe(true);
        }
      }
    }
  });
});

/**
 * The minting predicate, held to the same standard as the split it feeds.
 *
 * `listOrdersNeedingDerivedCharge` decides which orders the engine can ever
 * reach, so a wrong answer here is invisible in every accounting assertion
 * above — the numbers stay internally consistent while the order silently
 * never converges.
 *
 * These tests mutate the shared database instead of only reading it, so
 * unlike the describe block above they are not independent of one another:
 * the work-set membership check has to run before anything below it mints,
 * which is why it reads the corpus's own orders rather than writing fresh
 * ones, and every test after it can assume the corpus's eligible orders are
 * already minted. There is one database for the whole file, not one per
 * property, so that ordering is load-bearing.
 */
describe('the derived-charge work set over any generated order', () => {
  /** One minting pass, the sweep's own two calls with no finance in the way. */
  function mintWorkSet(): number {
    const orders = listOrdersNeedingDerivedCharge(opened.db);
    for (const order of orders) mintDerivedCharge(opened.db, order);
    return orders.length;
  }

  it('holds exactly the orders no charge claims any of', () => {
    const pending = new Set(listOrdersNeedingDerivedCharge(opened.db).map((order) => order.id));

    for (const { seed, id, input } of corpus) {
      // A refund says what came back; every other role states something
      // about a payment, and so takes the order out of the work set.
      const claimed = (input.charges ?? []).some(
        (charge) => (charge.role ?? 'capture') !== 'refund'
      );

      expect(pending.has(id), `seed ${String(seed)}`).toBe(!claimed);
    }
  });

  it('converges a refunded order: zero residual, net spend of total less refunds', () => {
    mintWorkSet();

    for (const { seed, refundsOnlyId } of corpus) {
      const a = getPurchase(opened.db, refundsOnlyId)?.accounting;
      if (a === undefined) throw new Error('missing accounting');

      expect(a.residualCents, `seed ${String(seed)}`).toBe(0);
      expect(a.matchedCents + a.awaitingImportCents + a.residualCents, `seed ${String(seed)}`).toBe(
        a.totalCents
      );
      // Minting the full total alongside an existing refund double-counts
      // nothing: the refund is orthogonal to the identity, so what is left
      // is exactly what the order cost.
      expect(a.netSpendCents, `seed ${String(seed)}`).toBe(a.totalCents - a.refundedCents);
    }
  });

  it('leaves an order that already states a charge exactly as it was', () => {
    mintWorkSet();

    for (const { seed, id, input, linked } of corpus) {
      if (!(input.charges ?? []).some((charge) => (charge.role ?? 'capture') !== 'refund'))
        continue;

      // The over-mint failure mode: a full-total capture on top of a charge
      // that already claims part of the total drives the residual negative.
      // `linked` is the corpus's own last write to this id — the state
      // minting must leave alone — not `unlinked`, which predates it.
      expect(getPurchase(opened.db, id)?.accounting, `seed ${String(seed)}`).toEqual(linked);
    }
  });

  it('empties itself in one pass, so a second sweep mints no twin', () => {
    mintWorkSet();

    // A fresh batch outside the corpus's own seed range, so this count is
    // exact regardless of what the tests above already minted.
    for (let seed = 1; seed <= CASES; seed += 1) {
      createPurchase(opened.db, refundsOnly(generateOrder(CASES + seed).input));
    }

    expect(mintWorkSet()).toBe(CASES);
    expect(mintWorkSet()).toBe(0);
  });
});
