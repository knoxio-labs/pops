import { describe, expect, it } from 'vitest';

import { readPayment } from '../payment.js';
import { CARD_SLIP, cardPayment, changeRow } from './fixtures.js';

import type { ReceiptPayment } from '../blocks.js';

const asPayments = (values: unknown[]): ReceiptPayment[] => values as ReceiptPayment[];

const cash = (amount: string): unknown => ({
  description: 'Cash',
  amount,
  details: [{ text: 'CASH                $20.00' }],
});

describe('readPayment', () => {
  it('reads the scheme and last four from the terminal slip', () => {
    const reading = readPayment(asPayments([cardPayment('$32.58'), changeRow()]));
    expect(reading.hint).toBe('AMEX ····6895');
    expect(reading.isCash).toBe(false);
    expect(reading.amountCents).toBe(3258);
  });

  it('keeps nothing else off the slip', () => {
    // The one test in this file that would matter after a breach. The slip
    // carries the merchant and terminal ids, the AID, the ARQC and the TVR;
    // none of them help match a transaction, and the cheapest way to never
    // leak them is to never store them.
    const { hint } = readPayment(asPayments([cardPayment('$32.58')]));
    const forbidden = [
      '611000602001034',
      'A00000002501090',
      '106CBC37A006B0BA',
      '0000008000',
      'W1034066',
    ];
    for (const secret of forbidden) expect(hint).not.toContain(secret);
    expect(hint).toBe('AMEX ····6895');
  });

  it('never reports the change as the payment', () => {
    // On a cash receipt "Change" carries a real amount AND repeats the
    // tender block, so it looks exactly like a cash payment to everything
    // except its description. Reading it as one describes a $40 tender as a
    // $7.42 one, and the charge no longer matches anything.
    const changeWithTender = {
      description: 'Change',
      amount: '$7.42',
      details: [{ text: 'CASH                $40.00' }, { text: 'CHANGE               $7.42' }],
    };
    const reading = readPayment(asPayments([changeWithTender, cash('$40.00')]));
    expect(reading.isCash).toBe(true);
    expect(reading.amountCents).toBe(4000);
  });

  it('never reports the change as the payment even when it is the only card-looking row', () => {
    const changeOnCard = {
      description: 'Change X-6895',
      amount: '$0.00',
      details: [{ text: 'VISA' }],
    };
    expect(readPayment(asPayments([changeOnCard, cardPayment('$32.58')])).amountCents).toBe(3258);
  });

  it('recognises cash from the payment description', () => {
    const reading = readPayment(asPayments([cash('$20.00')]));
    expect(reading).toEqual({ hint: null, isCash: true, amountCents: 2000 });
  });

  it('names the scheme for the cards this account sees', () => {
    const withScheme = (scheme: string): string | null =>
      readPayment(
        asPayments([
          cardPayment(
            '$1.00',
            CARD_SLIP.map((l) => (l === 'AMERICAN EXPRESS' ? scheme : l))
          ),
        ])
      ).hint;

    expect(withScheme('MASTERCARD')).toBe('Mastercard ····6895');
    expect(withScheme('VISA')).toBe('Visa ····6895');
    expect(withScheme('EFTPOS SAVINGS')).toBe('EFTPOS ····6895');
  });

  it('still reports the digits when the scheme is unprintable', () => {
    const slip = CARD_SLIP.filter((l) => l !== 'AMERICAN EXPRESS');
    expect(readPayment(asPayments([cardPayment('$1.00', slip)])).hint).toBe('····6895');
  });

  it('reports nothing rather than guessing when there is no payment block', () => {
    expect(readPayment(null)).toEqual({ hint: null, isCash: false, amountCents: null });
    expect(readPayment(asPayments([]))).toEqual({ hint: null, isCash: false, amountCents: null });
    expect(readPayment(asPayments([changeRow()]))).toEqual({
      hint: null,
      isCash: false,
      amountCents: null,
    });
  });
});
