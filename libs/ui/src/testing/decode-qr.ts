/**
 * Read a rendered {@link QrCode} back with an independent decoder.
 *
 * Exported for consumers, not just for `QrCode`'s own tests: a page that
 * renders a QR has its own thing to prove — that the string it handed the
 * component is the one its API returned — and asserting a prop reached the
 * component cannot tell a correct payload from a plausible-looking wrong one.
 * A mis-encoded QR fails silently in front of a phone camera, where it reads
 * as a server bug.
 *
 * Geometry comes from the `<rect>` attributes rather than from layout, because
 * jsdom does not lay SVG out — and the attributes are what a browser paints
 * from anyway.
 */
import jsQR from 'jsqr';

/** Pixels per QR module in the rasterised bitmap handed to the decoder. */
const SCALE = 4;

export function decodeQrSvg(svg: SVGElement): string | null {
  const extent = Number(svg.getAttribute('viewBox')?.split(' ')[2]);
  if (!Number.isFinite(extent) || extent <= 0) return null;

  const side = extent * SCALE;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);

  for (const rect of svg.querySelectorAll('rect[data-qr-module]')) {
    const x = Number(rect.getAttribute('x'));
    const y = Number(rect.getAttribute('y'));
    const width = Number(rect.getAttribute('width'));
    const height = Number(rect.getAttribute('height'));

    for (let py = y * SCALE; py < (y + height) * SCALE; py += 1) {
      for (let px = x * SCALE; px < (x + width) * SCALE; px += 1) {
        const offset = (py * side + px) * 4;
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
      }
    }
  }

  return jsQR(pixels, side, side)?.data ?? null;
}
