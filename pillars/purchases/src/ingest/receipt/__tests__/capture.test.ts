/**
 * Which clock the purchase date comes from, and which clocks are not believed.
 *
 * The ranking is cheap to state and easy to get subtly wrong, so it is
 * asserted directly rather than only through the mapper: client over EXIF,
 * both over the upload, and none of them at all when the moment they name
 * could not have happened.
 *
 * The implausible cases are the reason this module exists. A receipt dated
 * 2041 is not a cosmetic defect — it never lands inside a reconciliation
 * window again.
 */
import { describe, expect, it } from 'vitest';

import {
  CLOCK_SKEW_ALLOWANCE_MS,
  captureInstant,
  captureLocation,
  exifCaptureInstant,
  plausibleCaptureInstant,
} from '../capture.js';
import { NO_EXIF } from '../exif.js';

import type { ReceiptCapture } from '../capture.js';
import type { ExifCaptureTime, ExifReading } from '../exif.js';

const UPLOADED_AT = '2026-08-01T05:00:00.000Z';
const ZONE = 'Australia/Sydney';

const exifAt = (
  parts: Partial<ExifCaptureTime> & Pick<ExifCaptureTime, 'year' | 'month' | 'day'>
): ExifCaptureTime => ({
  hour: 12,
  minute: 0,
  offsetMinutes: null,
  ...parts,
});

const capture = (parts: Partial<ReceiptCapture>): ReceiptCapture => ({
  capturedAt: null,
  timeZone: null,
  exif: NO_EXIF,
  ...parts,
});

/** A reading that states a time and no place. */
const timeOnly = (time: ExifCaptureTime): ExifReading => ({ time, location: null });

describe('a moment the device says it captured at', () => {
  it('is normalised to UTC so two spellings of it compare equal', () => {
    // `orderedAt` is compared as an instant elsewhere in the pillar. Storing
    // `+10:00` for one upload and `Z` for another would make an equality
    // check on the column answer no for the same moment.
    expect(plausibleCaptureInstant('2026-08-01T14:30:00+10:00', UPLOADED_AT)).toBe(
      '2026-08-01T04:30:00.000Z'
    );
  });

  it('is rejected when it is not a timestamp at all', () => {
    expect(plausibleCaptureInstant('yesterday afternoon', UPLOADED_AT)).toBeNull();
  });

  it('is rejected when nothing was supplied', () => {
    expect(plausibleCaptureInstant(null, UPLOADED_AT)).toBeNull();
    expect(plausibleCaptureInstant(undefined, UPLOADED_AT)).toBeNull();
    expect(plausibleCaptureInstant('', UPLOADED_AT)).toBeNull();
  });
});

describe('a clock this fleet does not own', () => {
  it('refuses a capture years in the future', () => {
    // The failure mode with teeth. A 2041 purchase sits outside every
    // reconciliation window forever and skews any unbounded spend total.
    expect(plausibleCaptureInstant('2041-03-02T09:00:00Z', UPLOADED_AT)).toBeNull();
  });

  it('refuses a capture from a device whose clock reset to the epoch', () => {
    expect(plausibleCaptureInstant('1970-01-01T00:00:00Z', UPLOADED_AT)).toBeNull();
  });

  it('refuses a capture from before the floor', () => {
    expect(plausibleCaptureInstant('1999-12-31T23:59:59Z', UPLOADED_AT)).toBeNull();
    expect(plausibleCaptureInstant('2000-01-01T00:00:00Z', UPLOADED_AT)).toBe(
      '2000-01-01T00:00:00.000Z'
    );
  });

  it('allows a drifting clock a day, and no more', () => {
    const justInside = new Date(
      Date.parse(UPLOADED_AT) + CLOCK_SKEW_ALLOWANCE_MS - 1000
    ).toISOString();
    const justOutside = new Date(
      Date.parse(UPLOADED_AT) + CLOCK_SKEW_ALLOWANCE_MS + 1000
    ).toISOString();

    expect(plausibleCaptureInstant(justInside, UPLOADED_AT)).toBe(justInside);
    expect(plausibleCaptureInstant(justOutside, UPLOADED_AT)).toBeNull();
  });
});

