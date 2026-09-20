#!/usr/bin/env node
/**
 * Generator for the iOS app icon artwork.
 *
 * `clients/ios/App/AppIcon.icon` is an Icon Composer source whose single
 * image layer is a 3x3 basketweave of six cords, one per member of
 * `NAV_COLOR` in `libs/sdk/src/manifest-schema/ui.ts`. That layer used to be
 * a checked-in PNG with no source, which is why it drifted into a state
 * nobody could correct: the geometry lived only in the pixels.
 *
 * So the pixels are derived here instead, from the constants below, with no
 * dependency beyond `node:zlib` — the mark is capsules on a transparent
 * ground, which is signed-distance arithmetic rather than anything a
 * rasteriser is needed for.
 *
 * THE ARTWORK IS FLAT ON PURPOSE. Icon Composer lights the layer itself: it
 * draws a specular rim along the alpha edge, and `icon.json` asks for a
 * neutral system shadow. It also derives the dark, tinted and clear variants
 * from this one image, and a tint is a monochrome remap — baked highlights
 * and baked drop shadows survive that remap as mud. Depth here therefore
 * comes from geometry the system can relight (`CROSSING_CLEARANCE`), never
 * from shading painted into the cords.
 *
 * Usage:
 *   node scripts/ios-app-icon.mjs            write the artwork to both icon bundles
 *   node scripts/ios-app-icon.mjs --check    fail if either bundle is out of date
 *
 * Exit 0 = written, or already current under `--check`. Exit 1 = drift under
 * `--check`. Exit 2 = usage error.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Icon Composer's canvas is 1024 points, and `icon.json` places this layer at
 * `scale: 0.5`, so the artwork is authored in 1024 canvas units and rasterised
 * at twice that. Every constant below is in canvas units.
 */
export const CANVAS_UNITS = 1024;
export const RENDER_PIXELS = 2048;

/** Thickness of a cord, and the diameter of its rounded cap. */
export const CORD_WIDTH = 132;

/**
 * Background showing between two parallel cords. Kept wide enough that the
 * lattice still reads as a grid rather than a block at the 29pt settings-row
 * size, which is the size this mark is hardest to hold together at.
 */
export const CORD_GAP = 84;

/**
 * Corner-to-corner extent of the mark, and therefore the full length of every
 * cord. All six are the same length, which is what makes the twelve ends land
 * on one square boundary instead of some being cropped by the canvas and
 * others stopping just past a crossing.
 *
 * It is 86% of the canvas rather than the 80% an icon's artwork usually keeps
 * to, because this silhouette is a cross: its four corners are empty, so the
 * extremes that would otherwise crowd the squircle's own corners do not exist.
 */
export const MARK_SPAN = 880;

/**
 * How far the background is opened around a cord passing OVER another, cut out
 * of the cord beneath. This is the entire depth cue — an over-cord reads as
 * over because the cord under it stops short of it, not because either is
 * shaded.
 */
export const CROSSING_CLEARANCE = 9;

/**
 * One cord per member of `NAV_COLOR`, at Tailwind's 400 tier — the mark sits
 * on a near-black ground, so it wants the bright end of each hue.
 *
 * The enum is closed and has exactly six members, which is where the thread
 * count comes from: a 3x3 weave needs three warp and three weft. A seventh
 * nav colour would have nowhere to go, and the test asserts these keys against
 * the enum rather than letting the two drift apart quietly.
 */
export const PALETTE = {
  rose: '#fb7185',
  amber: '#fbbf24',
  emerald: '#34d399',
  sky: '#38bdf8',
  indigo: '#818cf8',
  violet: '#a78bfa',
};

/**
 * The three vertical cords, left to right.
 *
 * @type {readonly [string, string, string]}
 */
export const WARP = ['rose', 'emerald', 'indigo'];

/**
 * The three horizontal cords, top to bottom.
 *
 * @type {readonly [string, string, string]}
 */
export const WEFT = ['amber', 'sky', 'violet'];

/**
 * Whether the horizontal cord of row `row` passes over the vertical cord of
 * column `col`. Alternating on the parity of the sum is what a basketweave
 * is; any crossing that agrees with its neighbour turns the mark into a stack
 * of bars.
 *
 * @param {number} row index into {@link WEFT}
 * @param {number} col index into {@link WARP}
 * @returns {boolean}
 */
export function horizontalIsOver(row, col) {
  return (row + col) % 2 === 1;
}

const HALF_WIDTH = CORD_WIDTH / 2;
const HALF_SPAN = MARK_SPAN / 2;
const CORD_PITCH = CORD_WIDTH + CORD_GAP;

/**
 * Centre offsets of the three parallel cords on either axis, from the canvas
 * centre.
 *
 * @type {readonly [number, number, number]}
 */
export const CORD_OFFSETS = [-CORD_PITCH, 0, CORD_PITCH];

/**
 * Signed distance from a point to a cord's capsule, in canvas units: negative
 * inside, zero on the edge.
 *
 * @param {number} along the point's coordinate on the cord's own axis, relative to the cord's centre
 * @param {number} across its coordinate on the perpendicular axis, likewise
 * @returns {number}
 */
