#!/usr/bin/env node
/**
 * Generates the two SVG layers and Icon Composer manifests for the iOS icon.
 * Run without arguments to write both bundles, or with --check to detect drift.
 * Validate artwork changes with actool and Icon Composer's appearance previews.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Icon Composer's canvas, in points. The layers are authored at this size and
 * placed at `scale: 1`. They are SVG, so there is no raster resolution to pick
 * — "vector graphics (such as SVG or PDF) scale gracefully and appear crisp at
 * any size" (HIG, App icons › Layer design).
 */
export const CANVAS = 1024;

/** Thickness of a cord, and the diameter of its rounded cap. */
export const CORD_WIDTH = 148;

/**
 * Background showing between two parallel cords. Wide enough that the lattice
 * still reads as a lattice at the 29pt settings-row size, which is the size
 * this mark is hardest to hold together at.
 */
export const CORD_GAP = 68;

/** Full cord length; leaves a 122-point inset around the unmasked artwork. */
export const MARK_SPAN = 780;

/** Crossings meet without background slits between the over and under cords. */
export const CROSSING_CLEARANCE = 0;

/** Opaque layers preserve each cord's colour at crossings. */
export const UPPER_TRANSLUCENCY = 0;

/**
 * Cylinder cross-section as [offset, lightness delta, saturation delta] in HSL.
 * The narrow highlight and dark flank model a rounded, glossy surface.
 * @type {readonly [number, number, number][]}
 */
export const GLOSS = [
  [0, -10, 0],
  [0.08, 2, 0],
  [0.16, 30, -16],
  [0.23, 12, -4],
  [0.36, 4, 0],
  [0.55, 0, 0],
  [0.85, -13, 0],
  [0.96, -8, 0],
  [1, -4, 0],
];

/** How hard the system shadow beneath each group is. */
export const SHADOW_OPACITY = 0.5;

/** Saturated body colours, one for each member of NAV_COLOR. */
export const PALETTE = {
  rose: '#f33767',
  amber: '#ffb900',
  emerald: '#00b963',
  sky: '#00bcec',
  indigo: '#4169f5',
  violet: '#9344e8',
};

/** The three vertical cords, left to right. The lower group. */
export const WARP = ['rose', 'emerald', 'indigo'];

/** The three horizontal cords, top to bottom. The upper group. */
export const WEFT = ['amber', 'sky', 'violet'];

/**
 * True where a horizontal cord passes over a vertical cord in the basketweave.
 * The weft SVG cuts out the other crossings to expose the continuous warp.
 * @param {number} row index into WEFT
 * @param {number} col index into WARP
 * @returns {boolean}
 */
export function horizontalIsOver(row, col) {
  return (row + col) % 2 === 1;
}

const HALF_WIDTH = CORD_WIDTH / 2;
const HALF_SPAN = MARK_SPAN / 2;
const CENTRE = CANVAS / 2;
const CORD_PITCH = CORD_WIDTH + CORD_GAP;

/**
 * Centre coordinates of the three parallel cords on either axis, in canvas
 * points from the top-left origin.
 *
 * @type {readonly [number, number, number]}
 */
export const CORD_CENTRES = [CENTRE - CORD_PITCH, CENTRE, CENTRE + CORD_PITCH];

/**
 * @param {string} name a key of {@link PALETTE}
 * @returns {string}
 */
function fillOf(name) {
  const hex = Object.entries(PALETTE).find(([key]) => key === name)?.[1];
  if (hex === undefined) throw new Error(`${name} is not one of the six nav colours`);
  return hex;
}

/**
 * @param {readonly string[]} cords
 * @param {number} index
 * @returns {string}
 */
function cordAt(cords, index) {
  const name = cords[index];
  if (name === undefined) throw new Error(`no cord at index ${index}`);
  return name;
}

/**
 * @param {number} index
 * @returns {number}
 */
function centreAt(index) {
  const centre = CORD_CENTRES[index];
  if (centre === undefined) throw new Error(`no cord at index ${index}`);
  return centre;
}

/**
 * sRGB hex to HSL, with hue in degrees and the rest in percentage points.
 *
 * @param {string} hex a `#rrggbb` literal
 * @returns {[number, number, number]}
 */
