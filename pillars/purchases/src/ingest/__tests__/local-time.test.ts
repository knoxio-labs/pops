import { afterEach, describe, expect, it } from 'vitest';

import {
  calendarDateInZone,
  instantFromLocalParts,
  instantFromLocalPartsAtOffset,
  isKnownTimeZone,
  storeTimeZone,
  utcOffsetMinutesAt,
} from '../local-time.js';

const ZONE_VAR = 'PURCHASES_TIME_ZONE';

afterEach(() => {
  delete process.env[ZONE_VAR];
});

describe('storeTimeZone', () => {
  it('defaults to Australia/Sydney when unset', () => {
    expect(storeTimeZone()).toBe('Australia/Sydney');
  });

  it('defaults to Australia/Sydney when set to the empty string', () => {
    process.env[ZONE_VAR] = '';
    expect(storeTimeZone()).toBe('Australia/Sydney');
  });

  it('honours an override', () => {
    process.env[ZONE_VAR] = 'America/Chicago';
    expect(storeTimeZone()).toBe('America/Chicago');
  });
});

describe('isKnownTimeZone', () => {
  it('accepts a real IANA zone', () => {
    expect(isKnownTimeZone('Australia/Sydney')).toBe(true);
  });

  it('accepts an alias that links to a real zone', () => {
    expect(isKnownTimeZone('Australia/Canberra')).toBe(true);
  });

  it('rejects null, undefined and the empty string without asking the runtime', () => {
    expect(isKnownTimeZone(null)).toBe(false);
    expect(isKnownTimeZone(undefined)).toBe(false);
    expect(isKnownTimeZone('')).toBe(false);
  });

  it('rejects an invented zone', () => {
    expect(isKnownTimeZone('Nowhere/Imaginary')).toBe(false);
  });
});

describe('instantFromLocalParts', () => {
  it('resolves a Sydney reading to its UTC instant (east of Greenwich)', () => {
    const instant = instantFromLocalParts(
      { year: 2026, month: 8, day: 1, hour: 14, minute: 32 },
      'Australia/Sydney'
    );
    expect(instant).toBe('2026-08-01T04:32:00.000Z');
  });

  it('resolves a New York reading to its UTC instant (west of Greenwich)', () => {
    const instant = instantFromLocalParts(
      { year: 2026, month: 8, day: 1, hour: 9, minute: 0 },
      'America/New_York'
    );
    expect(instant).toBe('2026-08-01T13:00:00.000Z');
  });

  it('resolves a UTC reading unchanged (the "GMT" longOffset name)', () => {
    const instant = instantFromLocalParts(
      { year: 2026, month: 8, day: 1, hour: 9, minute: 0 },
      'UTC'
    );
    expect(instant).toBe('2026-08-01T09:00:00.000Z');
  });

  it('rejects a receipt hour that does not round-trip (25:00)', () => {
    expect(instantFromLocalParts({ year: 2026, month: 8, day: 1, hour: 25, minute: 0 })).toBeNull();
  });

  it('rejects a receipt date that does not round-trip (31 February)', () => {
    expect(instantFromLocalParts({ year: 2026, month: 2, day: 31, hour: 9, minute: 0 })).toBeNull();
  });

  it('uses storeTimeZone() when no zone is given', () => {
    process.env[ZONE_VAR] = 'UTC';
    const instant = instantFromLocalParts({ year: 2026, month: 8, day: 1, hour: 9, minute: 0 });
    expect(instant).toBe('2026-08-01T09:00:00.000Z');
  });

  it('crosses a DST boundary correctly (Sydney AEST → AEDT, 4 Oct 2026)', () => {
    const before = instantFromLocalParts(
      { year: 2026, month: 10, day: 3, hour: 9, minute: 0 },
      'Australia/Sydney'
    );
    const after = instantFromLocalParts(
      { year: 2026, month: 10, day: 10, hour: 9, minute: 0 },
      'Australia/Sydney'
    );
    expect(before).toBe('2026-10-02T23:00:00.000Z');
    expect(after).toBe('2026-10-09T22:00:00.000Z');
  });

  it('re-derives the offset when the first guess lands on the wrong side of a transition', () => {
    // 1am on 4 Oct 2026 is still AEST (+10); clocks jump at 2am. The naive
    // UTC reading of those parts falls in the Sydney afternoon, where the
    // offset is already AEDT (+11), so the first guess is an hour out and
    // only the second pass gets it right. This is the case the two-pass
    // derivation exists for.
    expect(
      instantFromLocalParts(
        { year: 2026, month: 10, day: 4, hour: 1, minute: 0 },
        'Australia/Sydney'
      )
    ).toBe('2026-10-03T15:00:00.000Z');
  });
});

