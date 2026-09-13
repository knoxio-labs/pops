import { describe, expect, it } from 'vitest';

import { CURRENCY_UNCERTAIN, resolveCurrency } from '../currency.js';
import { ExtractedReceiptSchema } from '../extraction.js';

import type { ExtractedReceipt } from '../extraction.js';

const receipt = (over: Partial<ExtractedReceipt> = {}): ExtractedReceipt =>
  ExtractedReceiptSchema.parse({
    merchantName: 'Padaria do Bairro',
    purchasedOn: '2026-08-01',
    purchasedAt: '14:32',
    currency: null,
    address: null,
    timeZone: null,
    total: '$27.50',
    tax: null,
    discounts: [],
    lines: [{ description: 'Pão francês', amount: '$5.00' }],
    unreadable: [],
    ...over,
  });

describe('resolveCurrency', () => {
  it('keeps a stated currency untouched and marks it certain', () => {
    expect(resolveCurrency(receipt({ currency: 'NZD' }))).toEqual({
      currency: 'NZD',
      uncertain: false,
    });
  });

  it('infers BRL from a Brazilian timezone rather than defaulting to AUD', () => {
    const result = resolveCurrency(receipt({ timeZone: 'America/Sao_Paulo' }));
    expect(result.currency).toBe('BRL');
    expect(result.uncertain).toBe(true);
  });

  it('infers AUD from an Australian timezone, but still marks it uncertain', () => {
    const result = resolveCurrency(receipt({ timeZone: 'Australia/Sydney' }));
    expect(result.currency).toBe('AUD');
    expect(result.uncertain).toBe(true);
  });

  it('falls back to the ISO-4217 unresolved code, not AUD, for an unrecognised zone', () => {
    const result = resolveCurrency(receipt({ timeZone: 'Europe/Paris' }));
    expect(result.currency).not.toBe('AUD');
    expect(result.currency).toBe('XXX');
    expect(result.uncertain).toBe(true);
  });

  it('falls back to the ISO-4217 unresolved code, not AUD, when there is no signal at all', () => {
    const result = resolveCurrency(receipt({ timeZone: null }));
    expect(result.currency).not.toBe('AUD');
    expect(result.currency).toBe('XXX');
    expect(result.uncertain).toBe(true);
  });

  it('names the uncertain tag with a stable string', () => {
    expect(CURRENCY_UNCERTAIN).toBe('currency-uncertain');
  });
});
