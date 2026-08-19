/**
 * The EXIF reader, against bytes built to be hostile.
 *
 * Two properties matter more than any single field. It must never throw —
 * every byte it reads came from an upload — and it must answer `null` for
 * the ordinary case of a photograph with no metadata, because that is what
 * every stripped or screenshotted receipt is.
 */
import { describe, expect, it } from 'vitest';

import { readPhotoCapture } from '../exif.js';
import { dms, tiffBlock } from './exif-fixtures.js';
import { jpegWithExif, jpegWithTiff, pngWithExif, webpWithExif } from './image-fixtures.js';

const SYDNEY_GPS = {
  latitude: dms(33, 52, 4.2),
  latitudeRef: 'S',
  longitude: dms(151, 12, 26),
  longitudeRef: 'E',
} as const;

describe('what a photograph states about itself', () => {
  it('reads the shutter time, the offset beside it and the coordinates', () => {
    const capture = readPhotoCapture(
      jpegWithExif({
        dateTimeOriginal: '2026:08:01 14:32:07',
        offsetTimeOriginal: '+10:00',
        gps: SYDNEY_GPS,
      }),
      'image/jpeg'
    );

    expect(capture?.localTime).toEqual({
      year: 2026,
      month: 8,
      day: 1,
      hour: 14,
      minute: 32,
      second: 7,
    });
    expect(capture?.utcOffsetMinutes).toBe(600);
    expect(capture?.location?.latitude).toBeCloseTo(-33.8678, 4);
    expect(capture?.location?.longitude).toBeCloseTo(151.2072, 4);
  });

  it('reads a big-endian file identically to a little-endian one', () => {
    const spec = {
      dateTimeOriginal: '2026:08:01 14:32:07',
      offsetTimeOriginal: '-05:30',
      gps: SYDNEY_GPS,
    };
    expect(readPhotoCapture(jpegWithExif({ ...spec, littleEndian: false }), 'image/jpeg')).toEqual(
      readPhotoCapture(jpegWithExif({ ...spec, littleEndian: true }), 'image/jpeg')
    );
  });

  it('reads a negative offset as minutes behind UTC', () => {
    const capture = readPhotoCapture(
      jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07', offsetTimeOriginal: '-05:30' }),
      'image/jpeg'
    );
    expect(capture?.utcOffsetMinutes).toBe(-330);
  });

  it('signs the coordinates by their hemisphere refs', () => {
    const capture = readPhotoCapture(
      jpegWithExif({
        gps: {
          latitude: dms(40, 44, 54),
          latitudeRef: 'N',
          longitude: dms(73, 59, 8),
          longitudeRef: 'W',
        },
      }),
      'image/jpeg'
    );
    expect(capture?.location?.latitude).toBeGreaterThan(0);
    expect(capture?.location?.longitude).toBeLessThan(0);
  });

  it('finds the same metadata in a PNG and in both shapes of WebP', () => {
    const spec = { dateTimeOriginal: '2026:08:01 14:32:07', gps: SYDNEY_GPS };
    const fromJpeg = readPhotoCapture(jpegWithExif(spec), 'image/jpeg');

    expect(readPhotoCapture(pngWithExif(spec), 'image/png')).toEqual(fromJpeg);
    expect(readPhotoCapture(webpWithExif(spec), 'image/webp')).toEqual(fromJpeg);
    expect(readPhotoCapture(webpWithExif(spec, { preamble: true }), 'image/webp')).toEqual(
      fromJpeg
    );
  });
});

describe('absent metadata is the ordinary case, not a failure', () => {
  it('answers null for a photograph whose EXIF was stripped', () => {
    expect(readPhotoCapture(jpegWithTiff(null), 'image/jpeg')).toBeNull();
  });

  it('answers null for an EXIF block that states none of the four tags', () => {
    expect(readPhotoCapture(jpegWithExif({}), 'image/jpeg')).toBeNull();
  });

  it('answers null for the media types that are not photographs', () => {
    const bytes = jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07' });
    expect(readPhotoCapture(bytes, 'image/gif')).toBeNull();
    expect(readPhotoCapture(bytes, 'application/pdf')).toBeNull();
    expect(readPhotoCapture(bytes, 'text/plain')).toBeNull();
  });

  it('keeps the half of a reading that is present when the other half is not', () => {
    const timeOnly = readPhotoCapture(
      jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07' }),
      'image/jpeg'
    );
    expect(timeOnly?.localTime).not.toBeNull();
    expect(timeOnly?.location).toBeNull();

    const placeOnly = readPhotoCapture(jpegWithExif({ gps: SYDNEY_GPS }), 'image/jpeg');
    expect(placeOnly?.localTime).toBeNull();
    expect(placeOnly?.location).not.toBeNull();
  });
});

