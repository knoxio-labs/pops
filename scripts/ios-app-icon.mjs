#!/usr/bin/env node
/**
 * Generator for the iOS app icon's layers.
 *
 * `clients/ios/App/AppIcon.icon` is an Icon Composer source: a gradient
 * background plus foreground layers, with the dark, tinted and clear
 * appearances derived by the system rather than checked in. The artwork is a
 * three-by-three lattice of six cords, one per member of `NAV_COLOR` in
 * `libs/sdk/src/manifest-schema/ui.ts` — that enum is closed and has exactly
 * six members, which is where the thread count comes from.
 *
 * The layers were a single checked-in PNG with no source, which is why the
 * mark drifted into a state nobody could correct: its geometry lived only in
 * the pixels. They are derived here instead, from the constants below.
 *
 * `xcrun actool <bundle> --compile <dir> --platform iphonesimulator
 * --minimum-deployment-target 26.0 --app-icon <name>` renders a bundle through
 * the real system compositor in about a second, which is the loop to use when
 * changing any of this. A full Xcode build is not needed, and a hand-drawn
 * mock-up of the icon is worse than useless here: it shows none of the
 * lighting the decisions are about.
 *
 * NOTHING HERE IS SHADED, AND THE MARK IS SPLIT ACROSS TWO GROUPS. Both halves
 * matter and it is easy to get half-right:
 *
 * - Apple's guidance is to let the system light the artwork: "The system
 *   dynamically applies visual effects to your app icon layers, so there's no
 *   need to include specular highlights, drop shadows between layers, beveled
 *   edges, blurs, glows" (HIG, App icons › Visual effects). Baked lighting also
 *   cannot survive the tinted and clear appearances, which are a luminance
 *   remap of this same artwork.
 * - But ONE group is coplanar. A single group does get a specular rim along
 *   every edge in its artwork, interior cord edges included — that much was
 *   verified by rendering it — so the flatness people see in a one-group mark
 *   is not missing rims. It is that nothing casts onto anything: every shape
 *   sits in the same plane, so there is no shadow between the cords. "App
 *   icons include a background layer and one or more foreground layers that
 *   coalesce to create dimensionality" (HIG, App icons › Layer design), and the
 *   dimensionality is between the layers.
 *
 * Usage:
 *   node scripts/ios-app-icon.mjs            write the layers to both icon bundles
 *   node scripts/ios-app-icon.mjs --check    fail if either bundle is out of date
 *
 * Exit 0 = written, or already current under `--check`. Exit 1 = drift under
 * `--check`. Exit 2 = usage error.
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
export const CORD_WIDTH = 132;

/**
 * Background showing between two parallel cords. Wide enough that the lattice
 * still reads as a lattice at the 29pt settings-row size, which is the size
 * this mark is hardest to hold together at.
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
 * extremes that would otherwise crowd the squircle's rounding do not exist.
 * The layers are authored square and unmasked because the system does the
 * masking — "providing layers with pre-defined masking negatively impacts
 * specular highlight effects and makes edges look jagged" (HIG, App icons ›
 * Icon shape).
 */
export const MARK_SPAN = 880;

/**
 * How much wider than a warp cord each hole in the weft layer is cut, so a
 * band of background shows around the warp where it passes over.
 *
 * This is what makes the interlace read. The system lights the hole's edge and
 * the warp cord's edge separately and casts the weft's shadow into the gap, so
 * the warp looks like it is in front rather than merely adjacent. Zero would
 * butt the two colours together with no separation at all.
 */
export const CROSSING_CLEARANCE = 10;

/**
 * Translucency is OFF on both groups.
 *
 * Apple suggests varying opacity for depth — "vary opacity in foreground
 * layers to increase the sense of depth and liveliness" (HIG, App icons ›
 * Layer design) — and it was rendered at 0.15, 0.25 and 0.35 before being
 * rejected. It is the wrong tool for this mark: a translucent weft mixes with
 * the warp beneath into a third hue that is in no pillar's palette, and it is
 * redundant here, because the cut-outs already put the warp in front at the
 * crossings that call for it. The depth comes from the two groups and the
 * clearance, which cost the palette nothing.
 */
export const UPPER_TRANSLUCENCY = 0;

