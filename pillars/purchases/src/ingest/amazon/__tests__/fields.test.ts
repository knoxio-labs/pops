import { describe, expect, it } from 'vitest';

import {
  readCarrierAndTracking,
  readCents,
  readQuantity,
  readText,
  readTimestamp,
  readTimestampWithAnomaly,
} from '../fields.js';

describe('readText', () => {
  it('folds both of Amazon absence sentinels to null', () => {
    expect(readText('Not Available')).toBeNull();
    expect(readText('Not Applicable')).toBeNull();
  });

  it('does not treat a sentinel-like product name as absent', () => {
    expect(readText('Not Available Anymore Ltd')).toBe('Not Available Anymore Ltd');
  });

  it('trims, and treats an empty cell as absent', () => {
    expect(readText('  padded  ')).toBe('padded');
    expect(readText('')).toBeNull();
    expect(readText(undefined)).toBeNull();
  });
});

describe('readCents', () => {
  it('parses plain decimals to integer cents', () => {
    expect(readCents('20.00')).toBe(2000);
    expect(readCents('0')).toBe(0);
    expect(readCents('11.25')).toBe(1125);
  });

  it('strips the literal apostrophes Amazon wraps discounts in', () => {
    expect(readCents("'-1.6'")).toBe(-160);
    expect(readCents("'-5.5'")).toBe(-550);
  });

  it('keeps a single-digit fraction as tenths, not hundredths', () => {
    // The trap: "-1.6" is -160 cents, not -16.
    expect(readCents('1.6')).toBe(160);
  });

  it('does not lose cents to binary floating point', () => {
    // 0.1 + 0.2 territory. Every one of these must be exact, because
    // subset-sum in the reconciliation ladder is only correct over integers.
    expect(readCents('1146.55')).toBe(114655);
    expect(readCents('0.07')).toBe(7);
    expect(readCents('8.29')).toBe(829);
  });

  it('rounds a third decimal place rather than truncating it', () => {
    expect(readCents('1.005')).toBe(101);
    expect(readCents('1.004')).toBe(100);
  });

  it('reads a thousands-separated value, apostrophes and all', () => {
    // A real BRL row states '1,495'. Rejecting it dropped the line and its
    // money out of the order without a trace.
    expect(readCents("'1,495'")).toBe(149500);
    expect(readCents('1,234,567.89')).toBe(123456789);
  });

  it('refuses a comma that might be a decimal separator', () => {
    // "1,49" is one-forty-nine in a decimal-comma locale. Reading it as 149
    // is a hundredfold error, so it stays unparseable and gets reported.
    expect(readCents('1,49')).toBeNull();
    expect(readCents('1,4956')).toBeNull();
  });

  it('returns null for sentinels and unparseable text', () => {
    expect(readCents('Not Available')).toBeNull();
    expect(readCents('$20.00')).toBeNull();
    expect(readCents('abc')).toBeNull();
  });
});

describe('readTimestamp', () => {
  it('normalises both formats the export emits', () => {
    expect(readTimestamp('2025-12-09T04:32:16Z')).toBe('2025-12-09T04:32:16.000Z');
    expect(readTimestamp('2025-12-09T04:32:16.123Z')).toBe('2025-12-09T04:32:16.123Z');
  });

  it('takes the first of two concatenated timestamps and says so', () => {
    const result = readTimestampWithAnomaly('2025-08-02T00:00:00Z and 2025-08-04T00:00:00Z');
    expect(result.value).toBe('2025-08-02T00:00:00.000Z');
    expect(result.concatenated).toBe(true);
  });

  it('reports no anomaly for an ordinary timestamp', () => {
    expect(readTimestampWithAnomaly('2025-08-02T00:00:00Z').concatenated).toBe(false);
  });

  it('returns null rather than an Invalid Date', () => {
    expect(readTimestamp('Not Available')).toBeNull();
    expect(readTimestamp('nonsense')).toBeNull();
  });
});

describe('readQuantity', () => {
  it('preserves zero, which cancelled lines really carry', () => {
    expect(readQuantity('0')).toBe(0);
  });

  it('parses ordinary quantities and rejects non-integers', () => {
    expect(readQuantity('3')).toBe(3);
    expect(readQuantity('1.5')).toBeNull();
    expect(readQuantity('Not Available')).toBeNull();
  });
});

describe('readCarrierAndTracking', () => {
  it('splits the packed carrier(tracking) cell', () => {
    expect(readCarrierAndTracking('AMZL_AU(TBA000000000001)')).toEqual({
      carrier: 'AMZL_AU',
      trackingNumber: 'TBA000000000001',
    });
  });

  it('handles a carrier name containing spaces', () => {
    expect(readCarrierAndTracking('Australia Post(AP000000000001)')).toEqual({
      carrier: 'Australia Post',
      trackingNumber: 'AP000000000001',
    });
  });

  it('keeps a bare carrier with no tracking', () => {
    expect(readCarrierAndTracking('Australia Post')).toEqual({
      carrier: 'Australia Post',
      trackingNumber: null,
    });
  });

  it('returns both null for the sentinel', () => {
    expect(readCarrierAndTracking('Not Available')).toEqual({
      carrier: null,
      trackingNumber: null,
    });
  });
});
