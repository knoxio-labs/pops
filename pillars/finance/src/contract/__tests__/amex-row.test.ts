/**
 * Amex row parsing (POPS-2604).
 *
 * The sample values are the real export's: `Foreign Spend Amount` pairs the
 * amount with its ISO code in one cell, `Commission` is the AUD fee in dollars,
 * and `Country` is the merchant's country as a name — not the currency's, which
 * is why the Singapore merchant billing USD is `SG` and not `US`.
 */
import { describe, expect, it } from 'vitest';

import { parseAmexRow } from '../amex-row.js';

/** The long export's foreign-detail columns; the mapped columns are irrelevant here. */
function row(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    Description: 'NANONOBLE PTE. LTD.     SINGAPORE',
    Amount: '8.11',
    'Foreign Spend Amount': '5.50 USD',
    Commission: '0.27',
    'Exchange Rate': '',
    Country: 'SINGAPORE',
    ...overrides,
  };
}

describe('parseAmexRow', () => {
  it('reads the foreign amount, its currency and the commission as the fee', () => {
    expect(parseAmexRow(row())).toEqual({
      country: 'SG',
      foreignCharge: { amountMinor: 550, currency: 'USD', feeCents: 27 },
      fxCaptureSource: 'amex-columns',
    });
  });

  it('scales a zero-decimal currency by its own exponent, not the printed decimals', () => {
    // 1100 minor units is ¥1,100 — a two-decimal reading would store 110000.
    expect(parseAmexRow(row({ 'Foreign Spend Amount': '1,100 JPY', Country: 'JAPAN' }))).toEqual({
      country: 'JP',
      foreignCharge: { amountMinor: 1100, currency: 'JPY', feeCents: 27 },
      fxCaptureSource: 'amex-columns',
    });
  });

  it('reads the country of a domestic row so an uncaptured row stays distinguishable', () => {
    const parsed = parseAmexRow(
      row({ 'Foreign Spend Amount': '', Commission: '', Country: 'AUSTRALIA' })
    );

    expect(parsed.country).toBe('AU');
    expect(parsed.foreignCharge).toBeUndefined();
  });

  it("maps Amex's own non-standard spelling of the United Kingdom", () => {
    expect(parseAmexRow(row({ Country: 'UNITED KINGDOM OF GB AND NI' })).country).toBe('GB');
  });

  it('yields no country for a name it cannot map rather than guessing one', () => {
    expect(parseAmexRow(row({ Country: 'ATLANTIS' })).country).toBeUndefined();
  });

  it('yields nothing at all for the short export, whose columns are absent', () => {
    expect(parseAmexRow({ Description: 'ALDI', Amount: '42.50' })).toEqual({
      country: undefined,
      foreignCharge: undefined,
      fxCaptureSource: 'unavailable',
    });
  });

  it('separates a captured domestic row from a file that cannot say (POPS-2647)', () => {
    const domestic = parseAmexRow(
      row({ 'Foreign Spend Amount': '', Commission: '', Country: 'AUSTRALIA' })
    );
    const shortExport = parseAmexRow({ Description: 'ALDI', Amount: '42.50' });

    expect(domestic.fxCaptureSource).toBe('amex-columns');
    expect(shortExport.fxCaptureSource).toBe('unavailable');
  });

  it('reports the long shape from the columns being present, not from them holding values', () => {
    const empty = parseAmexRow({
      Description: 'ALDI',
      Amount: '42.50',
      'Foreign Spend Amount': '',
      Commission: '',
      Country: '',
    });

    expect(empty.fxCaptureSource).toBe('amex-columns');
    expect(empty.foreignCharge).toBeUndefined();
    expect(empty.country).toBeUndefined();
  });

  it('refuses a foreign amount with no commission rather than reporting a free conversion', () => {
    expect(parseAmexRow(row({ Commission: '' })).foreignCharge).toBeUndefined();
  });

  it('yields no foreign charge for a currency with no known minor-unit scale', () => {
    expect(parseAmexRow(row({ 'Foreign Spend Amount': '5.50 ZZZ' })).foreignCharge).toBeUndefined();
  });

  it('yields no foreign charge when the cell is not an amount and a currency', () => {
    expect(parseAmexRow(row({ 'Foreign Spend Amount': '5.50' })).foreignCharge).toBeUndefined();
  });
});