describe('a malformed file costs a reading, never an upload', () => {
  it('refuses half a coordinate rather than reporting a point on the equator', () => {
    for (const omit of ['latitude', 'longitude', 'latitudeRef', 'longitudeRef'] as const) {
      const capture = readPhotoCapture(
        jpegWithExif({ gps: { ...SYDNEY_GPS, omit } }),
        'image/jpeg'
      );
      expect(capture?.location ?? null, `omitting ${omit}`).toBeNull();
    }
  });

  it('refuses a zero denominator instead of dividing by it', () => {
    const capture = readPhotoCapture(
      jpegWithExif({
        gps: {
          ...SYDNEY_GPS,
          latitude: [
            [33, 0],
            [52, 1],
            [420, 100],
          ],
        },
      }),
      'image/jpeg'
    );
    expect(capture).toBeNull();
  });

  it('refuses a coordinate outside the globe', () => {
    const capture = readPhotoCapture(
      jpegWithExif({ gps: { ...SYDNEY_GPS, latitude: dms(133, 52, 4.2) } }),
      'image/jpeg'
    );
    expect(capture?.location ?? null).toBeNull();
  });

  it('refuses a hemisphere ref that is not a hemisphere', () => {
    const capture = readPhotoCapture(
      jpegWithExif({ gps: { ...SYDNEY_GPS, latitudeRef: 'E' } }),
      'image/jpeg'
    );
    expect(capture?.location ?? null).toBeNull();
  });

  it('refuses the zeroed date a camera writes when it has never been set', () => {
    expect(
      readPhotoCapture(jpegWithExif({ dateTimeOriginal: '0000:00:00 00:00:00' }), 'image/jpeg')
    ).toBeNull();
  });

  it('refuses an offset that is not one', () => {
    expect(
      readPhotoCapture(
        jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07', offsetTimeOriginal: '+99:99' }),
        'image/jpeg'
      )?.utcOffsetMinutes
    ).toBeNull();
  });

  it('survives every truncation of a file that did have metadata', () => {
    const whole = jpegWithExif({
      dateTimeOriginal: '2026:08:01 14:32:07',
      offsetTimeOriginal: '+10:00',
      gps: SYDNEY_GPS,
    });
    for (let length = 0; length < whole.length; length += 1) {
      expect(() => readPhotoCapture(whole.subarray(0, length), 'image/jpeg')).not.toThrow();
    }
  });

  it('survives a TIFF block whose every byte has been corrupted in turn', () => {
    const tiff = tiffBlock({
      dateTimeOriginal: '2026:08:01 14:32:07',
      offsetTimeOriginal: '+10:00',
      gps: SYDNEY_GPS,
    });
    for (let index = 0; index < tiff.length; index += 1) {
      const damaged = Buffer.from(tiff);
      // 0xff makes every offset field point far past the end of the block,
      // which is the failure a bounds check exists for.
      damaged[index] = 0xff;
      expect(() => readPhotoCapture(jpegWithTiff(damaged), 'image/jpeg')).not.toThrow();
    }
  });

  it('does not mistake a JPEG with no EXIF segment at all for one', () => {
    expect(
      readPhotoCapture(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]), 'image/jpeg')
    ).toBeNull();
  });

  it('answers null for bytes that are not the container they claim', () => {
    const noise = Buffer.alloc(64, 0x41);
    expect(readPhotoCapture(noise, 'image/jpeg')).toBeNull();
    expect(readPhotoCapture(noise, 'image/png')).toBeNull();
    expect(readPhotoCapture(noise, 'image/webp')).toBeNull();
  });
});
