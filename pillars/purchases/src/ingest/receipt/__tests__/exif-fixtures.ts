/**
 * Real EXIF, built byte by byte.
 *
 * A checked-in photograph would be one sample of one phone's encoder, and
 * the cases worth testing are the ones a sample cannot contain: the other
 * byte order, an offset that points past the end, a GPS block missing half
 * a coordinate, a container that was truncated mid-segment. Building the
 * bytes is the only way to ask for those, and it means the parser is tested
 * against the format rather than against whatever a fixture happened to be.
 *
 * Nothing here is a JPEG a decoder would accept — there is no image data at
 * all. The reader never decodes one, and a fixture that did would be
 * hundreds of kilobytes of noise around the twenty bytes under test.
 */

export interface GpsSpec {
  /** Degrees, minutes, seconds as `[numerator, denominator]` pairs. */
  readonly latitude: readonly [number, number][];
  readonly latitudeRef: string;
  readonly longitude: readonly [number, number][];
  readonly longitudeRef: string;
  /** Drop one half of the pair, to prove a partial coordinate is refused. */
  readonly omit?: 'latitude' | 'longitude' | 'latitudeRef' | 'longitudeRef';
}

export interface ExifSpec {
  /** EXIF's own format: `2026:08:01 14:32:07`. */
  readonly dateTimeOriginal?: string;
  /** `+11:00`. */
  readonly offsetTimeOriginal?: string;
  readonly gps?: GpsSpec;
  readonly littleEndian?: boolean;
}

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;

const TYPE_ASCII = 2;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;

interface Field {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  readonly payload: Buffer;
}

function u16(value: number, little: boolean): Buffer {
  const buffer = Buffer.alloc(2);
  if (little) buffer.writeUInt16LE(value);
  else buffer.writeUInt16BE(value);
  return buffer;
}

function u32(value: number, little: boolean): Buffer {
  const buffer = Buffer.alloc(4);
  if (little) buffer.writeUInt32LE(value);
  else buffer.writeUInt32BE(value);
  return buffer;
}

function ascii(tag: number, value: string): Field {
  const payload = Buffer.from(`${value}\0`, 'ascii');
  return { tag, type: TYPE_ASCII, count: payload.length, payload };
}

function rationals(
  tag: number,
  values: readonly (readonly [number, number])[],
  little: boolean
): Field {
  const payload = Buffer.concat(
    values.map(([numerator, denominator]) =>
      Buffer.concat([u32(numerator, little), u32(denominator, little)])
    )
  );
  return { tag, type: TYPE_RATIONAL, count: values.length, payload };
}

/** One directory, plus whatever of its payloads did not fit inline. */
function directory(
  fields: readonly Field[],
  little: boolean,
  dataAt: number
): { ifd: Buffer; data: Buffer } {
  const chunks: Buffer[] = [u16(fields.length, little)];
  const overflow: Buffer[] = [];
  let overflowAt = dataAt;

  for (const field of fields.toSorted((a, b) => a.tag - b.tag)) {
    const head = Buffer.concat([
      u16(field.tag, little),
      u16(field.type, little),
      u32(field.count, little),
    ]);
    if (field.payload.length <= 4) {
      const inline = Buffer.alloc(4);
      field.payload.copy(inline);
      chunks.push(Buffer.concat([head, inline]));
    } else {
      chunks.push(Buffer.concat([head, u32(overflowAt, little)]));
      overflow.push(field.payload);
      overflowAt += field.payload.length;
    }
  }
  chunks.push(u32(0, little));
  return { ifd: Buffer.concat(chunks), data: Buffer.concat(overflow) };
}

function directorySize(fieldCount: number): number {
  return 2 + fieldCount * 12 + 4;
}

function payloadBytes(fields: readonly Field[]): number {
  return fields
    .filter((field) => field.payload.length > 4)
    .reduce((total, field) => total + field.payload.length, 0);
}

function gpsFields(gps: GpsSpec, little: boolean): Field[] {
  const fields: Field[] = [];
  if (gps.omit !== 'latitudeRef') fields.push(ascii(0x0001, gps.latitudeRef));
  if (gps.omit !== 'latitude') fields.push(rationals(0x0002, gps.latitude, little));
  if (gps.omit !== 'longitudeRef') fields.push(ascii(0x0003, gps.longitudeRef));
  if (gps.omit !== 'longitude') fields.push(rationals(0x0004, gps.longitude, little));
  return fields;
}

/**
 * A complete TIFF block: IFD0 pointing at an EXIF directory and a GPS one,
 * laid out in the order a camera writes them.
 */
function exifFieldsOf(spec: ExifSpec): Field[] {
  const fields: Field[] = [];
  if (spec.dateTimeOriginal !== undefined) {
    fields.push(ascii(TAG_DATE_TIME_ORIGINAL, spec.dateTimeOriginal));
  }
  if (spec.offsetTimeOriginal !== undefined) {
    fields.push(ascii(TAG_OFFSET_TIME_ORIGINAL, spec.offsetTimeOriginal));
  }
  return fields;
}

export function tiffBlock(spec: ExifSpec): Buffer {
  const little = spec.littleEndian ?? true;
  const exifFields = exifFieldsOf(spec);
  const gpsFieldList = spec.gps === undefined ? [] : gpsFields(spec.gps, little);
  const hasExif = exifFields.length > 0;
  const hasGps = spec.gps !== undefined;

  const header = 8;
  const ifd0Size = directorySize((hasExif ? 1 : 0) + (hasGps ? 1 : 0));
  const exifAt = header + ifd0Size;
  const gpsAt =
    exifAt + (hasExif ? directorySize(exifFields.length) + payloadBytes(exifFields) : 0);

  const pointers: Field[] = [];
  if (hasExif) {
    pointers.push({ tag: TAG_EXIF_IFD, type: TYPE_LONG, count: 1, payload: u32(exifAt, little) });
  }
  if (hasGps) {
    pointers.push({ tag: TAG_GPS_IFD, type: TYPE_LONG, count: 1, payload: u32(gpsAt, little) });
  }

  const ifd0 = directory(pointers, little, header + ifd0Size);
  const exif = directory(exifFields, little, exifAt + directorySize(exifFields.length));
  const gps = directory(gpsFieldList, little, gpsAt + directorySize(gpsFieldList.length));

  return Buffer.concat([
    Buffer.from(little ? 'II' : 'MM', 'ascii'),
    u16(42, little),
    u32(header, little),
    ifd0.ifd,
    ifd0.data,
    ...(hasExif ? [exif.ifd, exif.data] : []),
    ...(hasGps ? [gps.ifd, gps.data] : []),
  ]);
}

/** Degrees, minutes and seconds as EXIF writes them. */
export function dms(
  degrees: number,
  minutes: number,
  seconds: number
): readonly [number, number][] {
  return [
    [degrees, 1],
    [minutes, 1],
    [Math.round(seconds * 100), 100],
  ];
}