function cordDistance(along, across) {
  const beyondCore = Math.max(0, Math.abs(along) - (HALF_SPAN - HALF_WIDTH));
  return Math.hypot(across, beyondCore) - HALF_WIDTH;
}

const [OFFSET_LOW, OFFSET_MID, OFFSET_HIGH] = CORD_OFFSETS;

/**
 * Which of the three parallel cords on one axis a point falls inside, or `-1`.
 *
 * `slack` widens every cord by that much before testing, which is how the
 * clearance around an over-cord is found. At most one cord can match even
 * widened, because `CORD_GAP` is several times `CROSSING_CLEARANCE`.
 *
 * @param {number} along the point's coordinate on the cords' shared axis
 * @param {number} across its coordinate on the axis the three are spread along
 * @param {number} [slack]
 * @returns {number}
 */
function cordIndexAt(along, across, slack = 0) {
  if (cordDistance(along, across - OFFSET_LOW) < slack) return 0;
  if (cordDistance(along, across - OFFSET_MID) < slack) return 1;
  if (cordDistance(along, across - OFFSET_HIGH) < slack) return 2;
  return -1;
}

/**
 * @param {readonly [string, string, string]} cords
 * @param {number} index
 * @returns {string}
 */
function cordAt(cords, index) {
  const name = cords[index];
  if (name === undefined) throw new Error(`no cord at index ${index}`);
  return name;
}

/**
 * The colour visible at one point of the artwork, as a `NAV_COLOR` name, or
 * `null` where the background shows through.
 *
 * Coordinates are in canvas units relative to the canvas centre, x rightwards
 * and y downwards.
 *
 * @param {number} x
 * @param {number} y
 * @returns {string | null}
 */
export function colorAt(x, y) {
  const col = cordIndexAt(y, x);
  const row = cordIndexAt(x, y);

  if (col >= 0 && row >= 0) {
    return horizontalIsOver(row, col) ? cordAt(WEFT, row) : cordAt(WARP, col);
  }

  if (col >= 0) {
    const near = cordIndexAt(x, y, CROSSING_CLEARANCE);
    if (near >= 0 && horizontalIsOver(near, col)) return null;
    return cordAt(WARP, col);
  }

  if (row >= 0) {
    const near = cordIndexAt(y, x, CROSSING_CLEARANCE);
    if (near >= 0 && !horizontalIsOver(row, near)) return null;
    return cordAt(WEFT, row);
  }

  return null;
}

/**
 * @param {string} hex a `#rrggbb` literal
 * @returns {[number, number, number]}
 */
function parseHex(hex) {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/** @type {Map<string, [number, number, number]>} */
const RGB = new Map(Object.entries(PALETTE).map(([name, hex]) => [name, parseHex(hex)]));

/**
 * @param {string} name
 * @returns {[number, number, number]}
 */
function rgbOf(name) {
  const rgb = RGB.get(name);
  if (rgb === undefined) throw new Error(`${name} is not one of the six nav colours`);
  return rgb;
}

/**
 * Rasterise the artwork to premultiplied-free straight-alpha RGBA.
 *
 * Supersampled, and the samples are resolved to colours individually rather
 * than blended geometrically, because the boundary where an over-cord meets
 * the cord beneath it is a real edge in the mark: averaging across it would
 * smear two saturated hues into a third that is in neither palette.
 *
 * @param {number} [pixels] side length of the square output
 * @param {number} [samples] supersamples per axis, per pixel
 * @returns {{ pixels: number, data: Uint8Array }}
 */
export function renderArtwork(pixels = RENDER_PIXELS, samples = 4) {
  const data = new Uint8Array(pixels * pixels * 4);
  const unitsPerPixel = CANVAS_UNITS / pixels;
  const sampleCount = samples * samples;

  for (let py = 0; py < pixels; py += 1) {
    for (let px = 0; px < pixels; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        const y = (py + (sy + 0.5) / samples) * unitsPerPixel - CANVAS_UNITS / 2;
        for (let sx = 0; sx < samples; sx += 1) {
          const x = (px + (sx + 0.5) / samples) * unitsPerPixel - CANVAS_UNITS / 2;
          const name = colorAt(x, y);
          if (name === null) continue;
          const rgb = rgbOf(name);
          r += rgb[0];
          g += rgb[1];
          b += rgb[2];
          covered += 1;
        }
      }

      const offset = (py * pixels + px) * 4;
      if (covered === 0) continue;
      data[offset] = Math.round(r / covered);
      data[offset + 1] = Math.round(g / covered);
      data[offset + 2] = Math.round(b / covered);
      data[offset + 3] = Math.round((covered / sampleCount) * 255);
    }
  }

  return { pixels, data };
}

