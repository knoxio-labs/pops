#!/usr/bin/env node
/**
 * Receipt max-parts drift guard.
 *
 * "How many parts one receipt may be sent as" is written down three times,
 * in two languages, with nothing else in the build comparing them:
 *
 *   - `purchases` (`MAX_RECEIPT_PARTS`, `pillars/purchases/src/contract/rest-receipts.ts`)
 *     is the canonical limit — every part is paid for in the same model call.
 *   - `bfm` (`MOBILE_RECEIPT_MAX_PARTS`, `pillars/bfm/src/contract/rest-schemas.ts`)
 *     hand-mirrors it rather than importing it, because bfm may not depend on
 *     a sibling pillar's package.
 *   - the iOS app (`ReceiptPart.maxPerReceipt`,
 *     `clients/ios/Packages/AppCore/Sources/AppCore/ReceiptCapture/ReceiptPart.swift`)
 *     hand-mirrors bfm's number again, in a different language entirely, so
 *     the capture screen can refuse a too-long scan before it ever leaves the
 *     handset.
 *
 * The drift this guard exists for is survivable in one direction only: if
 * bfm's limit ever falls below purchases', or the iOS limit rises above
 * bfm's, the phone will happily send a scan the server rejects with a `400`
 * — bad, but loud. The dangerous direction, an iOS limit silently BELOW what
 * the server would accept, degrades in silence: a user just never sees the
 * option to add a ninth page. This guard collapses both directions to the
 * same rule — all three numbers agree — because "the safe direction" still
 * means every mismatch is either a rejected upload or a capability nobody
 * can reach, and there is no cost to requiring equality instead of two
 * different inequalities.
 *
 * This is a whole-tree, source-parsing check (reads the three files
 * directly, pulls in no third-party dependency at any depth) rather than an
 * import-and-compare: the iOS side is Swift, which nothing in this
 * workspace can `import`, so regex extraction is the only technique that
 * works across all three languages uniformly.
 *
 * Usage:
 *   node scripts/ci/check-receipt-max-parts-drift.mjs
 *   node scripts/ci/check-receipt-max-parts-drift.mjs --self-test
 *
 * Exit 0 = all three constants were found and agree. Exit 1 = a constant
 * could not be found or parsed (the file moved, the constant was renamed, or
 * its value is no longer a bare integer literal), or the three values
 * disagree. Exit 2 = usage error.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * @typedef {object} ConstantSource
 * @property {string} label      Short name used in violation messages.
 * @property {string} path       Repo-relative, posix-separated.
 * @property {RegExp} pattern    Must have exactly one capture group: the integer literal.
 */

/** @type {ConstantSource[]} */
export const SOURCES = [
  {
    label: 'purchases MAX_RECEIPT_PARTS',
    path: 'pillars/purchases/src/contract/rest-receipts.ts',
    pattern: /export const MAX_RECEIPT_PARTS\s*=\s*(\d+)\s*;/u,
  },
  {
    label: 'bfm MOBILE_RECEIPT_MAX_PARTS',
    path: 'pillars/bfm/src/contract/rest-schemas.ts',
    pattern: /export const MOBILE_RECEIPT_MAX_PARTS\s*=\s*(\d+)\s*;/u,
  },
  {
    label: 'iOS ReceiptPart.maxPerReceipt',
    path: 'clients/ios/Packages/AppCore/Sources/AppCore/ReceiptCapture/ReceiptPart.swift',
    pattern: /public static let maxPerReceipt\s*=\s*(\d+)/u,
  },
];

/**
 * @typedef {object} ExtractionResult
 * @property {ConstantSource} source
 * @property {number | null} value  `null` when the constant could not be found.
 * @property {string | null} error  Human-readable reason `value` is `null`.
 */

/**
 * Reads one source file and pulls its constant out with `source.pattern`.
 * Never throws — a missing file, a renamed constant, or a non-integer value
 * all come back as a named `error` rather than an exception, so one bad
 * source cannot hide the other two from being reported.
 *
 * @param {string} root
 * @param {ConstantSource} source
 * @returns {ExtractionResult}
 */
export function extractConstant(root, source) {
  const absPath = join(root, source.path);
  if (!existsSync(absPath)) {
    return { source, value: null, error: `${source.path} does not exist.` };
  }

  let text;
  try {
    text = readFileSync(absPath, 'utf8');
  } catch (err) {
    return {
      source,
      value: null,
      error: `${source.path} could not be read: ${/** @type {Error} */ (err).message}`,
    };
  }

  const match = source.pattern.exec(text);
  if (match === null) {
    return {
      source,
      value: null,
      error:
        `${source.label} was not found in ${source.path} — the constant was renamed, ` +
        'restructured, or the file no longer declares it in a form this guard recognises.',
    };
  }

  const value = Number.parseInt(match[1], 10);
  if (!Number.isInteger(value)) {
    return {
      source,
      value: null,
      error: `${source.label} in ${source.path} matched "${match[1]}", which is not an integer.`,
    };
  }

  return { source, value, error: null };
}

/**
 * @typedef {object} DriftReport
 * @property {ExtractionResult[]} results
 * @property {string[]} violations  Empty when every constant was found and they all agree.
 */

/**
 * @param {string} root
 * @param {ConstantSource[]} [sources]
 * @returns {DriftReport}
 */
