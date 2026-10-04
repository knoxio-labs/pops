/**
 * The finance-to-purchases sign boundary, exercised through the real
 * solver rather than asserted on `toCandidateTransaction` in isolation.
 *
 * Finance signs `amount` by cash direction (negative leaves the account);
 * purchases signs `amountCents` by settlement role (a capture is positive,
 * a refund negative). `toCandidateTransaction` (`api/finance/wire.ts`) is
 * the one place that reconciles the two conventions — a `CandidateTransaction`
 * is structurally a `SolvableTransaction` plus extra fields, so a wire row
 * converted here can be fed straight into `solve` and prove the whole
 * boundary, not just the arithmetic.
 *
 */
import { describe, expect, it } from 'vitest';

import { toCandidateTransaction } from '../../api/finance/wire.js';
import { solve } from '../solve.js';

import type { SolvableCharge, SolvableTransaction, SolverInput } from '../types.js';

const BASE_WIRE = {
  id: 'txn-1',
  description: 'AMAZON MKTPLACE AU',
  accountId: 'everyday',
  foreignAmountMinor: null,
  foreignCurrency: null,
  date: '2026-03-06',
  entityId: null,
  entityName: null,
} as const;

function financeTransaction(
  overrides: Partial<Parameters<typeof toCandidateTransaction>[0]>
): SolvableTransaction {
  return toCandidateTransaction({ ...BASE_WIRE, amount: 0, type: 'purchase', ...overrides });
}

function purchaseCharge(
  id: string,
  role: SolvableCharge['role'],
  amountCents: number
): SolvableCharge {
  return {
    id,
    purchaseId: 'ord-1',
    source: 'good-guys',
    position: 0,
    amountCents,
    currency: 'AUD',
    role,
    orderedAt: '2026-03-04T00:00:00Z',
    shippedAt: null,
    descriptorPattern: null,
    settlementWindowDays: null,
    paymentHint: null,
  };
}

function run(charges: readonly SolvableCharge[], transactions: readonly SolvableTransaction[]) {
  const input: SolverInput = {
    charges,
    transactions,
    confirmed: [],
    rejected: [],
    rules: [],
    cardAccounts: new Map(),
    defaultWindowDays: 21,
  };
  return solve(input);
}

describe('the finance sign boundary end to end', () => {
  it('links a negative finance card charge to its positive purchase capture', () => {
    const capture = purchaseCharge('chg-capture', 'capture', 10_699);
    const cardCharge = financeTransaction({ id: 'txn-card', amount: -106.99, date: '2026-03-06' });

    const { links, review } = run([capture], [cardCharge]);

    expect(review).toHaveLength(0);
    expect(links).toEqual([
      expect.objectContaining({
        chargeId: 'chg-capture',
        transactionUri: 'pops://finance/transaction/txn-card',
        amountCents: 10_699,
      }),
    ]);
  });

  it('links a positive finance credit to a purchase refund, and never to a capture in the same window', () => {
    const capture = purchaseCharge('chg-capture', 'capture', 2_495);
    const refund = purchaseCharge('chg-refund', 'refund', -2_495);
    const credit = financeTransaction({
      id: 'txn-credit',
      amount: 24.95,
      type: 'refund',
      date: '2026-03-08',
    });

    const { links, review } = run([capture, refund], [credit]);

    expect(links).toEqual([
      expect.objectContaining({
        chargeId: 'chg-refund',
        transactionUri: 'pops://finance/transaction/txn-credit',
        amountCents: -2_495,
      }),
    ]);
    // The capture has no candidate at all: the only transaction in the
    // window settled the refund, and blocking's sign test keeps a credit
    // from ever being considered for a capture.
    expect(review).toEqual([
      expect.objectContaining({ chargeId: 'chg-capture', reason: 'no-candidate' }),
    ]);
  });

  it.each([
    { type: 'transfer', financeAmount: 337, amountCents: 33_700 },
    { type: 'rebate', financeAmount: 60, amountCents: 6_000 },
    { type: 'fee', financeAmount: 20, amountCents: 2_000 },
  ])('keeps a positive $type inflow away from a matching merchant capture', (example) => {
    const capture = purchaseCharge('chg-capture', 'capture', example.amountCents);
    const inflow = financeTransaction({
      id: `txn-${example.type}`,
      amount: example.financeAmount,
      type: example.type,
    });
    const purchase = financeTransaction({
      id: 'txn-purchase',
      amount: -example.financeAmount,
      type: 'purchase',
    });

    const { links, review } = run([capture], [inflow, purchase]);

    expect(links).toEqual([
      expect.objectContaining({
        chargeId: capture.id,
        transactionUri: 'pops://finance/transaction/txn-purchase',
        amountCents: example.amountCents,
      }),
    ]);
    expect(review).toEqual([]);
  });

  it.each(['transfer', 'rebate', 'fee'] as const)(
    'does not settle a purchase capture with a %s outflow',
    (type) => {
      const capture = purchaseCharge('chg-capture', 'capture', 337);
      const transaction = financeTransaction({ id: `txn-${type}`, amount: -3.37, type });

      const { links, review } = run([capture], [transaction]);

      expect(links).toEqual([]);
      expect(review).toEqual([
        expect.objectContaining({ chargeId: capture.id, reason: 'no-candidate' }),
      ]);
    }
  );

  it.each(['transfer', 'rebate', 'fee'] as const)(
    'does not settle a purchase refund with a %s inflow',
    (type) => {
      const refund = purchaseCharge('chg-refund', 'refund', -337);
      const transaction = financeTransaction({ id: `txn-${type}`, amount: 3.37, type });

      const { links, review } = run([refund], [transaction]);

      expect(links).toEqual([]);
      expect(review).toEqual([
        expect.objectContaining({ chargeId: refund.id, reason: 'no-candidate' }),
      ]);
    }
  );

  it('does not settle a charge with an unfamiliar finance transaction type', () => {
    const capture = purchaseCharge('chg-capture', 'capture', 337);
    const transaction = financeTransaction({
      id: 'txn-future-type',
      amount: -3.37,
      type: 'chargeback',
    });

    const { links, review } = run([capture], [transaction]);

    expect(links).toEqual([]);
    expect(review).toEqual([
      expect.objectContaining({ chargeId: capture.id, reason: 'no-candidate' }),
    ]);
  });
});
