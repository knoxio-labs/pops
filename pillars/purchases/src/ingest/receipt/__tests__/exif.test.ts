/**
 * The EXIF reader, against JPEGs built to be exactly one thing wrong.
 *
 * Three properties are being defended.
 *
 * It must find a capture time where one exists, in either byte order, with
 * or without an offset. It must find a coordinate where one exists, on both
 * sides of the equator and both sides of Greenwich. And it must answer
 * nothing for everything else — no EXIF, malformed EXIF, a truncated
 * segment, a pointer off the end, an angle that is not a place — because
 * absence is the ordinary case in production and a throw there would take a
 * real receipt down with it.
 *
 * The two halves are independent, and several tests exist only to hold that:
 * a corrupt GPS block must not cost the capture time, and a photograph with
 * no clock may still state where it was.
 */
import { describe, expect, it } from 'vitest';

import { readExif } from '../exif.js';
import {
  SYDNEY_GPS,
  degrees,
  jpegWithExif,
  jpegWithExifAfterScanStart,
  jpegWithTruncatedApp1,
  jpegWithoutExif,
} from './jpeg-fixtures.js';

describe('a photograph that states when it was taken', () => {
  it('reads the capture time', () => {
    const { time } = readExif(jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07' }));

    expect(time).toEqual({
      year: 2026,
      month: 8,
      day: 1,
      hour: 14,
      minute: 32,
      offsetMinutes: null,
    });
  });

  it('reads the offset the camera recorded alongside it', () => {
    const { time } = readExif(
      jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07', offsetTimeOriginal: '+10:00' })
    );

    expect(time?.offsetMinutes).toBe(600);
  });

  it('reads a negative offset', () => {
    const { time } = readExif(
      jpegWithExif({ dateTimeOriginal: '2026:01:14 09:05:00', offsetTimeOriginal: '-05:30' })
    );

    expect(time?.offsetMinutes).toBe(-330);
  });

  it('reads big-endian EXIF the same as little-endian', () => {
    // Both byte orders are legal and both appear on real hardware. A reader
    // that only handled `II` would silently return nothing for a whole class
    // of cameras rather than failing anywhere visible.
    const little = readExif(
      jpegWithExif({
        dateTimeOriginal: '2026:08:01 14:32:07',
        offsetTimeOriginal: '+10:00',
        gps: SYDNEY_GPS,
      })
    );
    const big = readExif(
      jpegWithExif({
        dateTimeOriginal: '2026:08:01 14:32:07',
        offsetTimeOriginal: '+10:00',
        gps: SYDNEY_GPS,
        bigEndian: true,
      })
    );

    expect(big).toEqual(little);
    expect(big.time).not.toBeNull();
    expect(big.location).not.toBeNull();
  });
});

describe('a photograph that states where it was taken', () => {
  it('reads a southern, eastern fix as signed decimal degrees', () => {
    const { location } = readExif(
      jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07', gps: SYDNEY_GPS })
    );

    // 33°52'12" S, 151°12'36" E.
    expect(location?.latitude).toBeCloseTo(-33.87, 6);
    expect(location?.longitude).toBeCloseTo(151.21, 6);
  });

  it('reads a northern, western fix with the opposite signs', () => {
    const { location } = readExif(
      jpegWithExif({
        gps: {
          latitudeRef: 'N',
          longitudeRef: 'W',
          latitude: degrees(40),
          longitude: degrees(74),
        },
      })
    );

    expect(location).toEqual({ latitude: 40, longitude: -74 });
  });

  it('reads the location of a photograph that states no capture time', () => {
    // The two halves are independent. A file can carry a fix and no clock.
    const reading = readExif(jpegWithExif({ gps: SYDNEY_GPS }));

    expect(reading.time).toBeNull();
    expect(reading.location).not.toBeNull();
  });

  it('reads the capture time of a photograph that states no location', () => {
    const reading = readExif(jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07' }));

    expect(reading.time).not.toBeNull();
    expect(reading.location).toBeNull();
  });
});

describe('a location nobody should record', () => {
  it('refuses a latitude outside the poles', () => {
    // No receiver produces one. Storing it would put the purchase at a point
    // that does not exist, and the database CHECK would refuse it anyway —
    // as a 500 on a receipt that was otherwise fine.
    const { location } = readExif(
      jpegWithExif({
        gps: {
          latitudeRef: 'N',
          longitudeRef: 'E',
          latitude: degrees(200),
          longitude: degrees(10),
        },
      })
    );

    expect(location).toBeNull();
  });

  it('refuses a longitude past the antimeridian', () => {
    const { location } = readExif(
      jpegWithExif({
        gps: {
          latitudeRef: 'N',
          longitudeRef: 'E',
          latitude: degrees(10),
          longitude: degrees(200),
        },
      })
    );

    expect(location).toBeNull();
  });

  it('refuses Null Island', () => {
    // Where a device with no fix writes zeros. It is 600km off Ghana, and
    // nobody's receipt is from there.
    const { location } = readExif(
      jpegWithExif({
        gps: { latitudeRef: 'N', longitudeRef: 'E', latitude: degrees(0), longitude: degrees(0) },
      })
    );

    expect(location).toBeNull();
  });

  it('refuses a hemisphere letter that is not one of the four', () => {
    const { location } = readExif(
      jpegWithExif({
        gps: {
          latitudeRef: 'X',
          longitudeRef: 'E',
          latitude: degrees(33),
          longitude: degrees(151),
        },
      })
    );

    expect(location).toBeNull();
  });

  it('refuses an angle whose denominator is zero', () => {
    // A corrupt field, not a zero angle. Treating it as zero would place the
    // receipt on the equator rather than nowhere.
    const { location } = readExif(
      jpegWithExif({
        gps: {
          latitudeRef: 'S',
          longitudeRef: 'E',
          latitude: [
            [33, 0],
            [52, 1],
            [12, 1],
          ],
          longitude: degrees(151),
        },
      })
    );

    expect(location).toBeNull();
  });

  it('refuses a GPS IFD holding no coordinate at all', () => {
    expect(readExif(jpegWithExif({ emptyGps: true })).location).toBeNull();
  });

  it('keeps the capture time when the location is refused', () => {
    // The one that matters most: a bad fix must not cost a good clock.
    const reading = readExif(
      jpegWithExif({
        dateTimeOriginal: '2026:08:01 14:32:07',
        gps: {
          latitudeRef: 'N',
          longitudeRef: 'E',
          latitude: degrees(200),
          longitude: degrees(10),
        },
      })
    );

    expect(reading.time?.hour).toBe(14);
    expect(reading.location).toBeNull();
  });
});

describe('a photograph that says nothing usable', () => {
  it('answers nothing for a JPEG with no EXIF', () => {
    expect(readExif(jpegWithoutExif())).toEqual({ time: null, location: null });
  });

  it('answers nothing for EXIF that carries no capture time', () => {
    // An APP1 segment with a well-formed sub-IFD and no `DateTimeOriginal`
    // in it. Present-but-empty is not the same file as absent, and both have
    // to land on the same answer.
    expect(readExif(jpegWithExif({ offsetTimeOriginal: '+10:00' })).time).toBeNull();
  });

  it('answers nothing when the APP1 segment runs off the end of the file', () => {
    expect(readExif(jpegWithTruncatedApp1())).toEqual({ time: null, location: null });
  });

  it('answers nothing when the TIFF block is cut short mid-IFD', () => {
    expect(
      readExif(jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07', truncateTiffTo: 14 })).time
    ).toBeNull();
  });

  it('answers nothing for an unrecognised byte order', () => {
    expect(
      readExif(jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07', badByteOrder: true })).time
    ).toBeNull();
  });

  it('answers nothing when the TIFF header does not say 42', () => {
    // The byte order alone is two plausible characters; a truncated buffer
    // that happens to start `II` is not a TIFF, and the magic number is what
    // says so.
    expect(
      readExif(jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07', badTiffMagic: true })).time
    ).toBeNull();
  });

  it('answers nothing when an IFD claims more entries than it holds', () => {
    // The failure this guards is not a wrong answer but a crash: the walk
    // reads twelve bytes per claimed entry, and 4000 of them run a long way
    // past a segment that is a few hundred bytes long.
    expect(
      readExif(jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07', overstateIfd0Count: 4000 }))
    ).toEqual({ time: null, location: null });
  });

  it('answers nothing when a value pointer lands past the end of the block', () => {
    expect(
      readExif(
        jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07', danglingValuePointer: true })
      ).time
    ).toBeNull();
  });

  it('answers nothing for a capture time that is not the shape EXIF states', () => {
    expect(readExif(jpegWithExif({ dateTimeOriginal: '1 Aug 2026, 2:32pm' })).time).toBeNull();
  });

  it('keeps the capture time and drops an offset that is not a real one', () => {
    // A malformed offset must not take the reading down with it. The wall
    // clock is still evidence; it just needs a zone to place it.
    const { time } = readExif(
      jpegWithExif({ dateTimeOriginal: '2026:08:01 14:32:07', offsetTimeOriginal: '+99:99' })
    );

    expect(time?.hour).toBe(14);
    expect(time?.offsetMinutes).toBeNull();
  });

  it('does not read an EXIF-shaped block sitting in the scan data', () => {
    expect(readExif(jpegWithExifAfterScanStart())).toEqual({ time: null, location: null });
  });

  it('answers nothing for bytes that are not a JPEG at all', () => {
    // Every accepted media type reaches this reader; only one of them can
    // carry EXIF. A PDF must be an ordinary nothing, not an error.
    expect(readExif(Buffer.from('%PDF-1.7\nnot an image', 'utf8'))).toEqual({
      time: null,
      location: null,
    });
    expect(readExif(Buffer.alloc(0))).toEqual({ time: null, location: null });
    expect(readExif(Buffer.from([0xff, 0xd8]))).toEqual({ time: null, location: null });
  });
});