export function findViolations(root, sources = SOURCES) {
  const results = sources.map((source) => extractConstant(root, source));

  /** @type {string[]} */
  const violations = [];
  for (const result of results) {
    if (result.error !== null) violations.push(result.error);
  }

  const found = results.filter(
    (/** @type {ExtractionResult} */ r) => /** @type {{value: number | null}} */ (r).value !== null
  );
  if (violations.length === 0 && found.length > 1) {
    const distinctValues = new Set(found.map((r) => r.value));
    if (distinctValues.size > 1) {
      const summary = found
        .map((r) => `${r.source.label} = ${r.value} (${r.source.path})`)
        .join('; ');
      violations.push(`max-parts constants disagree: ${summary}`);
    }
  }

  return { results, violations };
}

/** @returns {boolean} */
function selfTest() {
  const root = mkdtempSync(join(tmpdir(), 'receipt-max-parts-drift-'));
  try {
    /** @type {ConstantSource[]} */
    const fixtureSources = [
      {
        label: 'purchases MAX_RECEIPT_PARTS',
        path: 'purchases.ts',
        pattern: /export const MAX_RECEIPT_PARTS\s*=\s*(\d+)\s*;/u,
      },
      {
        label: 'bfm MOBILE_RECEIPT_MAX_PARTS',
        path: 'bfm.ts',
        pattern: /export const MOBILE_RECEIPT_MAX_PARTS\s*=\s*(\d+)\s*;/u,
      },
      {
        label: 'iOS ReceiptPart.maxPerReceipt',
        path: 'ReceiptPart.swift',
        pattern: /public static let maxPerReceipt\s*=\s*(\d+)/u,
      },
    ];

    /** @param {Record<string, string>} files */
    function write(files) {
      for (const [name, contents] of Object.entries(files)) {
        writeFileSync(join(root, name), contents);
      }
    }

    const checks = {};

    write({
      'purchases.ts': 'export const MAX_RECEIPT_PARTS = 8;\n',
      'bfm.ts': 'export const MOBILE_RECEIPT_MAX_PARTS = 8;\n',
      'ReceiptPart.swift': 'public static let maxPerReceipt = 8\n',
    });
    checks['agreeing constants produce no violation'] =
      findViolations(root, fixtureSources).violations.length === 0;

    write({
      'purchases.ts': 'export const MAX_RECEIPT_PARTS = 8;\n',
      'bfm.ts': 'export const MOBILE_RECEIPT_MAX_PARTS = 6;\n',
      'ReceiptPart.swift': 'public static let maxPerReceipt = 8\n',
    });
    {
      const drift = findViolations(root, fixtureSources);
      checks['a mismatched value is reported, naming both sides'] = drift.violations.some(
        (v) => v.includes('= 8') && v.includes('= 6')
      );
    }

    write({
      'purchases.ts': 'export const MAX_RECEIPT_PARTS = 8;\n',
      'bfm.ts': 'export const MOBILE_RECEIPT_MAX_PARTS = 8;\n',
      // Renamed — the exact failure mode a silently-non-matching regex would hide.
      'ReceiptPart.swift': 'public static let maximumPartsPerReceipt = 8\n',
    });
    {
      const drift = findViolations(root, fixtureSources);
      checks['a renamed constant is reported, not silently skipped'] = drift.violations.some((v) =>
        v.includes('was not found')
      );
    }

    write({
      'purchases.ts': 'export const MAX_RECEIPT_PARTS = 8;\n',
      'bfm.ts': 'export const MOBILE_RECEIPT_MAX_PARTS = 8;\n',
    });
    rmSync(join(root, 'ReceiptPart.swift'));
    checks['a missing file is reported, not silently skipped'] = findViolations(
      root,
      fixtureSources
    ).violations.some((v) => v.includes('does not exist'));

    write({
      'purchases.ts': 'export const MAX_RECEIPT_PARTS = 8;\n',
      'bfm.ts': 'export const MOBILE_RECEIPT_MAX_PARTS = 8;\n',
      'ReceiptPart.swift': 'public static let maxPerReceipt = eight\n',
    });
    checks['a non-integer value is reported'] = findViolations(
      root,
      fixtureSources
    ).violations.some((v) => v.includes('was not found'));

    checks['the real repo tree has no drift right now'] =
      findViolations(repoRoot).violations.length === 0;

    const ok = Object.values(checks).every(Boolean);
    if (!ok) {
      console.error('SELF-TEST FAILED:');
      for (const [name, pass] of Object.entries(checks)) console.error(`  ${name}: ${pass}`);
    } else {
      console.log(
        'self-test OK — agreement passes, mismatch/rename/missing-file/non-integer all report, ' +
          'and the real tree is clean.'
      );
    }
    return ok;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-receipt-max-parts-drift.mjs\n' +
        '       node scripts/ci/check-receipt-max-parts-drift.mjs --self-test\n\n' +
        'Compares the receipt max-parts constant across purchases, bfm and the iOS app, and ' +
        'fails when any of the three cannot be found or when they disagree.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { results, violations } = findViolations(repoRoot);

  for (const result of results) {
    if (result.error === null) {
      console.log(`${result.source.label} = ${result.value} (${result.source.path})`);
    }
  }

  if (violations.length > 0) {
    console.error(`FAIL — ${violations.length} receipt max-parts problem(s):`);
    for (const violation of violations) console.error(`  ${violation}`);
    process.exit(1);
  }

  console.log('OK — purchases, bfm and iOS agree on the receipt max-parts limit.');
  process.exit(0);
}

if (import.meta.main) {
  main();
}