describe('a capture time read off the photograph', () => {
  it('uses the camera offset when it recorded one, and consults no zone', () => {
    const instant = exifCaptureInstant(
      exifAt({ year: 2026, month: 8, day: 1, hour: 14, minute: 32, offsetMinutes: 600 }),
      // A zone deliberately unlike the offset. The offset is already an
      // answer; a zone applied on top of it would be a second correction.
      'Europe/Paris'
    );

    expect(instant).toBe('2026-08-01T04:32:00.000Z');
  });

  it("places a bare wall clock with the receipt's own resolved zone", () => {
    const instant = exifCaptureInstant(
      exifAt({ year: 2026, month: 8, day: 1, hour: 14, minute: 32 }),
      ZONE
    );

    // Sydney is +10:00 in August.
    expect(instant).toBe('2026-08-01T04:32:00.000Z');
  });

  it('refuses a wall clock that names no real day', () => {
    // `0000:00:00 00:00:00` is what several cameras write for "unset", and
    // it parses as digits perfectly well.
    expect(exifCaptureInstant(exifAt({ year: 0, month: 0, day: 0, hour: 0 }), ZONE)).toBeNull();
    expect(exifCaptureInstant(exifAt({ year: 2026, month: 2, day: 31 }), ZONE)).toBeNull();
  });

  it('is nothing at all when the photograph carried none', () => {
    expect(exifCaptureInstant(null, ZONE)).toBeNull();
  });
});

describe('the ranking', () => {
  it('prefers what the client said to what the photograph says', () => {
    // The client is the only source that can be certain it is describing
    // this upload. EXIF may belong to a photograph taken a week earlier.
    const resolved = captureInstant(
      capture({
        capturedAt: '2026-08-01T14:30:00+10:00',
        exif: timeOnly(
          exifAt({ year: 2026, month: 7, day: 20, hour: 9, minute: 15, offsetMinutes: 600 })
        ),
      }),
      ZONE,
      UPLOADED_AT
    );

    expect(resolved).toBe('2026-08-01T04:30:00.000Z');
  });

  it('falls through to EXIF when the client said nothing', () => {
    const resolved = captureInstant(
      capture({
        exif: timeOnly(
          exifAt({ year: 2026, month: 7, day: 20, hour: 9, minute: 15, offsetMinutes: 600 })
        ),
      }),
      ZONE,
      UPLOADED_AT
    );

    expect(resolved).toBe('2026-07-19T23:15:00.000Z');
  });

  it("falls through to EXIF when the client's own clock is not believable", () => {
    // An implausible client value must not veto the photograph. It is
    // discarded, and EXIF gets the slot it would have had anyway.
    const resolved = captureInstant(
      capture({
        capturedAt: '2041-03-02T09:00:00Z',
        exif: timeOnly(
          exifAt({ year: 2026, month: 7, day: 20, hour: 9, minute: 15, offsetMinutes: 600 })
        ),
      }),
      ZONE,
      UPLOADED_AT
    );

    expect(resolved).toBe('2026-07-19T23:15:00.000Z');
  });

  it('answers nothing when neither source is believable', () => {
    const resolved = captureInstant(
      capture({
        capturedAt: '2041-03-02T09:00:00Z',
        exif: timeOnly(
          exifAt({ year: 2041, month: 3, day: 2, hour: 9, minute: 0, offsetMinutes: 600 })
        ),
      }),
      ZONE,
      UPLOADED_AT
    );

    expect(resolved).toBeNull();
  });

  it('answers nothing for a plain upload that knew neither', () => {
    expect(captureInstant(capture({}), ZONE, UPLOADED_AT)).toBeNull();
  });
});

describe('where the photograph was taken', () => {
  it('is whatever the photograph said, with nothing else competing for the slot', () => {
    // Unlike the capture time, location has no hierarchy: the paper states
    // no coordinate and the server has none, so either EXIF carried a
    // believable fix or the purchase has no location.
    const fix = { latitude: -33.87, longitude: 151.21 };

    expect(captureLocation(capture({ exif: { time: null, location: fix } }))).toEqual(fix);
  });

  it('is nothing when the photograph carried no fix', () => {
    expect(captureLocation(capture({}))).toBeNull();
  });

  it('is nothing when the client supplied a capture time but the image had no fix', () => {
    // The upload body carries no location field at all, so a client that
    // knows where it is cannot say — the coordinate comes off the image or
    // not at all.
    expect(captureLocation(capture({ capturedAt: '2026-08-01T14:30:00+10:00' }))).toBeNull();
  });
});
