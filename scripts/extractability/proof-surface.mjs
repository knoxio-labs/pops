#!/usr/bin/env node
/**
 * EX-2 helper — decide what extraction proof a unit owes (sandbox.sh's skip
 * decision), and say so out loud either way.
 *
 * "Is there a build/typecheck/test surface to prove" used to be three blind
 * `package.json` script-name lookups in sandbox.sh itself. Rename or drop all
 * three and the unit looked identical to a genuinely data-only package —
 * sandbox.sh skipped with exit 0, no evidence. This makes the two cases
 * distinguishable:
 *
 *   - a recognized script is present (`build`, `typecheck`, `test:coverage` or
 *     `test`) -> prove it; sandbox.sh runs its existing install/build/
 *     typecheck/test.
 *   - none present, but the unit declares
 *     `pkg.pops.extractability.noProofSurface` as a non-empty string -> a
 *     deliberate, auditable opt-out (e.g. a data-only package like
 *     `libs/locales`); skip, and print the declared reason.
 *   - none present and no declared opt-out -> not a skip. Either a proof
 *     script was renamed or dropped by accident, or the unit is genuinely
 *     data-only and is missing the marker above. Either way this is reported
 *     as a violation, not silence.
 *
 * Usage: node scripts/extractability/proof-surface.mjs <unit-dir>
 *
 * Prints exactly seven lines to stdout, in this fixed order, so the caller can
 * read them positionally (`mapfile -t proof <<<"$(...)"` in sandbox.sh).
 * DECISION is deliberately last and is the one field that is never empty:
 * `$(...)` command substitution strips ALL trailing newlines, so if the last
 * field COULD be empty, an empty trailing field would be silently swallowed
 * along with them and the array would come up one short under `set -u` —
 * exactly the kind of silent data loss this script exists to stop sandbox.sh
 * from having.
 *   1. HAS_BUILD              '1' or ''
 *   2. HAS_TYPECHECK          '1' or ''
 *   3. TEST_SCRIPT            'test:coverage', 'test', or ''
 *   4. HAS_TEST               '1' or ''
 *   5. SCRIPT_NAMES           the unit's declared script names, comma-joined
 *   6. NO_PROOF_SURFACE_REASON  the declared opt-out reason, or ''
 *   7. DECISION               'prove' | 'skip-declared' | 'violation' (never empty)
 * Fields 5 and 6 come from package.json content (script names, the free-form
 * opt-out reason) rather than this script's own fixed vocabulary, so any
 * embedded newline in either is collapsed to a space before printing — the
 * 7-line contract must hold regardless of what a unit's package.json contains.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** @param {unknown} value */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * @param {Record<string, unknown>} scripts
 * @returns {'test:coverage' | 'test' | null}
 */
function resolveTestScript(scripts) {
  if (isNonEmptyString(scripts['test:coverage'])) return 'test:coverage';
  if (isNonEmptyString(scripts.test)) return 'test';
  return null;
}

/**
 * @param {boolean} hasRecognizedSurface
 * @param {string | null} noProofSurfaceReason
 * @returns {'prove' | 'skip-declared' | 'violation'}
 */
function resolveDecision(hasRecognizedSurface, noProofSurfaceReason) {
  if (hasRecognizedSurface) return 'prove';
  if (noProofSurfaceReason) return 'skip-declared';
  return 'violation';
}

/**
 * @param {Record<string, unknown>} pkg
 * @returns {{
 *   hasBuild: boolean,
 *   hasTypecheck: boolean,
 *   testScript: 'test:coverage' | 'test' | null,
 *   hasTest: boolean,
 *   scriptNames: string[],
 *   noProofSurfaceReason: string | null,
 *   decision: 'prove' | 'skip-declared' | 'violation',
 * }}
 */
export function computeProofSurface(pkg) {
  const scripts =
    pkg.scripts && typeof pkg.scripts === 'object'
      ? /** @type {Record<string, unknown>} */ (pkg.scripts)
      : {};
  const scriptNames = Object.keys(scripts).toSorted();

  const hasBuild = isNonEmptyString(scripts.build);
  const hasTypecheck = isNonEmptyString(scripts.typecheck);
  const testScript = resolveTestScript(scripts);
  const hasTest = testScript !== null;

  const reason = /** @type {any} */ (pkg)?.pops?.extractability?.noProofSurface;
  const noProofSurfaceReason =
    typeof reason === 'string' && reason.trim().length > 0 ? reason : null;

  const hasRecognizedSurface = hasBuild || hasTypecheck || hasTest;
  const decision = resolveDecision(hasRecognizedSurface, noProofSurfaceReason);

  return {
    hasBuild,
    hasTypecheck,
    testScript,
    hasTest,
    scriptNames,
    noProofSurfaceReason,
    decision,
  };
}

/**
 * Collapses embedded newlines/carriage-returns to spaces. `noProofSurface` is
 * free-form JSON text and could legally contain `\n`/`\r`; SCRIPT_NAMES is
 * derived from package.json keys and unlikely to, but both cross the same
 * line-delimited wire format below, so both go through this before printing —
 * an embedded newline must never be able to grow the output past the 7 lines
 * `sandbox.sh` reads positionally.
 * @param {string} value
 */
export function toWireLine(value) {
  return value.replace(/\r\n|\r|\n/g, ' ');
}

/** @param {string[]} argv */
function main(argv) {
  const [unitDir] = argv;
  if (!unitDir) {
    process.stderr.write('usage: proof-surface.mjs <unit-dir>\n');
    return 2;
  }
  /** @type {Record<string, unknown>} */
  const pkg = JSON.parse(readFileSync(join(unitDir, 'package.json'), 'utf8'));
  const surface = computeProofSurface(pkg);

  process.stdout.write(
    [
      surface.hasBuild ? '1' : '',
      surface.hasTypecheck ? '1' : '',
      surface.testScript ?? '',
      surface.hasTest ? '1' : '',
      toWireLine(surface.scriptNames.join(', ')),
      toWireLine(surface.noProofSurfaceReason ?? ''),
      surface.decision,
    ].join('\n') + '\n'
  );
  return 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