function toHsl(hex) {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels;
  if (r === undefined || g === undefined || b === undefined) {
    throw new Error(`${hex} is not a #rrggbb literal`);
  }

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const span = max - min;
  if (span === 0) return [0, 0, lightness * 100];

  const saturation = span / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (max === r) hue = ((g - b) / span + (g < b ? 6 : 0)) * 60;
  else if (max === g) hue = ((b - r) / span + 2) * 60;
  else hue = ((r - g) / span + 4) * 60;

  return [hue, saturation * 100, lightness * 100];
}

/**
 * HSL back to an sRGB hex, clamping rather than wrapping so an out-of-range
 * stop flattens instead of inverting.
 *
 * @param {number} hue degrees
 * @param {number} saturation percentage points
 * @param {number} lightness percentage points
 * @returns {string}
 */
function fromHsl(hue, saturation, lightness) {
  const s = Math.min(100, Math.max(0, saturation)) / 100;
  const l = Math.min(100, Math.max(0, lightness)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const h = ((hue % 360) + 360) % 360;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(h / 60) % 6;
  const rgb = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][sector] ?? [0, 0, 0];
  return `#${rgb
    .map((channel) => Math.round(Math.min(255, Math.max(0, (channel + m) * 255))))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * One stop of {@link GLOSS} applied to a cord's body colour.
 *
 * In HSL rather than by scaling channels, because scaling channels desaturates
 * as it darkens — the shadow side slides toward grey, which is what made the
 * first attempt look washed out.
 *
 * @param {string} hex the cord's body colour
 * @param {number} lightnessDelta percentage points
 * @param {number} saturationDelta percentage points
 * @returns {string}
 */
function shade(hex, lightnessDelta, saturationDelta) {
  const [hue, saturation, lightness] = toHsl(hex);
  return fromHsl(hue, saturation + saturationDelta, lightness + lightnessDelta);
}

/**
 * The gradient for one cord, running across its width rather than along its
 * length, so the ramp reads as a cylinder rather than a fade.
 *
 * @param {string} id
 * @param {string} base
 * @param {'vertical' | 'horizontal'} axis
 * @returns {string}
 */
function glossGradient(id, base, axis) {
  const vector =
    axis === 'vertical' ? 'x1="0" y1="0" x2="1" y2="0"' : 'x1="0" y1="0" x2="0" y2="1"';
  const stops = GLOSS.map(
    ([offset, lightnessDelta, saturationDelta]) =>
      `      <stop offset="${offset}" stop-color="${shade(base, lightnessDelta, saturationDelta)}"/>`
  ).join('\n');
  return `    <linearGradient id="${id}" ${vector}>\n${stops}\n    </linearGradient>`;
}

/**
 * One warp cord as an SVG capsule. `rx` equal to half the thickness is what
 * rounds the ends into caps rather than merely softening the corners.
 *
 * @param {number} centre the cord's x, in canvas points
 * @param {string} fill
 * @returns {string}
 */
function warpCapsule(centre, fill) {
  const x = centre - HALF_WIDTH;
  const y = CENTRE - HALF_SPAN;
  return `  <rect x="${x}" y="${y}" width="${CORD_WIDTH}" height="${MARK_SPAN}" rx="${HALF_WIDTH}" fill="${fill}"/>`;
}

/**
 * One weft cord as an even-odd path: the capsule outline, followed by one
 * rectangular subpath per crossing the warp passes over. Even-odd turns those
 * subpaths into holes, which is how the upper group lets the lower one through.
 *
 * A path rather than a rect because a rect cannot carry holes, and separate
 * visible segments rather than holes would put a cap — and therefore a rim —
 * inside the mark at every crossing.
 *
 * @param {number} row index into {@link WEFT}
 * @param {string} fill
 * @returns {string}
 */
function weftPath(row, fill) {
  const centre = centreAt(row);
  const left = CENTRE - HALF_SPAN;
  const right = CENTRE + HALF_SPAN;
  const top = centre - HALF_WIDTH;
  const bottom = centre + HALF_WIDTH;
  const r = HALF_WIDTH;

  let d =
    `M ${left + r} ${top}` +
    ` L ${right - r} ${top}` +
    ` A ${r} ${r} 0 0 1 ${right - r} ${bottom}` +
    ` L ${left + r} ${bottom}` +
    ` A ${r} ${r} 0 0 1 ${left + r} ${top} Z`;

  for (let col = 0; col < CORD_CENTRES.length; col += 1) {
    if (horizontalIsOver(row, col)) continue;
    const half = HALF_WIDTH + CROSSING_CLEARANCE;
    const x0 = centreAt(col) - half;
    const x1 = centreAt(col) + half;
    d += ` M ${x0} ${top} L ${x1} ${top} L ${x1} ${bottom} L ${x0} ${bottom} Z`;
  }

  return `  <path fill-rule="evenodd" d="${d}" fill="${fill}"/>`;
}

/** Distance a crossing's contact shadow extends along the underlying cord. */
export const CONTACT_SHADOW_REACH = 30;

/**
 * Contact shadows run along each cord, perpendicular to its cylinder shading.
 * The hidden crossing stays dark; its exposed shoulders fade back to the body.
 * @param {'warp' | 'weft'} which
 * @param {number} index
 * @returns {readonly [number, number][]} offset in canvas points and black opacity
 */
export function contactShadowStops(which, index) {
  const start = CENTRE - HALF_SPAN;
  const end = CENTRE + HALF_SPAN;
  /** @type {[number, number][]} */
  const stops = [
    [start, 0.22],
    [start + HALF_WIDTH, 0],
  ];
  for (let crossing = 0; crossing < CORD_CENTRES.length; crossing += 1) {
    const under =
      which === 'warp' ? horizontalIsOver(crossing, index) : !horizontalIsOver(index, crossing);
    if (!under) continue;
    const near = centreAt(crossing) - HALF_WIDTH;
    const far = centreAt(crossing) + HALF_WIDTH;
    stops.push(
      [near - CONTACT_SHADOW_REACH, 0],
      [near, 0.36],
      [far, 0.46],
      [far + CONTACT_SHADOW_REACH, 0]
    );
  }
  stops.push([end - HALF_WIDTH, 0], [end, 0.28]);
  return stops.toSorted(([a], [b]) => a - b);
}

/** @param {'warp' | 'weft'} which @param {number} index @returns {string} */
function depthGradients(which, index) {
  const start = CENTRE - HALF_SPAN;
  const stops = contactShadowStops(which, index)
    .map(
      ([position, opacity]) =>
        `      <stop offset="${(position - start) / MARK_SPAN}" stop-color="#000000" stop-opacity="${opacity}"/>`
    )
    .join('\n');
  const vector = which === 'warp' ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="0"';
  return `    <linearGradient id="${which}-${index}-contact" ${vector}>\n${stops}\n    </linearGradient>`;
}

/** @param {'warp' | 'weft'} which @param {number} index @returns {string} */
function capHighlight(which, index) {
  const along = CENTRE - HALF_SPAN + HALF_WIDTH * 0.52;
  const across = centreAt(index) - HALF_WIDTH * 0.28;
  const x = which === 'warp' ? across : along;
  const y = which === 'warp' ? along : across;
  return `  <ellipse cx="${x}" cy="${y}" rx="${HALF_WIDTH * 0.46}" ry="${HALF_WIDTH * 0.32}" fill="url(#cap-highlight)"/>`;
}

/**
 * One foreground layer: the three cords of one axis, as a square unmasked SVG
 * the size of the canvas.
 *
 * @param {'warp' | 'weft'} which
 * @returns {string}
 */
export function layerSvg(which) {
  const axis = which === 'warp' ? 'vertical' : 'horizontal';
  const cords = which === 'warp' ? WARP : WEFT;
  /** @param {number} index @returns {string} */
  const gradientId = (index) => `${which}-${index}`;

  const defs =
    CORD_CENTRES.map(
      (_, index) =>
        glossGradient(gradientId(index), fillOf(cordAt(cords, index)), axis) +
        '\n' +
        depthGradients(which, index)
    ).join('\n') +
    `
    <radialGradient id="cap-highlight">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="0.4" stop-color="#ffffff" stop-opacity="0.3"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>`;

  const body = CORD_CENTRES.map((_, index) => {
    /** @param {string} fill @returns {string} */
    const shape = (fill) =>
      which === 'warp' ? warpCapsule(centreAt(index), fill) : weftPath(index, fill);
    return [
      shape(`url(#${gradientId(index)})`),
      shape(`url(#${gradientId(index)}-contact)`),
      capHighlight(which, index),
    ].join('\n');
  }).join('\n');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">\n` +
    `  <defs>\n${defs}\n  </defs>\n${body}\n</svg>\n`
  );
}

