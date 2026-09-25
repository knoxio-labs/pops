/**
 * The card filter: a payment hint narrows blocking to the account its
 * existing links settled on (POPS-4647).
 */
import { describe, expect, it } from 'vitest';

import { learnCardAccounts } from '../card-accounts.js';
import { charge, run, txn } from './solver-fixtures.js';

const VISA = 'Visa - 7373';
const ANZ = 'acct-anz';
const AMEX = 'acct-amex';

/** Two transactions for exactly the charge amount, one on each card's account. */
const SAME_AMOUNT_ON_BOTH_CARDS = [
  txn({ uri: 'pops://finance/transaction/on-amex', accountId: AMEX, date: '2026-03-05' }),
  txn({ uri: 'pops://finance/transaction/on-anz', accountId: ANZ, date: '2026-03-06' }),
];

describe('learnCardAccounts', () => {
  const accountOf = new Map([
    ['t-anz-1', ANZ],
    ['t-anz-2', ANZ],
    ['t-amex', AMEX],
  ]);

  it('maps a hint whose every link landed on one account', () => {
    const mapping = learnCardAccounts(
      [
        { paymentHint: VISA, transactionUri: 't-anz-1' },
        { paymentHint: VISA, transactionUri: 't-anz-2' },
      ],
      accountOf
    );

    expect([...mapping]).toEqual([[VISA, ANZ]]);
  });

  it('maps nothing for a hint whose links disagree', () => {
    const mapping = learnCardAccounts(
      [
        { paymentHint: VISA, transactionUri: 't-anz-1' },
        { paymentHint: VISA, transactionUri: 't-amex' },
        { paymentHint: 'AmericanExpress - 1001', transactionUri: 't-amex' },
      ],
      accountOf
    );

    expect(mapping.has(VISA)).toBe(false);
    expect(mapping.get('AmericanExpress - 1001')).toBe(AMEX);
  });

  it('maps nothing without links', () => {
    expect(learnCardAccounts([], accountOf).size).toBe(0);
  });

  it('skips a link whose transaction it cannot place, rather than calling it a disagreement', () => {
    const mapping = learnCardAccounts(
      [
        { paymentHint: VISA, transactionUri: 't-anz-1' },
        { paymentHint: VISA, transactionUri: 'outside-the-fetched-window' },
      ],
      accountOf
    );

    expect(mapping.get(VISA)).toBe(ANZ);
  });

  it('maps nothing for a hint whose only links cannot be placed', () => {
    const mapping = learnCardAccounts(
      [{ paymentHint: VISA, transactionUri: 'outside-the-fetched-window' }],
      accountOf
    );

    expect(mapping.has(VISA)).toBe(false);
  });
});

describe('blocking on a mapped hint', () => {
  it('excludes another account’s same-amount transaction, so the charge links', () => {
    const out = run({
      charges: [charge({ paymentHint: VISA })],
      transactions: SAME_AMOUNT_ON_BOTH_CARDS,
      cardAccounts: new Map([[VISA, ANZ]]),
    });

    expect(out.review).toEqual([]);
    expect(out.links).toEqual([
      expect.objectContaining({
        chargeId: 'chg-1',
        transactionUri: 'pops://finance/transaction/on-anz',
        linkType: 'exact',
      }),
    ]);
  });

  it('is ambiguous in the same world without the mapping', () => {
    const out = run({
      charges: [charge({ paymentHint: VISA })],
      transactions: SAME_AMOUNT_ON_BOTH_CARDS,
      cardAccounts: new Map(),
    });

    expect(out.links).toEqual([]);
    expect(out.review).toEqual([expect.objectContaining({ reason: 'ambiguous' })]);
  });

  it('leaves the charge with no candidate when its only match is on another account', () => {
    const out = run({
      charges: [charge({ paymentHint: VISA })],
      transactions: [txn({ accountId: AMEX })],
      cardAccounts: new Map([[VISA, ANZ]]),
    });

    expect(out.links).toEqual([]);
    expect(out.review).toEqual([expect.objectContaining({ reason: 'no-candidate' })]);
  });
});

describe('blocking on an unmapped hint', () => {
  const others = new Map([['AmericanExpress - 1001', AMEX]]);

  it('stays ambiguous across accounts, as with no hint at all', () => {
    const withHint = run({
      charges: [charge({ paymentHint: 'Visa - 9999' })],
      transactions: SAME_AMOUNT_ON_BOTH_CARDS,
      cardAccounts: others,
    });
    const withoutHint = run({
      charges: [charge({ paymentHint: null })],
      transactions: SAME_AMOUNT_ON_BOTH_CARDS,
      cardAccounts: others,
    });

    expect(withHint.review).toEqual([expect.objectContaining({ reason: 'ambiguous' })]);
    expect(withHint).toEqual(withoutHint);
  });

  it('links to a transaction on an account another hint is mapped to', () => {
    const out = run({
      charges: [charge({ paymentHint: 'Visa - 9999' })],
      transactions: [txn({ accountId: AMEX })],
      cardAccounts: others,
    });

    expect(out.links).toEqual([expect.objectContaining({ linkType: 'exact' })]);
  });
});
