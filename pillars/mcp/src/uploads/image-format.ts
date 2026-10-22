/** The formats inventory's media store accepts (`MEDIA_UPLOAD_LIMIT_BYTES`' sibling allow-list). */
export type InventoryImageType = 'image/jpeg' | 'image/heic';

const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

/**
 * Identify an upload by its leading bytes rather than its `Content-Type`
 * header, so `curl -T photo.jpg <url>` works without the caller naming a type.
 * `undefined` for anything that is not JPEG or HEIC.
 */
export function sniffImageType(bytes: Buffer): InventoryImageType | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 12 && bytes.toString('latin1', 4, 8) === 'ftyp') {
    if (HEIC_BRANDS.has(bytes.toString('latin1', 8, 12))) return 'image/heic';
  }
  return undefined;
}