/**
 * The cross-axis profile each cord carries, as `[offset, lightnessDelta,
 * saturationDelta]` in HSL percentage points off the cord's body colour.
 *
 * THIS IS A DELIBERATE DEPARTURE FROM THE HIG, and the one thing in this file a
 * reviewer should challenge rather than assume. Apple's default is the
 * opposite: "Let the system handle blurring and other visual effects... there's
 * no need to include specular highlights, drop shadows between layers, beveled
 * edges, blurs, glows. In addition to interfering with system-provided effects,
 * custom effects are static, whereas the system supplies dynamic ones" (HIG,
 * App icons › Visual effects). The same paragraph permits it with a condition,
 * and the condition is why this constant is allowed to exist: "If you do
 * include custom visual effects on your icon layers, use them intentionally and
 * test carefully with Icon Composer, on a simulated device in Device Hub, or on
 * a physical device to make sure they appear as expected and don't conflict
 * with system effects."
 *
 * The profile is measured, not invented: it reproduces the cross-section of a
 * reference mark the operator approved, which spans about 17 lightness points
 * peaking a fifth of the way across. The SHAPE carries it, not the span — a
 * cylinder reads as a cylinder because of FOUR features, and a ramp with only
 * the middle two looks flat however wide its range. Widening the span instead
 * of fixing the shape was tried, reached 36 points against the reference's 15,
 * and looked like plastic.
 *
 * 1. a NARROW specular near the lit edge — broad is what reads as a fade;
 * 2. the body colour across the middle;
 * 3. a dark shadow side;
 * 4. a BOUNCE at the far edge, lifting the very last band back up. Real
 *    cylinders catch reflected light there. Leaving it out is what made the
 *    first attempt "flat and boring", and it is the single most load-bearing
 *    stop in this table.
 *
 * Saturation falls with lightness in both directions, which is also measured:
 * plain channel multiplication was tried first and slid the shadow side toward
 * grey (rose's shadow at 38% saturation against the reference's 55%), which is
 * what washed the mark out.
 *
 * **Changing these numbers means re-checking the appearances in Icon Composer.**
 * The tinted and clear appearances are a luminance remap of this artwork, which
 * is exactly what a baked lightness gradient interferes with, and they cannot
 * be rendered offline — the system derives them at runtime from the vector
 * layers, so neither CI nor a build will catch a regression here.
 *
 * @type {readonly [number, number, number][]}
 */
export const GLOSS = [
  [0, 4, -2],
  [0.2, 8, -2],
  [0.45, 0, 0],
  [0.8, -9, -18],
  [0.93, -5, -14],
  [1, -6, -14],
];

/** How hard the system shadow beneath each group is. */
export const SHADOW_OPACITY = 0.5;

/**
 * One cord per member of `NAV_COLOR`.
 *
 * These are the **cord bodies**, sampled off a reference mark the operator
 * approved: the median colour across each cord's width, taken between two
 * crossings so no crossing shadow is in the sample. In HSL they land at
 * lightness 53-67% and saturation 41-79%.
 *
 * Tailwind tiers were tried first and every tier is wrong here in the same
 * direction: 400 puts `rose` and `indigo` at lightness 74% and 72% against the
 * reference's 67% and 63%, which is the difference between a cord and a pastel.
 * The lighter a fill is, the less room the gloss in {@link GLOSS} has to lift a
 * highlight out of it before clipping, so too-light bodies and a flat-looking
 * tube are the same defect.
 *
 * `violet` has no reference — the badge in the reference covers that cord — so
 * it is derived rather than invented: Tailwind's violet hue at the mean
 * lightness and saturation of the other five (60%, 67%).
 *
 * A seventh nav colour would have nowhere to go in a three-by-three lattice,
 * and the test asserts these keys against the enum rather than letting the two
 * drift apart quietly.
 */
export const PALETTE = {
  rose: '#ea6c83',
  amber: '#e8ab40',
  emerald: '#57b97a',
  sky: '#4ba6dd',
  indigo: '#5b78e7',
  violet: '#8954de',
};

/** The three vertical cords, left to right. The lower group. */
export const WARP = ['rose', 'emerald', 'indigo'];

/** The three horizontal cords, top to bottom. The upper group. */
export const WEFT = ['amber', 'sky', 'violet'];

/**
 * Whether the horizontal cord of row `row` passes over the vertical cord of
 * column `col`. Alternating on the parity of the sum is what a basketweave is;
 * any crossing that agrees with its neighbour turns the mark into a stack of
 * bars.
 *
 * A z-stack of two groups cannot express that on its own — the upper group is
 * above the lower one everywhere. So the weft layer, which is the upper group,
 * is CUT: at each crossing this returns `false` for, a hole the width of the
 * warp cord plus {@link CROSSING_CLEARANCE} is removed from the weft, and the
 * warp beneath shows through it.
 *
 * The alternative constructions were both rendered and both are worse. Three
 * groups, with warp-over segments on top, gives every segment its own rim and
 * shadow, so the crossings read as separate pills sewn onto the cord beneath.
 * Two groups with no cuts loses the interlace outright.
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

  const defs = CORD_CENTRES.map((_, index) =>
    glossGradient(gradientId(index), fillOf(cordAt(cords, index)), axis)
  ).join('\n');

  const body = CORD_CENTRES.map((_, index) =>
    which === 'warp'
      ? warpCapsule(centreAt(index), `url(#${gradientId(index)})`)
      : weftPath(index, `url(#${gradientId(index)})`)
  ).join('\n');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">\n` +
    `  <defs>\n${defs}\n  </defs>\n${body}\n</svg>\n`
  );
}

const BACKGROUND = {
  'linear-gradient': [
    'display-p3:0.12059,0.13284,0.19482,1.00000',
    'display-p3:0.03671,0.04289,0.06837,1.00000',
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
  if (options.badge !== undefined) groups.unshift(group('Local badge', options.badge, 0));

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