const BACKGROUND = {
  'linear-gradient': [
    'display-p3:0.10500,0.11500,0.12500,1.00000',
    'display-p3:0.00900,0.01300,0.01800,1.00000',
  ],
};

/**
 * @param {string} name
 * @param {string} imageName
 * @param {number} translucency
 * @returns {Record<string, unknown>}
 */
function group(name, imageName, translucency) {
  return {
    layers: [
      {
        'blend-mode': 'normal',
        'image-name': imageName,
        name,
        opacity: 1,
        position: { scale: 1, 'translation-in-points': [0, 0] },
      },
    ],
    specular: false,
    shadow: { kind: 'neutral', opacity: SHADOW_OPACITY },
    translucency: { enabled: translucency > 0, value: translucency },
  };
}

/** The SVG layer each bundle carries, by the file name `icon.json` names. */
export const LAYER_FILES = { 'layer-warp.svg': 'warp', 'layer-weft.svg': 'weft' };

/**
 * A bundle's `icon.json`.
 *
 * **`groups` composites top-first.** Index `0` is the topmost group, the way a
 * layer list reads in a drawing tool rather than the way a painter's algorithm
 * runs. Written bottom-up, the warp lands above the weft and the mark renders
 * as three verticals with the horizontals buried beneath them.
 *
 * @param {{ badge?: string }} [options] `badge` names a raster layer to sit above the mark
 * @returns {Record<string, unknown>}
 */
