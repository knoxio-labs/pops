import { describe, expect, it } from 'vitest';

import {
  classifyUpTransaction,
  toParsedTransaction,
  upChecksum,
  upLocalDate,
} from '../map-transaction.js';
import { upTransaction } from './fixtures.js';

const TARGET = { accountId: 'acc-1', accountLabel: 'Everyday' };

describe('upChecksum', () => {
  it('is a sha-256 hex digest keyed on the account and the Up id only', () => {
    const a = upChecksum('acc-1', 'txn-1');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(upChecksum('acc-1', 'txn-1')).toBe(a);
    expect(upChecksum('acc-2', 'txn-1')).not.toBe(a);
    expect(upChecksum('acc-1', 'txn-2')).not.toBe(a);
  });

  it('survives hold → settle even when the amount and the date move', () => {
    const held = toParsedTransaction(
      upTransaction({ status: 'HELD', cents: -10_000, createdAt: '2026-09-01T18:00:00+10:00' }),
      TARGET
    );
    const settled = toParsedTransaction(
      upTransaction({
        status: 'SETTLED',
        cents: -10_250,
        createdAt: '2026-09-01T18:00:00+10:00',
        settledAt: '2026-09-03T03:00:00+10:00',
      }),
      TARGET
    );
    expect(settled.parsed.checksum).toBe(held.parsed.checksum);
    expect(held.parsed).toMatchObject({ date: '2026-09-01', amount: -100, pending: true });
    expect(settled.parsed).toMatchObject({ date: '2026-09-03', amount: -102.5, pending: false });
  });
});

describe('upLocalDate', () => {
  it("takes the calendar date in the stamp's own offset, not UTC", () => {
    expect(upLocalDate('2026-09-01T00:30:00+10:00')).toBe('2026-09-01');
  });
});

describe('classifyUpTransaction', () => {
  it('names a transfer between own accounts whatever its sign', () => {
    expect(classifyUpTransaction(upTransaction({ transferAccountId: 'up-acc-2' }))).toBe(
      'transfer'
    );
    expect(
      classifyUpTransaction(upTransaction({ transferAccountId: 'up-acc-2', cents: 5_000 }))
    ).toBe('transfer');
  });

  it('leaves a debit to the classification ladder', () => {
    expect(classifyUpTransaction(upTransaction({ cents: -1 }))).toBeUndefined();
  });

  it('types every credit, reading refund and reversal off the label and defaulting to income', () => {
    expect(classifyUpTransaction(upTransaction({ cents: 1_000, transactionType: 'Refund' }))).toBe(
      'refund'
    );
    expect(
      classifyUpTransaction(upTransaction({ cents: 1_000, transactionType: 'Purchase Reversal' }))
    ).toBe('reversal');
    expect(
      classifyUpTransaction(upTransaction({ cents: 1_000, transactionType: 'Direct Credit' }))
    ).toBe('income');
    expect(classifyUpTransaction(upTransaction({ cents: 1_000 }))).toBe('income');
  });
});

describe('toParsedTransaction', () => {
  it('maps the settled row: ledger-signed dollars, local date, label and id from the target', () => {
    const { parsed, transactionType } = toParsedTransaction(upTransaction(), TARGET);

    expect(parsed).toMatchObject({
      date: '2026-09-01',
      description: 'Coles',
      amount: -12,
      account: 'Everyday',
      accountId: 'acc-1',
      fxCaptureSource: 'up-api',
      pending: false,
      checksum: upChecksum('acc-1', 'txn-1'),
    });
    expect(parsed).not.toHaveProperty('foreignAmountMinor');
    expect(transactionType).toBeUndefined();
    expect(JSON.parse(parsed.rawRow)).toEqual({
      source: 'up',
      id: 'txn-1',
      status: 'SETTLED',
      rawText: 'COLES 0412 MELBOURNE',
      message: null,
      createdAt: '2026-09-01T09:30:00+10:00',
      settledAt: '2026-09-01T09:30:00+10:00',
      transactionType: null,
      category: null,
      parentCategory: null,
      cardPurchaseMethod: 'CONTACTLESS',
    });
  });

  it('carries a foreign charge as a magnitude in its own minor units', () => {
    const { parsed } = toParsedTransaction(
      upTransaction({ cents: -10_792, foreign: { currencyCode: 'IDR', cents: -105_369_877 } }),
      TARGET
    );
    expect(parsed).toMatchObject({ foreignAmountMinor: 105_369_877, foreignCurrency: 'IDR' });
  });

  it('dates a held row by when it was created, since it has not settled', () => {
    const { parsed } = toParsedTransaction(
      upTransaction({ status: 'HELD', createdAt: '2026-09-02T23:59:00+10:00' }),
      TARGET
    );
    expect(parsed).toMatchObject({ date: '2026-09-02', pending: true });
  });

  it('keeps the category only as raw-row context, never as a tag', () => {
    const { parsed } = toParsedTransaction(upTransaction({ category: 'groceries' }), TARGET);
    expect(JSON.parse(parsed.rawRow)).toMatchObject({ category: 'groceries' });
    expect(parsed).not.toHaveProperty('tags');
  });
});
