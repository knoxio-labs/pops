/**
 * Unit tests for the `raw_row` re-derivation the backfill migration runs on.
 *
 * The three ANZ fixtures are verbatim `raw_row.Description` values read off the
 * live ledger (POPS-2633). They are the only rows in that export carrying a
 * currency marker, and they are the reason the backfill needs two parsers
 * rather than one: ANZ's foreign detail is a trailer inside the description,
 * which grouping stored rows by their column names cannot see.
 */
import { describe, expect, it } from 'vitest';

import { parseRawRowForeignFields, rawRowForeignField } from '../raw-row-foreign-charge.js';

/** ANZ's headerless import names its unlabelled columns and never fills them. */
function anzRow(description: string): string {
  return JSON.stringify({
    Date: '12/06/2026',
    Amount: '-148.63',
    Description: description,
    'Column 4': '',
    'Column 5': '',
    'Column 6': '',
    'Column 7': '',
    'Column 8': '',
  });
}

function amexRow(cells: Record<string, string>): string {
  return JSON.stringify({
    Date: '12/06/2026',
    'Date Processed': '13/06/2026',
    Description: 'MERCHANT',
    Amount: '148.63',
    'Foreign Spend Amount': '',
    Commission: '',
    'Exchange Rate': '',
    'Additional Information': '',
    'Appears On Your Statement As': 'MERCHANT',
    Address: '',
    'Town/City': '',
    Postcode: '',
    Country: '',
    Reference: '',
    ...cells,
  });
}

