#!/usr/bin/env node
/**
 * iOS design-token drift gate.
 *
 * `pillars/design/src/frames/ios/tokens.css` is generated from the iOS app's
 * asset catalogue by `scripts/design-ios-tokens.mjs`. Generated-and-checked-in
 * is only safe if something notices when the two disagree: without this gate a
 * colorset edit lands in the app, the playground keeps painting the old value,
 * and the iPhone frame quietly stops being a picture of the product.
 *
 * The check is a regenerate-and-diff, so it fails for either cause — an asset
 * changed without running the generator, or the sheet hand-edited.
 *
 * Usage:
 *   node scripts/ci/check-ios-design-tokens.mjs
 *   node scripts/ci/check-ios-design-tokens.mjs --self-test
 *
 * Exit 0 when the sheet matches; 1 on drift or a failed self-test.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  generate,
  parseColorset,
  renderTokensCss,
  repoRoot,
  TOKENS_PATH,
} from '../design-ios-tokens.mjs';

/**
 * The first line that differs, so the failure names a colour rather than
 * telling the reader to diff two files themselves.
 *
 * @param {string} expected
 * @param {string} actual
 * @returns {string}
 */
export function firstDifference(expected, actual) {
  const e = expected.split('\n');
  const a = actual.split('\n');
  for (let i = 0; i < Math.max(e.length, a.length); i += 1) {
    if (e[i] !== a[i]) {
      return `line ${i + 1}: expected ${JSON.stringify(e[i] ?? null)}, found ${JSON.stringify(a[i] ?? null)}`;
    }
  }
  return 'no line differs (trailing bytes only)';
}

function check() {
  const target = join(repoRoot, TOKENS_PATH);
  if (!existsSync(target)) {
    console.error(`✗ ${TOKENS_PATH} does not exist. Run \`mise run design:ios-tokens\`.`);
    return false;
  }
  const expected = generate();
  const actual = readFileSync(target, 'utf8');
  if (expected === actual) {
    const count = expected.split('\n').filter((line) => line.startsWith('  --ios-')).length / 2;
    console.log(
      `OK — ${TOKENS_PATH} matches the asset catalogue (${count} colours, both appearances).`
    );
    return true;
  }
  console.error(
    `✗ ${TOKENS_PATH} does not match the asset catalogue.\n` +
      `  ${firstDifference(expected, actual)}\n` +
      `  Run \`mise run design:ios-tokens\` and commit the result.`
  );
  return false;
}

function colorset(/** @type {string} */ light, /** @type {string} */ dark) {
  return JSON.stringify({
    colors: [
      {
        color: {
          components: {
            alpha: '1.000',
            red: `0x${light.slice(0, 2)}`,
            green: `0x${light.slice(2, 4)}`,
            blue: `0x${light.slice(4, 6)}`,
          },
        },
      },
      {
        appearances: [{ appearance: 'luminosity', value: 'dark' }],
        color: {
          components: {
            alpha: '1.000',
            red: `0x${dark.slice(0, 2)}`,
            green: `0x${dark.slice(2, 4)}`,
            blue: `0x${dark.slice(4, 6)}`,
          },
        },
      },
    ],
  });
}

function selfTest() {
  const before = renderTokensCss([
    parseColorset('popsAccent.colorset', colorset('0B5FD0', '4C9AFF')),
  ]);
  const afterLight = renderTokensCss([
    parseColorset('popsAccent.colorset', colorset('0B5FD1', '4C9AFF')),
  ]);
  const afterDark = renderTokensCss([
    parseColorset('popsAccent.colorset', colorset('0B5FD0', '4C9AFE')),
  ]);
  const renamed = renderTokensCss([
    parseColorset('popsTint.colorset', colorset('0B5FD0', '4C9AFF')),
  ]);

  const reportsLightChange = before !== afterLight;
  const reportsDarkChange = before !== afterDark;
  const reportsRename = before !== renamed;
  const identicalPasses =
    before ===
    renderTokensCss([parseColorset('popsAccent.colorset', colorset('0B5FD0', '4C9AFF'))]);
  const namesTheLine = firstDifference(before, afterLight).includes('line ');
  const namesADarkLine = firstDifference(before, afterDark).includes('--ios-accent');
  const realTreeMatches = check();

  const allOk =
    reportsLightChange &&
    reportsDarkChange &&
    reportsRename &&
    identicalPasses &&
    namesTheLine &&
    namesADarkLine &&
    realTreeMatches;
  if (!allOk) {
    console.error('self-test FAILED');
    console.error(`  reports a changed light value:   ${reportsLightChange}`);
    console.error(`  reports a changed dark value:    ${reportsDarkChange}`);
    console.error(`  reports a renamed colorset:      ${reportsRename}`);
    console.error(`  passes an identical catalogue:   ${identicalPasses}`);
    console.error(`  names the differing line:        ${namesTheLine}`);
    console.error(`  names the token in a dark diff:  ${namesADarkLine}`);
    console.error(`  the real tree matches:           ${realTreeMatches}`);
    return false;
  }
  console.log(
    'self-test OK — reports a changed colour in either appearance and a renamed colorset, ' +
      'passes an unchanged one, and names the line that differs.'
  );
  return true;
}

const ok = process.argv.includes('--self-test') ? selfTest() : check();
process.exit(ok ? 0 : 1);
