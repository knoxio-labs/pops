#!/usr/bin/env node
/**
 * Generate the design playground's iOS colour tokens from the iOS app's own
 * asset catalogue.
 *
 * The playground's iPhone frame is an HTML facsimile, but its colours are not
 * invented: every one is read out of
 * `clients/ios/Packages/DesignSystem/.../Colors.xcassets`, so a colour changed
 * in the app changes here too rather than drifting quietly. Both appearances
 * are emitted — the light values on `:root`, the dark ones under `.dark`,
 * which is the class the playground's theme layer already sets.
 *
 * It lives at the repo root, not inside `pillars/design`, because a pillar may
 * not read `clients/` (ADR-043). The generated sheet is checked in and a CI
 * guard (`scripts/ci/check-ios-design-tokens.mjs`) regenerates it and diffs, so
 * an asset edit that skips this script fails the build rather than shipping a
 * playground that lies about the app.
 *
 * Usage:
 *   node scripts/design-ios-tokens.mjs             write the sheet
 *   node scripts/design-ios-tokens.mjs --self-test
 *
 * Or `mise run design:ios-tokens`. Checking a checked-in sheet against the
 * catalogue is the CI guard's job, not a second front door here.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '..');

export const XCASSETS_DIR =
  'clients/ios/Packages/DesignSystem/Sources/DesignSystem/Resources/Colors.xcassets';
export const TOKENS_PATH = 'pillars/design/src/frames/ios/tokens.css';

/**
 * A floor on discovery. The catalogue has nine colorsets; a generator that
 * silently found none would write an empty sheet and every check downstream
 * would agree with it.
 */
export const MIN_COLORSETS = 8;

/**
 * `popsMutedForeground.colorset` -> `muted-foreground`. The `pops` prefix is
 * the app's namespace inside its own catalogue and carries nothing here.
 *
 * @param {string} dirName
 * @returns {string}
 */
export function tokenNameFor(dirName) {
  const bare = dirName.replace(/\.colorset$/, '').replace(/^pops/, '');
  return bare
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/^-/, '')
    .toLowerCase();
}

/**
 * The two-digit hex a colorset component holds (`"0x0B"`, `"11"`, `"0.5"`).
 * Xcode writes hex for catalogues authored as hex and decimal for ones
 * authored with the colour picker, so both are read rather than assuming.
 *
 * @param {string} raw
 * @returns {string}
 */
function componentToHex(raw) {
  const value =
    raw.startsWith('0x') || raw.startsWith('0X')
      ? Number.parseInt(raw.slice(2), 16)
      : Math.round(
          Number.parseFloat(raw) * (raw.includes('.') && Number.parseFloat(raw) <= 1 ? 255 : 1)
        );
  if (!Number.isFinite(value)) throw new Error(`unreadable colour component: ${raw}`);
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
}

/**
 * The CSS colour one catalogue entry describes. Alpha is emitted only when it
 * is not fully opaque, so the common case stays a plain 6-digit hex.
 *
 * @param {{ components: Record<string, string> }} color
 * @returns {string}
 */
function cssColorFor(color) {
  const { red, green, blue, alpha } = color.components;
  const rgb = `#${componentToHex(red)}${componentToHex(green)}${componentToHex(blue)}`;
  const a = componentToHex(alpha ?? '1.000');
  return a === 'ff' ? rgb : `${rgb}${a}`;
}

/**
 * @typedef {object} IosColor
 * @property {string} token  CSS custom-property name, without the `--ios-` prefix.
 * @property {string} light
 * @property {string} dark   The light value when the catalogue has no dark entry.
 */

/**
 * Parse one `Contents.json`. A colorset with no dark appearance reuses its
 * light value: that is what iOS does, and inventing a dark variant here would
 * be the playground making up a colour the app does not have.
 *
 * @param {string} dirName
 * @param {string} source
 * @returns {IosColor}
 */
export function parseColorset(dirName, source) {
  const parsed = JSON.parse(source);
  const entries = Array.isArray(parsed.colors) ? parsed.colors : [];
  const isDark = (/** @type {{ appearances?: {appearance: string, value: string}[] }} */ entry) =>
    (entry.appearances ?? []).some((a) => a.appearance === 'luminosity' && a.value === 'dark');
  const light = entries.find((e) => !isDark(e) && e.color);
  const dark = entries.find((e) => isDark(e) && e.color);
  if (!light) throw new Error(`${dirName}: no universal (light) colour`);
  const lightCss = cssColorFor(light.color);
  return {
    token: tokenNameFor(dirName),
    light: lightCss,
    dark: dark ? cssColorFor(dark.color) : lightCss,
  };
}

/**
 * Every colorset in the catalogue, sorted by token name so the generated file
 * is stable regardless of directory order.
 *
 * @param {string} absDir
 * @returns {IosColor[]}
 */
