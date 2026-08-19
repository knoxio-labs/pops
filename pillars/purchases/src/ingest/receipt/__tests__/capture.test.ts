/**
 * Which claimant wins, and what the purchase is told about how sure that
 * answer is.
 *
 * The ranking is the whole point of the module, so every tier is asserted
 * against the tier immediately above it rather than against nothing.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { firstPhotoCapture, resolveCapture } from '../capture.js';
import { dms } from './exif-fixtures.js';
import { jpegWithExif, jpegWithTiff } from './image-fixtures.js';

import type { PhotoCapture } from '../exif.js';
import type { ReceiptPart } from '../vision.js';

const PERTH_PHOTO: PhotoCapture = {
  localTime: { year: 2026, month: 8, day: 1, hour: 14, minute: 32, second: 7 },
  utcOffsetMinutes: 8 * 60,
  location: { latitude: -31.95, longitude: 115.86 },
};

const noPhoto = null;

afterEach(() => {
  delete process.env['PURCHASES_TIME_ZONE'];
});

describe('the zone hierarchy', () => {
  it('prefers the zone the client declared over the one read off the address', () => {
    const resolved = resolveCapture({ timeZone: 'Australia/Perth' }, noPhoto, 'Australia/Sydney');
    expect(resolved.timeReference).toEqual({ kind: 'zone', zone: 'Australia/Perth' });
    expect(resolved.zoneCertain).toBe(true);
  });

  it('prefers the printed address over the offset the client implied', () => {
    const resolved = resolveCapture(
      { capturedAt: '2026-08-01T14:32:07+08:00' },
      noPhoto,
      'Australia/Sydney'
    );
    expect(resolved.timeReference).toEqual({ kind: 'zone', zone: 'Australia/Sydney' });
  });

  it('prefers the offset the client implied over the one the camera wrote', () => {
    const resolved = resolveCapture({ capturedAt: '2026-08-01T14:32:07+05:45' }, PERTH_PHOTO, null);
    expect(resolved.timeReference).toEqual({ kind: 'offset', offsetMinutes: 345 });
  });

  it('prefers the camera offset over the configured default', () => {
    const resolved = resolveCapture(undefined, PERTH_PHOTO, null);
    expect(resolved.timeReference).toEqual({ kind: 'offset', offsetMinutes: 480 });
  });

  it('falls back to the configured default when nothing else speaks', () => {
    process.env['PURCHASES_TIME_ZONE'] = 'Europe/Paris';
    const resolved = resolveCapture(undefined, noPhoto, null);
    expect(resolved.timeReference).toEqual({ kind: 'zone', zone: 'Europe/Paris' });
  });

  it('falls through a zone name the runtime does not know rather than throwing', () => {
    const resolved = resolveCapture({ timeZone: 'Mars/Olympus' }, noPhoto, 'Australia/Sydney');
    expect(resolved.timeReference).toEqual({ kind: 'zone', zone: 'Australia/Sydney' });
    expect(resolved.declaredTimeZone).toBeNull();
  });
});

describe('what the purchase is told about certainty', () => {
  it('is certain only when a zone — not an offset — was established', () => {
    expect(resolveCapture({ timeZone: 'Australia/Perth' }, null, null).zoneCertain).toBe(true);
    expect(resolveCapture(undefined, null, 'Australia/Sydney').zoneCertain).toBe(true);
  });

  it('stays uncertain on an offset, which states where the CAMERA was', () => {
    // Ranked above the default and still not a statement about the shop: a
    // receipt photographed at home a week later carries home's offset.
    expect(resolveCapture(undefined, PERTH_PHOTO, null).zoneCertain).toBe(false);
    expect(
      resolveCapture({ capturedAt: '2026-08-01T14:32:07+05:45' }, null, null).zoneCertain
    ).toBe(false);
  });

  it('stays uncertain on the configured default', () => {
    expect(resolveCapture(undefined, null, null).zoneCertain).toBe(false);
  });
});

describe('when the shutter fired', () => {
  it('takes the client instant over the camera, normalised to one spelling', () => {
    const resolved = resolveCapture({ capturedAt: '2026-08-01T14:32:07+10:00' }, PERTH_PHOTO, null);
    expect(resolved.capturedAt).toBe('2026-08-01T04:32:07.000Z');
    expect(resolved.capturedAtSource).toBe('client');
  });

  it("resolves the camera's wall clock against the offset the camera wrote", () => {
    const resolved = resolveCapture(undefined, PERTH_PHOTO, null);
    expect(resolved.capturedAt).toBe('2026-08-01T06:32:07.000Z');
    expect(resolved.capturedAtSource).toBe('exif');
  });

  it('resolves a camera clock with no offset against the zone the receipt established', () => {
    const resolved = resolveCapture(
      undefined,
      { ...PERTH_PHOTO, utcOffsetMinutes: null },
      'Australia/Sydney'
    );
    expect(resolved.capturedAt).toBe('2026-08-01T04:32:07.000Z');
  });

  it('reports no instant when nothing states one', () => {
    const resolved = resolveCapture({ timeZone: 'Australia/Perth' }, null, null);
    expect(resolved.capturedAt).toBeNull();
    expect(resolved.capturedAtSource).toBeNull();
  });

  it('refuses a capture instant that is not a moment', () => {
    expect(resolveCapture({ capturedAt: 'yesterday' }, null, null).capturedAt).toBeNull();
  });

  it('reads no offset out of a client that normalised to Z', () => {
    // `Z` is what `toISOString()` produces, so reading it as "the device was
    // on UTC" would place every normalised upload in Greenwich.
    const resolved = resolveCapture({ capturedAt: '2026-08-01T04:32:07.000Z' }, null, null);
    expect(resolved.utcOffsetMinutes).toBeNull();
    expect(resolved.timeReference.kind).toBe('zone');
  });
});

describe('where it was taken', () => {
  it('takes the client location over the photograph, and says which', () => {
    const resolved = resolveCapture(
      { location: { latitude: 1.5, longitude: 2.5 } },
      PERTH_PHOTO,
      null
    );
    expect(resolved.location).toEqual({ latitude: 1.5, longitude: 2.5 });
    expect(resolved.locationSource).toBe('client');
  });

  it("falls back to the photograph's own coordinates", () => {
    const resolved = resolveCapture(undefined, PERTH_PHOTO, null);
    expect(resolved.location).toEqual(PERTH_PHOTO.location);
    expect(resolved.locationSource).toBe('exif');
  });

  it('reports no location when neither states one', () => {
    const resolved = resolveCapture(undefined, { ...PERTH_PHOTO, location: null }, null);
    expect(resolved.location).toBeNull();
    expect(resolved.locationSource).toBeNull();
  });
});

describe('reading a submission of several parts', () => {
  const part = (bytes: Buffer): ReceiptPart => ({
    mediaType: 'image/jpeg',
    dataBase64: bytes.toString('base64'),
  });

  it('looks past the frames that carry nothing', () => {
    const withMetadata = jpegWithExif({
      dateTimeOriginal: '2026:08:01 14:32:07',
      gps: {
        latitude: dms(33, 52, 4.2),
        latitudeRef: 'S',
        longitude: dms(151, 12, 26),
        longitudeRef: 'E',
      },
    });
    const capture = firstPhotoCapture([part(jpegWithTiff(null)), part(withMetadata)]);
    expect(capture?.localTime?.hour).toBe(14);
  });

  it('answers null when no frame carries any', () => {
    expect(firstPhotoCapture([part(jpegWithTiff(null)), part(jpegWithTiff(null))])).toBeNull();
  });

  it('reads nothing out of a pasted body or a PDF', () => {
    const text: ReceiptPart = {
      mediaType: 'text/plain',
      dataBase64: Buffer.from('Total $27.50', 'utf8').toString('base64'),
    };
    expect(firstPhotoCapture([text])).toBeNull();
  });
});