describe('calendarDateInZone', () => {
  it('reads the local day, not the UTC one', () => {
    // The whole point: 23:41 UTC on the 2nd is the morning of the 3rd in
    // Sydney, and a consumer storing a day rather than a moment gets the
    // wrong one for every evening purchase if this is derived in UTC.
    expect(calendarDateInZone('2026-02-02T23:41:21.000Z', 'Australia/Sydney')).toBe('2026-02-03');
  });

  it('reads it the other way for a zone behind UTC', () => {
    expect(calendarDateInZone('2026-02-02T01:41:21.000Z', 'America/Chicago')).toBe('2026-02-01');
  });

  it('pads the month and the day to two digits', () => {
    // `yyyy-mm-dd` is what an `<input type="date">` accepts; `2026-2-3` is
    // sanitised to the empty string by the DOM rather than rejected.
    expect(calendarDateInZone('2026-02-03T04:00:00.000Z', 'Australia/Sydney')).toBe('2026-02-03');
  });

  it('follows the zone override when no zone is named', () => {
    process.env[ZONE_VAR] = 'America/Chicago';
    expect(calendarDateInZone('2026-02-02T01:41:21.000Z')).toBe('2026-02-01');
  });

  it('answers null rather than guessing at something that is not an instant', () => {
    expect(calendarDateInZone('not-a-date')).toBeNull();
    expect(calendarDateInZone('')).toBeNull();
  });
});

describe('instantFromLocalPartsAtOffset', () => {
  const noon = { year: 2026, month: 3, day: 1, hour: 12, minute: 0 };

  it('subtracts the stated offset rather than consulting a zone', () => {
    // The camera and the phone both state an offset and neither names a
    // zone, so there is no DST rule to apply and none is applied.
    expect(instantFromLocalPartsAtOffset(noon, 600)).toBe('2026-03-01T02:00:00.000Z');
    expect(instantFromLocalPartsAtOffset(noon, 0)).toBe('2026-03-01T12:00:00.000Z');
    expect(instantFromLocalPartsAtOffset(noon, -300)).toBe('2026-03-01T17:00:00.000Z');
  });

  it('refuses an offset no place on earth has', () => {
    // An EXIF tag is bytes off a memory card, so this is arithmetic on a
    // number a file claimed. Shifting a reading by three days because the
    // tag was garbage would look like a real purchase on the wrong date.
    expect(instantFromLocalPartsAtOffset(noon, 5000)).toBeNull();
    expect(instantFromLocalPartsAtOffset(noon, -5000)).toBeNull();
  });

  it('refuses parts that are not a real moment', () => {
    expect(instantFromLocalPartsAtOffset({ ...noon, month: 13 }, 600)).toBeNull();
    expect(instantFromLocalPartsAtOffset({ ...noon, day: 32 }, 600)).toBeNull();
    expect(instantFromLocalPartsAtOffset({ ...noon, hour: 24 }, 600)).toBeNull();
  });
});

describe('utcOffsetMinutesAt', () => {
  it('recovers the offset the instant was resolved against', () => {
    // What `instantFromLocalParts` works out and then throws away: its
    // answer is UTC-spelled, so without this a consumer can name the
    // reading's calendar day in Greenwich and nowhere else.
    expect(utcOffsetMinutesAt('2026-02-02T23:41:21.000Z', 'Australia/Sydney')).toBe(660);
    expect(utcOffsetMinutesAt('2026-06-02T23:41:21.000Z', 'Australia/Sydney')).toBe(600);
    expect(utcOffsetMinutesAt('2026-02-02T01:41:21.000Z', 'America/Chicago')).toBe(-360);
  });

  it('reads a zone sitting exactly on UTC as zero rather than as a failure', () => {
    // `longOffset` prints a bare `GMT` for these, with no `+00:00` to parse.
    // Its own branch, and reading it as unparseable would make every UTC
    // deployment answer null for a question it can answer.
    expect(utcOffsetMinutesAt('2026-03-01T00:00:00Z', 'UTC')).toBe(0);
    expect(utcOffsetMinutesAt('2026-03-01T00:00:00Z', 'Etc/GMT')).toBe(0);
  });

  it('returns null for a string that names no moment', () => {
    expect(utcOffsetMinutesAt('not a date', 'Australia/Sydney')).toBeNull();
    expect(utcOffsetMinutesAt('', 'Australia/Sydney')).toBeNull();
  });

  it('follows the zone override when no zone is named', () => {
    process.env[ZONE_VAR] = 'America/Chicago';
    expect(utcOffsetMinutesAt('2026-02-02T01:41:21.000Z')).toBe(-360);
  });
});