/**
 * CRC-32 as every PNG chunk carries it. Computed bit by bit rather than off a
 * lookup table: four chunks per file is not a hot path, and the table version
 * spends its whole body indexing, which reads worse than the polynomial does.
 *
 * @param {Uint8Array} bytes
 * @returns {number}
 */
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c ^= byte;
    for (let bit = 0; bit < 8; bit += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * @param {string} type the four-character chunk name
 * @param {Buffer} body
 * @returns {Buffer}
 */
function chunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([head, typed, crc]);
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Encode straight-alpha RGBA as an 8-bit colour-type-6 PNG.
 *
 * @param {number} pixels side length of the square image
 * @param {Uint8Array} data RGBA rows, top to bottom
 * @returns {Buffer}
 */
export function encodePng(pixels, data) {
  const stride = pixels * 4;
  const raw = Buffer.alloc((stride + 1) * pixels);
  for (let y = 0; y < pixels; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(pixels, 0);
  ihdr.writeUInt32BE(pixels, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    PNG_MAGIC,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * One byte of a buffer, with the bounds check the index signature only
 * promises. Every caller below computes an index it believes is in range; a
 * decoder reading a file it did not write should say so when it is wrong
 * rather than propagate an `undefined` into the arithmetic.
 *
 * @param {Uint8Array} bytes
 * @param {number} index
 * @returns {number}
 */
function byteAt(bytes, index) {
  const value = bytes[index];
  if (value === undefined) throw new Error(`truncated PNG: no byte at ${index}`);
  return value;
}

/**
 * The PNG spec's Paeth predictor: whichever neighbour the linear estimate
 * lands nearest.
 *
 * @param {number} left
 * @param {number} up
 * @param {number} upLeft
 * @returns {number}
 */
function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const toLeft = Math.abs(estimate - left);
  const toUp = Math.abs(estimate - up);
  const toUpLeft = Math.abs(estimate - upLeft);
  if (toLeft <= toUp && toLeft <= toUpLeft) return left;
  return toUp <= toUpLeft ? up : upLeft;
}

/**
 * Decode an 8-bit colour-type-6 PNG back to straight-alpha RGBA.
 *
 * Narrow on purpose: it reads what {@link encodePng} writes, so that a drift
 * check can compare pixels rather than bytes. Byte equality would make the
 * check a hostage to whichever zlib the running Node was built against.
 *
 * @param {Buffer} png
 * @returns {{ pixels: number, data: Uint8Array }}
 */
export function decodePng(png) {
  if (!png.subarray(0, 8).equals(PNG_MAGIC)) throw new Error('not a PNG');

  let offset = 8;
  let pixels = 0;
  /** @type {Buffer[]} */
  const idat = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    const body = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      pixels = body.readUInt32BE(0);
      if (body.readUInt32BE(4) !== pixels) throw new Error('expected a square image');
      if (body[8] !== 8 || body[9] !== 6) throw new Error('expected 8-bit RGBA');
    } else if (type === 'IDAT') {
      idat.push(body);
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = pixels * 4;
  const data = new Uint8Array(stride * pixels);

  for (let y = 0; y < pixels; y += 1) {
    const filter = byteAt(raw, y * (stride + 1));
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 4 ? byteAt(data, y * stride + i - 4) : 0;
      const up = y > 0 ? byteAt(data, (y - 1) * stride + i) : 0;
      const upLeft = y > 0 && i >= 4 ? byteAt(data, (y - 1) * stride + i - 4) : 0;
      let value = byteAt(row, i);
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`);
      data[y * stride + i] = value & 0xff;
    }
  }

  return { pixels, data };
}

/**
 * Where the artwork is written. Both Icon Composer bundles carry their own
 * copy — a bundle's `Assets/` is its own, and Xcode resolves `image-name`
 * inside it — so this writes the same bytes twice rather than symlinking one
 * into the other.
 */
export const ARTWORK_PATHS = [
  'clients/ios/App/AppIcon.icon/Assets/layer-weave.png',
  'clients/ios/App/AppIconLocal.icon/Assets/layer-weave.png',
];

/**
 * @param {string[]} argv
 * @returns {number} the process exit code
 */
function main(argv) {
  const check = argv.includes('--check');
  const unknown = argv.filter((arg) => arg !== '--check');
  if (unknown.length > 0) {
    console.error(
      `usage: node scripts/ios-app-icon.mjs [--check]\nunexpected: ${unknown.join(' ')}`
    );
    return 2;
  }

  const { pixels, data } = renderArtwork();
  const png = encodePng(pixels, data);

  let drifted = false;
  for (const relative of ARTWORK_PATHS) {
    const absolute = join(repoRoot, relative);
    if (check) {
      const current = decodePng(readFileSync(absolute));
      const same = current.pixels === pixels && Buffer.from(current.data).equals(Buffer.from(data));
      if (!same) {
        console.error(`drift: ${relative} does not match scripts/ios-app-icon.mjs`);
        drifted = true;
      }
      continue;
    }
    writeFileSync(absolute, png);
    console.log(`wrote ${relative} (${pixels}x${pixels}, ${png.length} bytes)`);
  }

  if (check && !drifted) console.log(`OK — ${ARTWORK_PATHS.length} bundles match the generator`);
  return drifted ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
