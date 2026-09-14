import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TRANSACTION_TYPES } from '../../../../contract/corrections-constants.js';
import {
  findPairForTransaction,
  getTransferPairWindowDays,
  isTransferPairEnabled,
  type PairCandidate,
} from '../pair-transfers.js';

/**
 * Amounts are integer cents (money migration 0064), so absolute-value equality
 * is exact — these fixtures deliberately use whole-cent integers.
 */
function tx(overrides: Partial<PairCandidate> = {}): PairCandidate {
  return {
    id: 'tx',
    amount: -5000,
    accountId: 'Amex',
    type: 'transfer',
    date: '2026-07-01',
    description: 'TRANSFER',
    relatedTransactionId: null,
    ...overrides,
  };
}

describe('findPairForTransaction', () => {
  const target = tx({ id: 'A', amount: -5000, accountId: 'Amex', date: '2026-07-01' });

  it('links a unique opposite-sign, same-amount, different-account, same-day counterpart', () => {
    const counterpart = tx({ id: 'B', amount: 5000, accountId: 'Bendigo', date: '2026-07-01' });
    expect(findPairForTransaction(target, [counterpart], 3)).toEqual({ kind: 'match', id: 'B' });
  });

  it('matches within the window (2 days apart, window 3)', () => {
    const counterpart = tx({ id: 'B', amount: 5000, accountId: 'Bendigo', date: '2026-07-03' });
    expect(findPairForTransaction(target, [counterpart], 3)).toEqual({ kind: 'match', id: 'B' });
  });

  it('matches at the exact window boundary (3 days apart, window 3 — inclusive)', () => {
    const counterpart = tx({ id: 'B', amount: 5000, accountId: 'Bendigo', date: '2026-07-04' });
    expect(findPairForTransaction(target, [counterpart], 3)).toEqual({ kind: 'match', id: 'B' });
  });

  it('does not match one day beyond the window (4 days apart, window 3)', () => {
    const counterpart = tx({ id: 'B', amount: 5000, accountId: 'Bendigo', date: '2026-07-05' });
    expect(findPairForTransaction(target, [counterpart], 3)).toEqual({ kind: 'none' });
  });

  it('rejects a same-account candidate (the #3608 hazard)', () => {
    const counterpart = tx({ id: 'B', amount: 5000, accountId: 'Amex', date: '2026-07-01' });
    expect(findPairForTransaction(target, [counterpart], 3)).toEqual({ kind: 'none' });
  });

  it('rejects a same-sign candidate', () => {
    const counterpart = tx({ id: 'B', amount: -5000, accountId: 'Bendigo', date: '2026-07-01' });
    expect(findPairForTransaction(target, [counterpart], 3)).toEqual({ kind: 'none' });
  });

  it('rejects a different-amount candidate', () => {
    const counterpart = tx({ id: 'B', amount: 5001, accountId: 'Bendigo', date: '2026-07-01' });
    expect(findPairForTransaction(target, [counterpart], 3)).toEqual({ kind: 'none' });
  });

  it('returns none for an empty candidate pool', () => {
    expect(findPairForTransaction(target, [], 3)).toEqual({ kind: 'none' });
  });

  it('ignores the target itself when present in the pool', () => {
    expect(findPairForTransaction(target, [target], 3)).toEqual({ kind: 'none' });
  });

  it('returns none when the target is already linked', () => {
    const linkedTarget = tx({ id: 'A', amount: -5000, relatedTransactionId: 'X' });
    const counterpart = tx({ id: 'B', amount: 5000, accountId: 'Bendigo', date: '2026-07-01' });
    expect(findPairForTransaction(linkedTarget, [counterpart], 3)).toEqual({ kind: 'none' });
  });

  it('excludes candidates that are already linked', () => {
    const counterpart = tx({
      id: 'B',
      amount: 5000,
      accountId: 'Bendigo',
      date: '2026-07-01',
      relatedTransactionId: 'Z',
    });
    expect(findPairForTransaction(target, [counterpart], 3)).toEqual({ kind: 'none' });
  });

  it('breaks a tie by the closest date when one candidate is strictly nearer', () => {
    const near = tx({ id: 'NEAR', amount: 5000, accountId: 'Bendigo', date: '2026-07-01' });
    const far = tx({ id: 'FAR', amount: 5000, accountId: 'ING', date: '2026-07-03' });
    expect(findPairForTransaction(target, [far, near], 3)).toEqual({ kind: 'match', id: 'NEAR' });
  });

  it('refuses to auto-link when two candidates are equally close', () => {
    const one = tx({ id: 'ONE', amount: 5000, accountId: 'Bendigo', date: '2026-07-01' });
    const two = tx({ id: 'TWO', amount: 5000, accountId: 'ING', date: '2026-07-01' });
    const result = findPairForTransaction(target, [one, two], 3);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect([...result.candidateIds].toSorted()).toEqual(['ONE', 'TWO']);
    }
  });

  it('reports only the equally-closest tie as ambiguous, excluding a farther eligible row', () => {
    const tieA = tx({ id: 'TIE_A', amount: 5000, accountId: 'Bendigo', date: '2026-07-02' });
    const tieB = tx({ id: 'TIE_B', amount: 5000, accountId: 'ING', date: '2026-06-30' });
    const farther = tx({ id: 'FAR', amount: 5000, accountId: 'UP', date: '2026-07-04' });
    const result = findPairForTransaction(target, [tieA, tieB, farther], 3);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect([...result.candidateIds].toSorted()).toEqual(['TIE_A', 'TIE_B']);
    }
  });

  it('refuses to auto-link when three candidates are equally close (three-way ambiguity)', () => {
    const one = tx({ id: 'ONE', amount: 5000, accountId: 'Bendigo', date: '2026-07-01' });
    const two = tx({ id: 'TWO', amount: 5000, accountId: 'ING', date: '2026-07-01' });
    const three = tx({ id: 'THREE', amount: 5000, accountId: 'UP', date: '2026-07-01' });
    const result = findPairForTransaction(target, [one, two, three], 3);
    expect(result.kind).toBe('ambiguous');
    if (result.kind === 'ambiguous') {
      expect([...result.candidateIds].toSorted()).toEqual(['ONE', 'THREE', 'TWO']);
    }
  });

  describe('a bank reference number breaks an otherwise exact tie', () => {
    // The real 2026-06-30 case: an Everyday transfer, its credit-card
    // counterpart, and an unrelated same-day same-amount PayID deposit. Both
    // legs of the real transfer carry the bank's reference; the deposit does not.
    const everyday = tx({
      id: 'EVERYDAY',
      amount: -300000,
      accountId: 'Everyday',
      date: '2026-06-30',
      description: 'ANZ M-BANKING FUNDS TFER TRANSFER 964110  TO 4564XXXXXXXX7373',
    });
    const creditCard = tx({
      id: 'CARD',
      amount: 300000,
      accountId: 'ANZ Credit Card',
      date: '2026-06-30',
      description: 'PAYMENT THANKYOU 964110',
    });
    const payId = tx({
      id: 'PAYID',
      amount: 300000,
      accountId: 'Amex',
      date: '2026-06-30',
      description: 'PayID Payment Received, Thank you',
    });

    it('links the candidate that shares the reference', () => {
      expect(findPairForTransaction(everyday, [payId, creditCard], 3)).toEqual({
        kind: 'match',
        id: 'CARD',
      });
    });

    it('stays ambiguous when no candidate carries a reference', () => {
      const other = tx({ ...payId, id: 'OTHER', accountId: 'ING', description: 'DEPOSIT' });
      const result = findPairForTransaction(everyday, [payId, other], 3);
      expect(result.kind).toBe('ambiguous');
    });

    it('stays ambiguous when the target carries no reference of its own', () => {
      const plain = tx({ ...everyday, description: 'TRANSFER TO SAVINGS' });
      expect(findPairForTransaction(plain, [payId, creditCard], 3).kind).toBe('ambiguous');
    });

    it('stays ambiguous when the only reference present is a different one', () => {
      const elsewhere = tx({ ...creditCard, description: 'PAYMENT THANKYOU 111111' });
      expect(findPairForTransaction(everyday, [payId, elsewhere], 3).kind).toBe('ambiguous');
    });

    it('stays ambiguous when two candidates share the reference', () => {
      const twin = tx({ ...creditCard, id: 'TWIN', accountId: 'Bendigo' });
      const result = findPairForTransaction(everyday, [creditCard, twin, payId], 3);
      expect(result.kind).toBe('ambiguous');
    });

    it('never reads the masked card number as a reference', () => {
      // Both descriptions contain 4564XXXXXXXX7373-shaped digits; only the
      // phrase-anchored reference may count.
      const cardDigits = tx({ ...payId, description: 'PAYMENT THANKYOU 7373' });
      expect(findPairForTransaction(everyday, [cardDigits, creditCard], 3)).toEqual({
        kind: 'match',
        id: 'CARD',
      });
      const onlyCardDigits = tx({ ...creditCard, description: 'DEPOSIT 4564 7373' });
      expect(findPairForTransaction(everyday, [payId, onlyCardDigits], 3).kind).toBe('ambiguous');
    });

    it('does not let a shared reference beat a strictly nearer candidate', () => {
      // A tie-breaker, never an override of the date predicate.
      const laterCard = tx({ ...creditCard, date: '2026-07-01' });
      expect(findPairForTransaction(everyday, [payId, laterCard], 3)).toEqual({
        kind: 'match',
        id: 'PAYID',
      });
    });
  });

  describe('both legs must already be typed transfer (POPS-3940)', () => {
    const amazon = tx({
      id: 'AMAZON',
      amount: -12239,
      accountId: 'Amex',
      type: 'purchase',
      date: '2026-04-27',
      description: 'AMAZON RETA* AMAZON AU',
    });
    const andrew = tx({
      id: 'ANDREW',
      amount: 12239,
      accountId: 'Up',
      type: 'income',
      date: '2026-04-27',
      description: 'Andrew Borg',
    });
    const upToAmex = tx({
      id: 'UP_LEG',
      amount: -300000,
      accountId: 'Up',
      type: 'transfer',
      date: '2026-08-18',
      description: 'Amex Credit Card',
    });
    const amexReceipt = tx({
      id: 'AMEX_LEG',
      amount: 300000,
      accountId: 'Amex',
      type: 'transfer',
      date: '2026-08-18',
      description: 'PayID Payment Received, Thank you',
    });

    it('never pairs a card purchase with a friend reimbursing it the same day', () => {
      expect(findPairForTransaction(amazon, [andrew], 3)).toEqual({ kind: 'none' });
      expect(findPairForTransaction(andrew, [amazon], 3)).toEqual({ kind: 'none' });
    });

    it('still refuses the purchase when the reimbursement is itself typed transfer', () => {
      const andrewTransfer = tx({ ...andrew, type: 'transfer' });
      expect(findPairForTransaction(amazon, [andrewTransfer], 3)).toEqual({ kind: 'none' });
      expect(findPairForTransaction(andrewTransfer, [amazon], 3)).toEqual({ kind: 'none' });
    });

    it('pairs an Up card payment with its Amex receipt when both are transfers', () => {
      expect(findPairForTransaction(upToAmex, [amexReceipt], 3)).toEqual({
        kind: 'match',
        id: 'AMEX_LEG',
      });
      expect(findPairForTransaction(amexReceipt, [upToAmex], 3)).toEqual({
        kind: 'match',
        id: 'UP_LEG',
      });
    });

    it.each(TRANSACTION_TYPES.filter((type) => type !== 'transfer'))(
      'refuses a %s leg on either side',
      (type) => {
        expect(findPairForTransaction(tx({ ...upToAmex, type }), [amexReceipt], 3)).toEqual({
          kind: 'none',
        });
        expect(findPairForTransaction(upToAmex, [tx({ ...amexReceipt, type })], 3)).toEqual({
          kind: 'none',
        });
      }
    );

    it('does not let a nearer non-transfer row make a transfer match ambiguous or steal it', () => {
      const nearerPurchase = tx({ ...amexReceipt, id: 'NEAR', accountId: 'ING', type: 'income' });
      const laterReceipt = tx({ ...amexReceipt, date: '2026-08-19' });
      expect(findPairForTransaction(upToAmex, [nearerPurchase, laterReceipt], 3)).toEqual({
        kind: 'match',
        id: 'AMEX_LEG',
      });
    });
  });

  it('handles a credit target (positive amount) symmetrically', () => {
    const creditTarget = tx({ id: 'A', amount: 5000, accountId: 'Bendigo', date: '2026-07-01' });
    const debitCounterpart = tx({ id: 'B', amount: -5000, accountId: 'Amex', date: '2026-07-01' });
    expect(findPairForTransaction(creditTarget, [debitCounterpart], 3)).toEqual({
      kind: 'match',
      id: 'B',
    });
  });

  it('falls back to the default window (3 days) when none is passed', () => {
    delete process.env['FINANCE_TRANSFER_PAIR_WINDOW_DAYS'];
    const inDefault = tx({ id: 'B', amount: 5000, accountId: 'Bendigo', date: '2026-07-04' });
    const outOfDefault = tx({ id: 'C', amount: 5000, accountId: 'ING', date: '2026-07-05' });
    expect(findPairForTransaction(target, [inDefault])).toEqual({ kind: 'match', id: 'B' });
    expect(findPairForTransaction(target, [outOfDefault])).toEqual({ kind: 'none' });
  });
});

