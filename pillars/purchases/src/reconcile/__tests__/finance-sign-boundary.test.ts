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
 * POPS-4611: an unmodified pass-through left every card charge (finance
 * negative) unable to match its capture (purchases positive) — blocking in
 * `stages.ts` rejects on mismatched sign, so production wrote 5 links out
 * of 841 charges.
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

function run(charges: readonly SolvableCharge[], transactions: readonly SolvableTransaction[]) {
  const input: SolverInput = {
    charges,
    transactions,
    confirmed: [],
    rejected: [],
    rules: [],
    defaultWindowDays: 21,
  };
  return solve(input);
}

describe('the finance sign boundary end to end', () => {
  it('links a negative finance card charge to its positive purchase capture', () => {
    const capture: SolvableCharge = {
      id: 'chg-capture',
      purchaseId: 'ord-1',
      source: 'amazon',
      position: 0,
      amountCents: 10_699,
      currency: 'AUD',
      role: 'capture',
      orderedAt: '2026-03-04T00:00:00Z',
      descriptorPattern: null,
      settlementWindowDays: null,
    };

    // Finance publishes the Amazon card charge as -106.99 (money leaving
    // the account). Today's code passes that sign straight through, so it
    // never matches the +$106.99 capture above.
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
    const capture: SolvableCharge = {
      id: 'chg-capture',
      purchaseId: 'ord-2',
      source: 'amazon',
      position: 0,
      amountCents: 2_495,
      currency: 'AUD',
      role: 'capture',
      orderedAt: '2026-03-04T00:00:00Z',
      descriptorPattern: null,
      settlementWindowDays: null,
    };
    const refund: SolvableCharge = {
      id: 'chg-refund',
      purchaseId: 'ord-2',
      source: 'amazon',
      position: 1,
      amountCents: -2_495,
      currency: 'AUD',
      role: 'refund',
      orderedAt: '2026-03-04T00:00:00Z',
      descriptorPattern: null,
      settlementWindowDays: null,
    };

    // Finance publishes the refund as +24.95 (a credit). Unflipped, that
    // is a positive candidate that could only ever be mistaken for the
    // capture, never matched to the refund it actually settles.
    const credit = financeTransaction({ id: 'txn-credit', amount: 24.95, date: '2026-03-08' });

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
});