export function iconManifest(options = {}) {
  const groups = [
    group('Weft', 'layer-weft.svg', UPPER_TRANSLUCENCY),
    group('Warp', 'layer-warp.svg', 0),
  ];
  if (options.badge !== undefined) {
    groups.unshift({ ...group('Local badge', options.badge, 0), specular: true });
  }

  return {
    fill: BACKGROUND,
    groups,
    'supported-platforms': { circles: ['watchOS'], squares: 'shared' },
  };
}

/**
 * The Icon Composer bundles this writes, and the badge layer each one carries
 * above the mark. A bundle's `Assets/` is its own and Xcode resolves
 * `image-name` inside it, so the layers are written into each rather than
 * shared between them.
 *
 * @type {readonly { path: string, badge?: string }[]}
 */
export const BUNDLES = [
  { path: 'clients/ios/App/AppIcon.icon' },
  { path: 'clients/ios/App/AppIconLocal.icon', badge: 'local-badge.png' },
];

/**
 * Every file this generator owns for one bundle, as published path to contents.
 *
 * @param {{ path: string, badge?: string }} bundle
 * @returns {Map<string, string>}
 */
export function bundleFiles(bundle) {
  /** @type {Map<string, string>} */
  const files = new Map();
  for (const [name, which] of Object.entries(LAYER_FILES)) {
    files.set(`Assets/${name}`, layerSvg(which === 'warp' ? 'warp' : 'weft'));
  }
  files.set('icon.json', `${JSON.stringify(iconManifest({ badge: bundle.badge }), null, 2)}\n`);
  return files;
}

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

  let drifted = false;
  for (const bundle of BUNDLES) {
    for (const [relative, contents] of bundleFiles(bundle)) {
      const absolute = join(repoRoot, bundle.path, relative);
      if (check) {
        if (readFileSync(absolute, 'utf8') !== contents) {
          console.error(
            `drift: ${bundle.path}/${relative} does not match scripts/ios-app-icon.mjs`
          );
          drifted = true;
        }
        continue;
      }
      writeFileSync(absolute, contents);
      console.log(`wrote ${bundle.path}/${relative}`);
    }
  }

  if (check && !drifted) console.log(`OK — ${BUNDLES.length} bundles match the generator`);
  return drifted ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