describe('parseRawRowForeignFields', () => {
  describe('an ANZ headerless row', () => {
    it.each([
      ['GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD', 10_000, 'USD', 503],
      ['FILEFLOWS                 CONIFER GROVE  6.99  USD 0.35 AUD', 699, 'USD', 35],
      ['CORRIDORDIGITAL           CORRIDORDIGIT  3.99  USD 0.20 AUD', 399, 'USD', 20],
    ])('reads the trailer inside %s', (description, amountMinor, currency, feeCents) => {
      expect(parseRawRowForeignFields(anzRow(description))).toEqual({
        country: 'US',
        foreignCharge: { amountMinor, currency, feeCents },
        unreadable: false,
        captureSource: 'anz-descriptor',
      });
    });

    it('reads a zero-decimal charge as whole units, not hundredths', () => {
      // `1 100  JPY` is 1100 minor units. JPY has no minor unit, and ANZ writes
      // its thousands separator as a space, so a comma-only amount pattern
      // would skip the row and report success.
      expect(
        parseRawRowForeignFields(anzRow('TOKYO RAMEN               SHIBUYA  1 100  JPY 0.40 AUD'))
      ).toMatchObject({
        foreignCharge: { amountMinor: 1100, currency: 'JPY', feeCents: 40 },
      });
    });

    it('yields nothing for a domestic row rather than a zeroed charge', () => {
      expect(parseRawRowForeignFields(anzRow('ALDI STORES - MARRICKV    MARRICKVILLE'))).toEqual({
        country: undefined,
        foreignCharge: undefined,
        unreadable: false,
        captureSource: 'anz-descriptor',
      });
    });

    it('does not read a currency code in a merchant name as a trailer', () => {
      // `USD` here is part of the merchant, and the charge is domestic. Reading
      // it as a trailer would invent a foreign charge on an AUD purchase.
      expect(
        parseRawRowForeignFields(anzRow('USD CURRENCY EXCHANGE     SYDNEY AIRPORT'))
      ).toMatchObject({ foreignCharge: undefined, unreadable: false });
    });

    it('flags a currency with no known minor-unit scale as unreadable', () => {
      // Scaling an unrecognised currency would guess a power of ten.
      expect(
        parseRawRowForeignFields(anzRow('SOMEWHERE ODD             ELSEWHERE  10.00  ZZZ 0.34 AUD'))
      ).toMatchObject({ foreignCharge: undefined, unreadable: true });
    });
  });

  describe('an Amex row', () => {
    it('reads the three long-export columns', () => {
      expect(
        parseRawRowForeignFields(
          amexRow({ 'Foreign Spend Amount': '5.50 USD', Commission: '0.27', Country: 'SINGAPORE' })
        )
      ).toEqual({
        country: 'SG',
        foreignCharge: { amountMinor: 550, currency: 'USD', feeCents: 27 },
        unreadable: false,
        captureSource: 'amex-columns',
      });
    });

    it('keeps the country of a domestic long-export row', () => {
      // A domestic row with a country is distinguishable from one imported
      // before this capture existed; a foreign-only country would not be.
      expect(parseRawRowForeignFields(amexRow({ Country: 'AUSTRALIA' }))).toEqual({
        country: 'AU',
        foreignCharge: undefined,
        unreadable: false,
        captureSource: 'amex-columns',
      });
    });

    it('yields no country for a name the map does not know', () => {
      expect(parseRawRowForeignFields(amexRow({ Country: 'ATLANTIS' })).country).toBeUndefined();
    });

    it('flags a foreign spend with no commission as unreadable', () => {
      // The fee is the figure this capture exists to surface. Defaulting it to
      // zero would report a foreign charge as free to convert.
      expect(
        parseRawRowForeignFields(amexRow({ 'Foreign Spend Amount': '5.50 USD', Commission: '' }))
      ).toMatchObject({ foreignCharge: undefined, unreadable: true });
    });

    it('flags an unreadable foreign spend shape', () => {
      expect(
        parseRawRowForeignFields(
          amexRow({ 'Foreign Spend Amount': 'USD 5.50', Commission: '0.27' })
        )
      ).toMatchObject({ unreadable: true });
    });
  });

  describe('a shape with nothing to recover', () => {
    it('leaves the short four-column Amex export alone without flagging it', () => {
      // The columns are absent, not empty. There is no claim to fail on, so
      // this must not abort a migration that has nothing to do here.
      const short = JSON.stringify({
        Date: '12/07/2026',
        'Date Processed': '13/07/2026',
        Description: 'MERCHANT',
        Amount: '148.63',
      });
      expect(parseRawRowForeignFields(short)).toEqual({ unreadable: false });
    });

    it.each([['not json'], ['[]'], ['null'], ['"a string"']])('ignores %s', (rawRow) => {
      expect(parseRawRowForeignFields(rawRow)).toEqual({ unreadable: false });
    });
  });

  describe('an ANZ PDF statement line', () => {
    const line =
      '13/06/2026 12/06/2026 1234 GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD 148.63 1,234.56';

    it('recovers the same fields the PDF importer derived from the line', () => {
      expect(
        parseRawRowForeignFields(JSON.stringify({ source: 'anz-pdf-statement', line }))
      ).toEqual({
        country: 'US',
        foreignCharge: { amountMinor: 10_000, currency: 'USD', feeCents: 503 },
        unreadable: false,
        captureSource: 'anz-descriptor',
      });
    });

    it('ignores a stored line that is not a transaction row', () => {
      expect(
        parseRawRowForeignFields(
          JSON.stringify({ source: 'anz-pdf-statement', line: 'CLOSING BALANCE 1,234.56' })
        )
      ).toEqual({ unreadable: false });
    });
  });
});

describe('rawRowForeignField', () => {
  const row = anzRow('GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD');

  it.each([
    ['amount_minor', 10_000],
    ['currency', 'USD'],
    ['fee_cents', 503],
    ['country', 'US'],
    ['unreadable', 0],
  ])('returns %s as a SQLite scalar', (field, expected) => {
    expect(rawRowForeignField(row, field)).toBe(expected);
  });

  it('reports a non-string raw_row as carrying nothing rather than as unreadable', () => {
    expect(rawRowForeignField(null, 'currency')).toBeNull();
    expect(rawRowForeignField(null, 'unreadable')).toBe(0);
  });

  it('throws on a field name the migration does not use', () => {
    expect(() => rawRowForeignField(row, 'exchange_rate')).toThrow(/unknown field/);
  });
});
