import { afterEach, describe, expect, it } from 'vitest';

import { defaultRange, isoMondayFor, todayIso } from './range-helpers';

/**
 * `todayIso`/`defaultRange`/`isoMondayFor` used to read the LOCAL `Date`
 * argument through UTC getters, so for every hour local time runs ahead of
 * UTC's date boundary (about ten a day in AEST, more in AEDT) the returned
 * ISO day was the previous day — exactly the morning window someone plans a
 * shop. This suite fixes a small set of real instants, renders each one in
 * several zones, and checks the local calendar day comes out right on both
 * sides of the UTC boundary.
 */

const ORIGINAL_TZ = process.env['TZ'];

afterEach(() => {
  if (ORIGINAL_TZ === undefined) {
    delete process.env['TZ'];
  } else {
    process.env['TZ'] = ORIGINAL_TZ;
  }
});

function inZone<T>(tz: string, fn: () => T): T {
  process.env['TZ'] = tz;
  try {
    return fn();
  } finally {
    if (ORIGINAL_TZ === undefined) {
      delete process.env['TZ'];
    } else {
      process.env['TZ'] = ORIGINAL_TZ;
    }
  }
}

describe('the fixtures this suite depends on', () => {
  it('really does land before the UTC day boundary in Sydney (AEST repro from POPS-3167)', () => {
    inZone('Australia/Sydney', () => {
      const instant = new Date('2026-09-07T21:00:00Z');
      expect(instant.toISOString().slice(0, 10)).toBe('2026-09-07');
      expect(instant.getDate()).toBe(8);
    });
  });

  it('really does land after the UTC day boundary in New York', () => {
    inZone('America/New_York', () => {
      const instant = new Date('2026-09-07T02:00:00Z');
      expect(instant.toISOString().slice(0, 10)).toBe('2026-09-07');
      expect(instant.getDate()).toBe(6);
    });
  });
});

/** 07:00 AEST on 2026-09-08 — the exact reproduction from the ticket. */
const AEST_MORNING = new Date('2026-09-07T21:00:00Z');

/** 07:00 AEST on Monday 2026-09-07, while UTC is still Sunday 2026-09-06. */
const AEST_MONDAY_MORNING = new Date('2026-09-06T21:00:00Z');

/** 22:00 EDT on Sunday 2026-09-06, while UTC has already rolled to Monday. */
const NY_LATE_SUNDAY_NIGHT = new Date('2026-09-07T02:00:00Z');

/** Midday UTC: every offset tested here lands on the same calendar day. */
const NEUTRAL_NOON_UTC = new Date('2026-06-15T12:00:00Z');

describe('todayIso', () => {
  it('reads the Sydney local day, not the UTC day, at 07:00 AEST (the ticket repro)', () => {
    inZone('Australia/Sydney', () => {
      expect(todayIso(AEST_MORNING)).toBe('2026-09-08');
    });
  });

  it('agrees with UTC when the viewer is on UTC', () => {
    inZone('UTC', () => {
      expect(todayIso(AEST_MORNING)).toBe('2026-09-07');
    });
  });

  it('reads the New York local day, one day behind UTC, at 22:00 EDT', () => {
    inZone('America/New_York', () => {
      expect(todayIso(NY_LATE_SUNDAY_NIGHT)).toBe('2026-09-06');
    });
  });

  it('agrees across Sydney, UTC and New York at a neutral midday-UTC instant', () => {
    expect(inZone('Australia/Sydney', () => todayIso(NEUTRAL_NOON_UTC))).toBe('2026-06-15');
    expect(inZone('UTC', () => todayIso(NEUTRAL_NOON_UTC))).toBe('2026-06-15');
    expect(inZone('America/New_York', () => todayIso(NEUTRAL_NOON_UTC))).toBe('2026-06-15');
  });
});

describe('defaultRange', () => {
  it('starts on the Sydney local day at 07:00 AEST, not the day before', () => {
    inZone('Australia/Sydney', () => {
      expect(defaultRange(AEST_MORNING)).toEqual({ start: '2026-09-08', end: '2026-09-14' });
    });
  });

  it('starts on the New York local day at 22:00 EDT', () => {
    inZone('America/New_York', () => {
      expect(defaultRange(NY_LATE_SUNDAY_NIGHT)).toEqual({
        start: '2026-09-06',
        end: '2026-09-12',
      });
    });
  });
});

describe('isoMondayFor', () => {
  it('does not fall back to last week when Sydney has already rolled to Monday but UTC has not', () => {
    inZone('Australia/Sydney', () => {
      expect(isoMondayFor(AEST_MONDAY_MORNING)).toBe('2026-09-07');
    });
  });

  it('agrees with UTC when the viewer is on UTC at the same instant', () => {
    inZone('UTC', () => {
      expect(isoMondayFor(AEST_MONDAY_MORNING)).toBe('2026-08-31');
    });
  });

  it('does not jump ahead to this week when New York is still on last Sunday but UTC has already rolled over', () => {
    inZone('America/New_York', () => {
      expect(isoMondayFor(NY_LATE_SUNDAY_NIGHT)).toBe('2026-08-31');
    });
  });

  it('agrees across Sydney, UTC and New York at a neutral midday-UTC instant', () => {
    expect(inZone('Australia/Sydney', () => isoMondayFor(NEUTRAL_NOON_UTC))).toBe('2026-06-15');
    expect(inZone('UTC', () => isoMondayFor(NEUTRAL_NOON_UTC))).toBe('2026-06-15');
    expect(inZone('America/New_York', () => isoMondayFor(NEUTRAL_NOON_UTC))).toBe('2026-06-15');
  });
});
