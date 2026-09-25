/**
 * The Amazon source's registered settings, driven through the solver.
 *
 * Pinned against the constants the ingest CLI and migration 0018 write, so
 * a change to either value is a change to what these assert.
 */
import { describe, expect, it } from 'vitest';

import {
  AMAZON_DESCRIPTOR_PATTERN,
  AMAZON_SETTLEMENT_WINDOW_DAYS,
} from '../../ingest/amazon/index.js';
import { charge, run, txn } from './solver-fixtures.js';

const amazonCharge = charge({
  orderedAt: '2026-03-04T09:30:00Z',
  descriptorPattern: AMAZON_DESCRIPTOR_PATTERN,
  settlementWindowDays: AMAZON_SETTLEMENT_WINDOW_DAYS,
});

describe('the Amazon descriptor pattern (POPS-4650)', () => {
  it('admits no AMAZON WEB SERVICES transaction, even at exactly the charge amount', () => {
    const out = run({
      charges: [amazonCharge],
      transactions: [txn({ description: 'AMAZON WEB SERVICES' })],
    });

    expect(out.links).toEqual([]);
    expect(out.review).toEqual([
      expect.objectContaining({ reason: 'no-candidate', candidateCount: 0 }),
    ]);
  });

  it('does not let an AWS bill part-pay an order', () => {
    const out = run({
      charges: [amazonCharge],
      transactions: [txn({ description: 'AMAZON WEB SERVICES', amountCents: 835 })],
    });

    expect(out.links).toEqual([]);
  });

  it.each([
    'AMAZON MARKETPLACE AU   SYDNEY',
    'AMAZON RETA* AMAZON AU',
    'AMAZON.COM.AU',
    'Amazon AU',
  ])('admits the retail descriptor %s', (description) => {
    const out = run({ charges: [amazonCharge], transactions: [txn({ description })] });

    expect(out.links).toEqual([expect.objectContaining({ linkType: 'exact' })]);
  });
});

describe('the Amazon settlement window (POPS-4647)', () => {
  it.each([
    ['the last day after', '2026-03-14'],
    ['the first day before', '2026-02-22'],
  ])('admits a transaction on %s', (_edge, date) => {
    const out = run({ charges: [amazonCharge], transactions: [txn({ date })] });

    expect(out.links).toEqual([expect.objectContaining({ linkType: 'exact' })]);
  });

  it.each([
    ['one day after', '2026-03-15'],
    ['one day before', '2026-02-21'],
  ])('refuses a transaction %s the window', (_edge, date) => {
    const out = run({ charges: [amazonCharge], transactions: [txn({ date })] });

    expect(out.links).toEqual([]);
    expect(out.review).toEqual([expect.objectContaining({ reason: 'no-candidate' })]);
  });
});
