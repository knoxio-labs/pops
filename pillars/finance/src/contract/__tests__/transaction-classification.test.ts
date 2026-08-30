/**
 * Unit guards for the descriptor-derived `type` (POPS-2610).
 *
 * The two failure modes worth pinning are opposite ones: a fee descriptor that
 * is NOT recognised (an untyped interest charge is invisible to a fee report),
 * and an ordinary merchant that IS — "Fee Street Cafe" is a coffee, not a
 * membership charge, and a bare `FEE` pattern would classify it as one.
 */
import { describe, expect, it } from 'vitest';

import {
  classifyFromDescription,
  FEE_TAGS,
  GIFT_CARD_TAG,
  resolveCommittedType,
} from '../transaction-classification.js';

describe('classifyFromDescription — fees', () => {
  it.each([
    ['MEMBERSHIP FEE', 'fee:membership'],
    ['CHARGE FOR OVERDUE PAYMENT', 'fee:late'],
    ['INTEREST CHARGES', 'fee:interest'],
    ['INTEREST CHARGED ON PURCHASES', 'fee:interest'],
    ['ANNUAL FEE', 'fee:membership'],
    ['LATE PAYMENT FEE', 'fee:late'],
    ['INTERNATIONAL TRANSACTION FEE', 'fee:conversion'],
    ['ATM WITHDRAWAL FEE', 'fee:atm'],
    ['CASH ADVANCE FEE', 'fee:atm'],
    ['CASH ADVANCE INTEREST', 'fee:interest'],
    ['CARD SURCHARGE', 'fee:surcharge'],
  ])('%s is a fee tagged %s', (description, tag) => {
    expect(classifyFromDescription(description)).toMatchObject({ type: 'fee', tag });
  });

  it('matches regardless of case, digits and punctuation in the descriptor', () => {
    expect(classifyFromDescription('Interest-Charges 4321')).toMatchObject({
      type: 'fee',
      tag: 'fee:interest',
    });
  });

  it('returns exactly one of the closed fee: namespace', () => {
    const derived = classifyFromDescription('MEMBERSHIP FEE');
    expect(FEE_TAGS).toContain(derived?.tag);
  });

  it.each([
    'FEE STREET CAFE',
    'COFFEE CLUB SYDNEY',
    'WOOLWORTHS METRO 1234',
    'ATM CBA GEORGE ST',
    'INTEREST FREE FURNITURE PTY LTD',
  ])('does not type an ordinary merchant: %s', (description) => {
    expect(classifyFromDescription(description)).toBeNull();
  });

  it('returns null for an empty description rather than guessing', () => {
    expect(classifyFromDescription('')).toBeNull();
    expect(classifyFromDescription('   ')).toBeNull();
  });
});

describe('classifyFromDescription — inbound account payments', () => {
  it.each([
    'PayID Payment Received, Thank you',
    'PAYMENT RECEIVED - THANK YOU',
    'DIRECT DEBIT RECEIVED',
  ])('%s is a transfer with no fee: value', (description) => {
    const derived = classifyFromDescription(description);
    expect(derived?.type).toBe('transfer');
    expect(derived?.tag).toBeUndefined();
  });

  // ANZ writes THANKYOU as one word on every monthly card payment. The pattern
  // list had only the spaced spelling, and normalisation collapses whitespace
  // but never inserts it, so the match missed by a single space and a $500
  // payment committed as a purchase (POPS-2680).
  it.each(['PAYMENT THANKYOU 754244', 'PAYMENT THANK YOU 754244'])(
    'types %s as a transfer, however the bank spells it',
    (description) => {
      const derived = classifyFromDescription(description);
      expect(derived?.type).toBe('transfer');
      expect(derived?.tag).toBeUndefined();
    }
  );

  it('does not type an outbound payment to a merchant', () => {
    expect(classifyFromDescription('PAYPAL *SPOTIFY')).toBeNull();
  });

  // The added pattern is a two-word phrase for the reason the fee patterns are:
  // a bare THANKYOU would type a merchant that happens to contain it.
  it('does not type a merchant whose name merely contains the word', () => {
    expect(classifyFromDescription('THANKYOU CAFE SYDNEY')).toBeNull();
  });
});

describe('resolveCommittedType', () => {
  it('turns a gift-card purchase into a transfer', () => {
    expect(resolveCommittedType('purchase', [GIFT_CARD_TAG, 'contains:groceries'])).toBe(
      'transfer'
    );
  });

  it('leaves a purchase without the tag alone', () => {
    expect(resolveCommittedType('purchase', ['contains:groceries'])).toBe('purchase');
    expect(resolveCommittedType('purchase', [])).toBe('purchase');
  });

  it('leaves a gift-card row that is not a purchase as authored', () => {
    expect(resolveCommittedType('refund', [GIFT_CARD_TAG])).toBe('refund');
    expect(resolveCommittedType('income', [GIFT_CARD_TAG])).toBe('income');
  });

  it('does not match a different tag that merely starts the same way', () => {
    expect(resolveCommittedType('purchase', ['contains:gift-cards'])).toBe('purchase');
    expect(resolveCommittedType('purchase', ['contains:gift'])).toBe('purchase');
  });
});