export function readColorsets(absDir) {
  const dirs = readdirSync(absDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.colorset'))
    .map((entry) => entry.name);
  const colors = dirs.map((name) =>
    parseColorset(name, readFileSync(join(absDir, name, 'Contents.json'), 'utf8'))
  );
  return colors.toSorted((a, b) => a.token.localeCompare(b.token));
}

/**
 * @param {IosColor[]} colors
 * @returns {string}
 */
export function renderTokensCss(colors) {
  const light = colors.map((c) => `  --ios-${c.token}: ${c.light};`).join('\n');
  const dark = colors.map((c) => `  --ios-${c.token}: ${c.dark};`).join('\n');
  return `/*
 * GENERATED — do not edit.
 *
 * Written by scripts/design-ios-tokens.mjs from
 * ${XCASSETS_DIR}.
 * Run \`mise run design:ios-tokens\` after changing a colorset; CI regenerates
 * this file and diffs it.
 *
 * Both appearances come from the catalogue. A colorset with no dark entry
 * repeats its light value, which is what iOS resolves.
 */

:root {
${light}
}

.dark {
${dark}
}
`;
}

/** The sheet the current catalogue produces. */
export function generate() {
  const colors = readColorsets(join(repoRoot, XCASSETS_DIR));
  if (colors.length < MIN_COLORSETS) {
    throw new Error(
      `design-ios-tokens: found only ${colors.length} colorset(s) in ${XCASSETS_DIR}, ` +
        `below the floor of ${MIN_COLORSETS}. Discovery is broken — refusing to write a sheet ` +
        `that would silently drop colours the app has.`
    );
  }
  return renderTokensCss(colors);
}

function selfTest() {
  const contents = JSON.stringify({
    colors: [
      { color: { components: { alpha: '1.000', red: '0x0B', green: '0x5F', blue: '0xD0' } } },
      {
        appearances: [{ appearance: 'luminosity', value: 'dark' }],
        color: { components: { alpha: '1.000', red: '0x4C', green: '0x9A', blue: '0xFF' } },
      },
    ],
  });
  const parsed = parseColorset('popsMutedForeground.colorset', contents);
  const namesOk =
    tokenNameFor('popsAccent.colorset') === 'accent' &&
    tokenNameFor('popsMutedForeground.colorset') === 'muted-foreground';
  const parseOk =
    parsed.token === 'muted-foreground' && parsed.light === '#0b5fd0' && parsed.dark === '#4c9aff';

  const lightOnly = parseColorset(
    'popsX.colorset',
    JSON.stringify({
      colors: [
        { color: { components: { alpha: '1.000', red: '0x00', green: '0x00', blue: '0x00' } } },
      ],
    })
  );
  const fallbackOk = lightOnly.dark === '#000000';

  const translucent = parseColorset(
    'popsY.colorset',
    JSON.stringify({
      colors: [
        { color: { components: { alpha: '0.500', red: '0xFF', green: '0xFF', blue: '0xFF' } } },
      ],
    })
  );
  const alphaOk = translucent.light === '#ffffff80';

  const decimal = parseColorset(
    'popsZ.colorset',
    JSON.stringify({
      colors: [{ color: { components: { alpha: '1.000', red: '255', green: '0', blue: '17' } } }],
    })
  );
  const decimalOk = decimal.light === '#ff0011';

  let missingLightReported = false;
  try {
    parseColorset('popsGhost.colorset', JSON.stringify({ colors: [] }));
  } catch {
    missingLightReported = true;
  }

  const css = renderTokensCss([{ token: 'accent', light: '#0b5fd0', dark: '#4c9aff' }]);
  const cssOk =
    css.includes('  --ios-accent: #0b5fd0;') &&
    css.includes('.dark {') &&
    css.includes('  --ios-accent: #4c9aff;');

  const realCount = readColorsets(join(repoRoot, XCASSETS_DIR)).length;
  const realOk = realCount >= MIN_COLORSETS;

  const allOk =
    namesOk &&
    parseOk &&
    fallbackOk &&
    alphaOk &&
    decimalOk &&
    missingLightReported &&
    cssOk &&
    realOk;
  if (!allOk) {
    console.error('self-test FAILED');
    console.error(`  strips the pops prefix and kebab-cases: ${namesOk}`);
    console.error(`  reads both appearances:                 ${parseOk}`);
    console.error(`  repeats light when there is no dark:    ${fallbackOk}`);
    console.error(`  keeps a non-opaque alpha:               ${alphaOk}`);
    console.error(`  reads decimal components:               ${decimalOk}`);
    console.error(`  reports a colorset with no light entry: ${missingLightReported}`);
    console.error(`  renders both blocks:                    ${cssOk}`);
    console.error(`  reads the real catalogue:               ${realOk} (${realCount} colorsets)`);
    return false;
  }
  console.log(
    `self-test OK — parses both appearances, alpha and decimal components, falls back to the ` +
      `light value, reports a colorset with no light entry, and reads ${realCount} real colorsets.`
  );
  return true;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const css = generate();
  const target = join(repoRoot, TOKENS_PATH);
  writeFileSync(target, css);
  console.log(`Wrote ${TOKENS_PATH}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
