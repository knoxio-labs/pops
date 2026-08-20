/**
 * Tests for the ANZ fixed-width description parser.
 *
 * The shapes exercised here were taken from a real 3231-row ANZ credit-card
 * export spanning two years; the counts quoted in the test names are that
 * file's, and they are what the parser was measured against.
 */
import { describe, expect, it } from 'vitest';

import { parseAnzDescription } from '../anz-description.js';

describe('parseAnzDescription', () => {
  describe('the fixed-width split', () => {
    it('separates merchant from suburb at the padded boundary', () => {
      expect(parseAnzDescription('ALDI STORES - MARRICKV    MARRICKVILLE')).toEqual({
        description: 'ALDI STORES - MARRICKV',
        location: 'Marrickville',
      });
    });

    it('keeps a merchant that fills the column and is separated by a single space', () => {
      // Only one space remains, so a "split on 2+ spaces" rule silently keeps
      // the suburb glued to the merchant here.
      expect(parseAnzDescription('WOOLWORTHS/2A CHARLES STR CANTERBURY')).toEqual({
        description: 'WOOLWORTHS/2A CHARLES STR',
        location: 'Canterbury',
      });
    });

    it('preserves a merchant name containing its own double space', () => {
      // The regression that motivates the fixed offset: splitting on a run of
      // spaces truncates this to "GITHUB".
      const parsed = parseAnzDescription(
        'GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD'
      );
      expect(parsed.description).toBe('GITHUB INC.');
    });

    it('title-cases a multi-word suburb', () => {
      expect(parseAnzDescription('HJs St Peters             ST PETERS')).toEqual({
        description: 'HJs St Peters',
        location: 'St Peters',
      });
    });

    it('does not treat a dot as a word boundary when title-casing a domain', () => {
      expect(
        parseAnzDescription('NOTION LABS  INC.         NOTION.SO  26.40  USD 1.32 AUD').location
      ).toBe('Notion.so');
    });
  });

  describe('rows the fixed-width layout does not apply to', () => {
    it('keeps a bank narrative that runs through the boundary intact', () => {
      // 29 chars, so the boundary character is a letter, not padding. Splitting
      // blindly would store "INTEREST CHARGED ON PURCH" with location "ASES".
      expect(parseAnzDescription('INTEREST CHARGED ON PURCHASES')).toEqual({
        description: 'INTEREST CHARGED ON PURCHASES',
      });
    });

    it.each(['PAYMENT THANKYOU 754244', 'ANNUAL FEE', 'LATE FEE REVERSAL', 'REWARD PROGRAM FEE'])(
      'gives %s no location',
      (narrative) => {
        expect(parseAnzDescription(narrative)).toEqual({ description: narrative });
      }
    );
  });

  describe('detail fields that are not places', () => {
    it.each([
      ['PP*HUMBLEBUNDL HUMBLEBUND 4029357733', 'PP*HUMBLEBUNDL HUMBLEBUND'],
      ['PAYPAL *STEAM             36607', 'PAYPAL *STEAM'],
      ['UBER   *TRIP              1800073263', 'UBER *TRIP'],
      ['STEAMGAMES.COM 4259522985 912-1844160', 'STEAMGAMES.COM 4259522985'],
    ])('drops the merchant phone/terminal id in %s', (raw, description) => {
      const parsed = parseAnzDescription(raw);
      expect(parsed.description).toBe(description);
      expect(parsed.location).toBeUndefined();
    });

    it('keeps a detail field that merely contains digits alongside letters', () => {
      expect(parseAnzDescription('NEXT DIRECT               WWW2.NEXT.CO.').location).toBe(
        'Www2.next.co.'
      );
    });
  });

  describe('foreign-currency charges', () => {
    it('splits location, country and the fx detail', () => {
      expect(
        parseAnzDescription('GITHUB  INC.              GITHUB.COM  100.00  USD 5.03 AUD')
      ).toEqual({
        description: 'GITHUB INC.',
        location: 'Github.com',
        country: 'US',
        foreignCharge: { amountMinor: 10_000, currency: 'USD', feeCents: 503 },
      });
    });

    it('reads a zero-decimal amount whose thousands are space-separated', () => {
      // 51 of the file's 197 foreign charges are JPY/KRW, where ANZ writes
      // "1 100" rather than "1,100". A `[\d,.]+` amount pattern misses them all
      // and the row silently falls through to being treated as a plain suburb.
      expect(parseAnzDescription('AOMORI GROCER             AOMORI  1 100  JPY 0.40 AUD')).toEqual({
        description: 'AOMORI GROCER',
        location: 'Aomori',
        country: 'JP',
        // JPY has no minor unit, so 1 100 is 1100 — not 110000.
        foreignCharge: { amountMinor: 1100, currency: 'JPY', feeCents: 40 },
      });
    });

    it('handles a location that itself contains a double space', () => {
      const parsed = parseAnzDescription(
        'SOME MERCHANT LTD         WEYBRIDGE  SU  10.00  GBP 0.34 AUD'
      );
      expect(parsed.location).toBe('Weybridge Su');
      expect(parsed.foreignCharge).toEqual({ amountMinor: 1000, currency: 'GBP', feeCents: 34 });
    });

    it('rejects a phone number sitting in the location slot of a foreign charge', () => {
      // A foreign charge can carry a merchant phone where a domestic one
      // carries a suburb, so the non-place test has to run on both branches —
      // checking only the domestic branch stores "(888)850-3958" as a place.
      const parsed = parseAnzDescription(
        'BKG*BOOKING.COM HOTEL     (888)850-3958  35 340  JPY 13.40 AUD'
      );
      expect(parsed.location).toBeUndefined();
      expect(parsed).toMatchObject({
        description: 'BKG*BOOKING.COM HOTEL',
        country: 'JP',
        foreignCharge: { amountMinor: 35_340, currency: 'JPY', feeCents: 1340 },
      });
    });

    it('scales from the currency, not from how many decimals ANZ printed', () => {
      // Reading the scale off the string would make this $1.00 instead of $100.
      const parsed = parseAnzDescription('ROUND MERCHANT            NEW YORK  100  USD 3.00 AUD');
      expect(parsed.foreignCharge).toEqual({ amountMinor: 10_000, currency: 'USD', feeCents: 300 });
    });

    it('recovers no charge from a currency whose minor-unit scale is unknown', () => {
      // Guessing a power of ten is worse than leaving the columns null: the
      // statement line itself still survives on the transaction's rawRow.
      const parsed = parseAnzDescription(
        'ODD MERCHANT              SOMEWHERE  10.00  ZZZ 0.34 AUD'
      );
      expect(parsed.foreignCharge).toBeUndefined();
      expect(parsed.location).toBe('Somewhere');
    });

    it('leaves country unset for a currency spanning many countries', () => {
      const parsed = parseAnzDescription('EU MERCHANT               DUBLIN 4  14.99  EUR 0.75 AUD');
      expect(parsed.country).toBeUndefined();
      expect(parsed.foreignCharge).toEqual({ amountMinor: 1499, currency: 'EUR', feeCents: 75 });
    });
  });

  describe('input hygiene', () => {
    it('tolerates the CRLF the export ships with', () => {
      expect(parseAnzDescription('COLES 4166                MARRICKVILLE\r')).toEqual({
        description: 'COLES 4166',
        location: 'Marrickville',
      });
    });

    it('never returns an empty description for a padded row of only spaces', () => {
      expect(parseAnzDescription(' '.repeat(30) + 'SYDNEY').description).toBe('SYDNEY');
    });

    it('returns an empty description only for empty input', () => {
      expect(parseAnzDescription('')).toEqual({ description: '' });
    });
  });
});
