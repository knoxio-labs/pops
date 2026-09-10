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

  /**
   * A naive cell used to be resolved against the HOST timezone and baked in
   * by `.toISOString()`, so the same export file ingested on a Sydney laptop
   * and in a UTC container produced `ordered_at` values eleven hours apart —
   * and nothing downstream noticed, because the value is plausible, it sorts
   * correctly, and `canonicalInstant` at the DB boundary is handed an
   * already-`Z` string (POPS-2533).
   *
   * The reproduction the ticket asked for is the process timezone, so that is
   * what these set. Trusting whatever the CI runner happens to use would make
   * this pass on a UTC runner against the unfixed parser.
   */
  describe('a timestamp that names no zone', () => {
    const NAIVE = ['2026-02-02T01:41:21', '2026-02-02 01:41:21', '2026-02-02T01:41:21.123'];

    function withTimeZone<T>(zone: string, run: () => T): T {
      const before = process.env.TZ;
      process.env.TZ = zone;
      try {
        return run();
      } finally {
        process.env.TZ = before;
      }
    }

    it('is refused, rather than read as the host meant it', () => {
      for (const naive of NAIVE) {
        expect(readTimestamp(naive), naive).toBeNull();
      }
    });

    it('is refused identically in Sydney and in UTC', () => {
      for (const naive of NAIVE) {
        const sydney = withTimeZone('Australia/Sydney', () => readTimestamp(naive));
        const utc = withTimeZone('UTC', () => readTimestamp(naive));
        expect(sydney, naive).toBe(utc);
      }
    });

    it('still reads every zoned spelling, in either timezone', () => {
      const zoned = [
        '2026-02-02T01:41:21Z',
        // Lowercase, which ISO-8601 allows and a case-sensitive check misses.
        '2026-02-02T01:41:21z',
        '2026-02-02T01:41:21+10:00',
        '2026-02-02T01:41:21+1000',
        '2026-02-02T01:41:21-05:00',
      ];

      for (const value of zoned) {
        const sydney = withTimeZone('Australia/Sydney', () => readTimestamp(value));
        const utc = withTimeZone('UTC', () => readTimestamp(value));
        // Both halves: a parser that refused these would be "deterministic"
        // by dropping every row, which is the wrong kind of agreement.
        expect(sydney, value).not.toBeNull();
        expect(sydney, value).toBe(utc);
      }
    });

    it('still drops a zoned cell V8 cannot parse', () => {
      // The zone check runs first now, so this is the only route left to the
      // Invalid Date arm behind it. Without a case that reaches it, that arm
      // is dead code the coverage number would quietly stop counting.
      expect(readTimestamp('2026-13-45T99:99:99Z')).toBeNull();
      expect(readTimestamp('the third of never+00:00')).toBeNull();
    });

    it('drops an hours-only offset, which reads as naive because V8 cannot parse it', () => {
      // `+10` is a legal ISO-8601 offset and `new Date` returns Invalid Date
      // for it, so the row is dropped either way. Asserted so nobody widens
      // the zone check to admit a spelling the parser behind it refuses.
      expect(readTimestamp('2026-02-02T01:41:21+10')).toBeNull();
      expect(new Date('2026-02-02T01:41:21+10').getTime()).toBeNaN();
    });

    it('still reports a concatenated cell it refuses', () => {
      const result = readTimestampWithAnomaly('2026-02-02T01:41:21 and 2026-02-04T01:41:21');

      expect(result.value).toBeNull();
      expect(result.concatenated).toBe(true);
    });
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