describe('getTransferPairWindowDays', () => {
  const KEY = 'FINANCE_TRANSFER_PAIR_WINDOW_DAYS';
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[KEY];
  });
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it('defaults to 3 when unset', () => {
    delete process.env[KEY];
    expect(getTransferPairWindowDays()).toBe(3);
  });

  it('parses a valid positive integer', () => {
    process.env[KEY] = '7';
    expect(getTransferPairWindowDays()).toBe(7);
  });

  it.each(['', '0', '-2', '2.5', 'abc'])('falls back to 3 for the invalid value %o', (value) => {
    process.env[KEY] = value;
    expect(getTransferPairWindowDays()).toBe(3);
  });
});

describe('isTransferPairEnabled', () => {
  const KEY = 'FINANCE_TRANSFER_PAIR_ENABLED';
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[KEY];
  });
  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
  });

  it('is disabled by default (unset)', () => {
    delete process.env[KEY];
    expect(isTransferPairEnabled()).toBe(false);
  });

  it('is enabled only for the exact string "true"', () => {
    process.env[KEY] = 'true';
    expect(isTransferPairEnabled()).toBe(true);
  });

  it.each(['1', 'TRUE', 'True', 'yes', 'false', ''])(
    'stays disabled for the non-canonical value %o',
    (value) => {
      process.env[KEY] = value;
      expect(isTransferPairEnabled()).toBe(false);
    }
  );
});
