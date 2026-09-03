import { describe, expect, it } from 'vitest';

import {
  deltaFor,
  entriesFor,
  hasErrors,
  TODAY,
  toMinorUnits,
  type TransactionDraft,
  validate,
} from './transaction-model';

const draft = (over: Partial<TransactionDraft> = {}): TransactionDraft => ({
  type: 'out',
  accountId: 'a1',
  amount: '10.00',
  date: TODAY,
  description: '',
  ...over,
});

describe('deltaFor', () => {
  it('signs by direction and never by the magnitude it is handed', () => {
    expect(deltaFor('out', 'from', 1_000)).toBe(-1_000);
    expect(deltaFor('in', 'from', 1_000)).toBe(1_000);
    expect(deltaFor('transfer', 'from', 1_000)).toBe(-1_000);
    expect(deltaFor('transfer', 'to', 1_000)).toBe(1_000);
  });
});

describe('entriesFor', () => {
  it('writes one entry for a one-sided movement', () => {
    expect(entriesFor(draft(), 8_432)).toEqual([{ accountId: 'a1', delta: -8_432 }]);
  });

  it('writes a transfer as two entries summing to zero', () => {
    const entries = entriesFor(draft({ type: 'transfer', toAccountId: 'a2' }), 50_000);
    expect(entries).toEqual([
      { accountId: 'a1', delta: -50_000 },
      { accountId: 'a2', delta: 50_000 },
    ]);
    expect(entries.reduce((sum, entry) => sum + entry.delta, 0)).toBe(0);
  });

  it('never lets a signed magnitude reach the ledger unflipped', () => {
    expect(entriesFor(draft({ type: 'in' }), -8_432)).toEqual([{ accountId: 'a1', delta: 8_432 }]);
  });
});

describe('toMinorUnits', () => {
  it('scales by the currency, and points have no minor units', () => {
    expect(toMinorUnits('84.32', 'AUD')).toBe(8_432);
    expect(toMinorUnits('1,250', 'MR')).toBe(1_250);
    expect(Number.isNaN(toMinorUnits('lunch', 'AUD'))).toBe(true);
  });
});

describe('validate', () => {
  it('passes a complete draft', () => {
    expect(hasErrors(validate(draft(), 1_000))).toBe(false);
  });

  it('names the missing account by the direction that needs it', () => {
    expect(validate(draft({ accountId: undefined }), 1_000).account).toMatch(/money left/u);
    expect(validate(draft({ type: 'in', accountId: undefined }), 1_000).account).toMatch(
      /money arrived/u
    );
  });

  it('rejects an empty, zero or signed amount', () => {
    expect(validate(draft({ amount: '' }), Number.NaN).amount).toBeDefined();
    expect(validate(draft({ amount: '0' }), 0).amount).toBeDefined();
    expect(validate(draft({ amount: '-10.00' }), -1_000).amount).toMatch(/without a sign/u);
  });

  it('rejects a date that has not happened', () => {
    expect(validate(draft({ date: '2026-12-24' }), 1_000).date).toBeDefined();
    expect(validate(draft({ date: '2020-01-01' }), 1_000).date).toBeUndefined();
  });

  it('rejects a transfer with a missing or repeated second account', () => {
    expect(validate(draft({ type: 'transfer' }), 1_000).toAccount).toBeDefined();
    expect(validate(draft({ type: 'transfer', toAccountId: 'a1' }), 1_000).toAccount).toMatch(
      /two different/u
    );
  });
});
