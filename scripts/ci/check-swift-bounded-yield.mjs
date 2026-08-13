#!/usr/bin/env node
/**
 * Bounded-yield poll guard (Swift).
 *
 * Three fixes landed in `clients/ios/Packages/Auth/Tests/AuthTests` for the
 * same defect shape (POPS-1908, then two more waits of the same shape in the
 * same file): a test waited for an async event by looping `Task.yield()`
 * against a condition, bounded either by a fixed iteration count or not
 * bounded at all. Both bounds are a proxy for "the task under test got
 * enough scheduling turns to make progress" — a proxy that is unsound under
 * real CPU starvation (documented in `ios-quality.yml`'s note on
 * `mise run -j 1`) and, for the unbounded form, can hang the suite outright
 * on a regression instead of failing it. The fix every time was the same:
 * replace the poll with a primitive that is genuinely signalled — a
 * continuation resumed exactly when the awaited event happens, not guessed
 * at by yielding and rechecking.
 *
 * A fourth sighting of the identical idiom (`clients/ios/Packages/AppCore`)
 * turned up only because someone happened to grep for it while fixing the
 * third. This guard is that grep, made permanent: it fails the build on any
 * `Task.yield()` call in `clients/ios` Swift source, so the next one is
 * caught at the PR that introduces it rather than the PR that happens to go
 * looking.
 *
 * NO ESCAPE HATCH BY DESIGN. A per-line suppression comment (`// yield-ok:`)
 * was considered and rejected — it would let a fifth sighting back in with a
 * one-line comment instead of a primitive, exactly the failure this guard
 * exists to close off. A genuine future need for cooperative yielding is rare
 * enough, and different enough each time, that it belongs in this file's own
 * allowlist (edited in the same PR that adds the call, visible in review) —
 * see ALLOWLISTED_FILES below — not in a comment a reviewer has to trust.
 *
 * SCOPE is `clients/ios/**\/*.swift`, matched against `git ls-files` so
 * `.build/` output and anything else untracked never enters the scan.
 * Comments are stripped per line (`//` to end of line) before matching, so a
 * doc comment that mentions `Task.yield()` in prose — as
 * `ConcurrencyProbes.swift` does, describing the pattern it replaced — is not
 * itself a violation. This is a line-based approximation, not a real Swift
 * parser: it does not understand block comments (`/* ... *\/`) or a `//`
 * inside a string literal. Neither has ever occurred around `Task.yield()` in
 * this tree, and a real parser is a much heavier guard than this one is
 * trying to be.
 *
 * TIER — install-free (Tier A, ADR-045 amendment). Pure `node:fs`/
 * `node:child_process`, no third-party import at any depth, so it runs
 * straight after `actions/checkout` with no `pnpm install`.
 *
 * Usage:
 *   node scripts/ci/check-swift-bounded-yield.mjs
 *   node scripts/ci/check-swift-bounded-yield.mjs --self-test
 *
 * Exit 0 = no disallowed `Task.yield()` call in scope. Exit 1 = a violation,
 * a read failure, or zero Swift files discovered under `clients/ios`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * Files permitted to call `Task.yield()` in real (non-comment) code, and why.
 * Empty today — every known call site was replaced by a genuinely-signalled
 * primitive. Add an entry here, in the same PR as the call, if a future need
 * is genuinely a cooperative yield rather than a poll waiting on an event.
 *
 * @type {Record<string, string>}
 */
export const ALLOWLISTED_FILES = {};

/**
 * @typedef {object} YieldHit
 * @property {number} line One-based line number.
 * @property {string} text The offending line, comment-stripped.
 */

/**
 * Strip a `//` line comment (naive: no block-comment or string-literal
 * awareness — see file header SCOPE). Trailing `//`-free text is returned
 * unchanged.
 *
 * @param {string} line
 * @returns {string}
 */
export function stripLineComment(line) {
  const idx = line.indexOf('//');
  return idx === -1 ? line : line.slice(0, idx);
}

/**
 * @param {string} contents
 * @returns {YieldHit[]}
 */
export function findYieldCalls(contents) {
  /** @type {YieldHit[]} */
  const hits = [];
  const lines = contents.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const code = stripLineComment(lines[i]);
    if (code.includes('Task.yield()')) {
      hits.push({ line: i + 1, text: lines[i].trim() });
    }
  }
  return hits;
}

/**
 * @param {string} root Absolute path to the repo root.
 * @returns {string[]} POSIX-style, repo-relative paths under clients/ios
 *   ending in .swift, per `git ls-files` (tracked only).
 */
export function listTrackedSwiftFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z', '--', 'clients/ios/**/*.swift'], {
    cwd: root,
    encoding: 'utf8',
  });
  return out.split('\0').filter((p) => p.length > 0);
}

/**
 * @typedef {object} FileViolations
 * @property {string} path
 * @property {YieldHit[]} hits
 */

/**
 * Pure core: given already-read file contents, report every non-allowlisted
 * file with a real (non-comment) `Task.yield()` call.
 *
 * @param {Array<{ path: string, contents: string }>} files
 * @returns {FileViolations[]}
 */
export function findViolations(files) {
  /** @type {FileViolations[]} */
  const violations = [];
  for (const { path, contents } of files) {
    if (path in ALLOWLISTED_FILES) continue;
    const hits = findYieldCalls(contents);
    if (hits.length > 0) violations.push({ path, hits });
  }
  return violations;
}

/**
 * @typedef {object} Evaluation
 * @property {boolean} ok
 * @property {'no-files-discovered' | 'read-failure' | 'violations' | undefined} [reason]
 * @property {string[]} [readFailures]
 * @property {FileViolations[]} [violations]
 */

/**
 * @param {{ discoveredCount: number, files: Array<{ path: string, contents: string }>, readFailures: string[] }} input
 * @returns {Evaluation}
 */
export function evaluate({ discoveredCount, files, readFailures }) {
  if (discoveredCount === 0) return { ok: false, reason: 'no-files-discovered' };
  if (readFailures.length > 0) return { ok: false, reason: 'read-failure', readFailures };
  const violations = findViolations(files);
  if (violations.length > 0) return { ok: false, reason: 'violations', violations };
  return { ok: true };
}

/**
 * @param {string} root
 * @returns {{ discoveredCount: number, files: Array<{ path: string, contents: string }>, readFailures: string[] }}
 */
function readTree(root) {
  const tracked = listTrackedSwiftFiles(root);
  /** @type {Array<{ path: string, contents: string }>} */
  const files = [];
  /** @type {string[]} */
  const readFailures = [];
  for (const relPath of tracked) {
    try {
      files.push({ path: relPath, contents: readFileSync(join(root, relPath), 'utf8') });
    } catch (error) {
      readFailures.push(`${relPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { discoveredCount: tracked.length, files, readFailures };
}

function run() {
  const { discoveredCount, files, readFailures } = readTree(repoRoot);
  const result = evaluate({ discoveredCount, files, readFailures });

  if (result.ok) {
    console.log(
      `OK — scanned ${String(files.length)} Swift file(s) under clients/ios; no disallowed ` +
        '`Task.yield()` calls.'
    );
    return true;
  }

  if (result.reason === 'no-files-discovered') {
    console.error(
      'FAIL — `git ls-files` found 0 Swift files under clients/ios. This almost certainly means ' +
        'the guard ran outside a git checkout, or clients/ios moved — fix the environment or this ' +
        "guard's path, do not read an empty scan as a clean one."
    );
    return false;
  }

  if (result.reason === 'read-failure') {
    console.error(`FAIL — ${String(result.readFailures?.length)} tracked file(s) unreadable:`);
    for (const failure of result.readFailures ?? []) console.error(`  ${failure}`);
    return false;
  }

  const violations = result.violations ?? [];
  const total = violations.reduce((n, v) => n + v.hits.length, 0);
  console.error(
    `FAIL — ${String(total)} disallowed \`Task.yield()\` call(s) across ${String(violations.length)} file(s):`
  );
  for (const { path, hits } of violations) {
    for (const hit of hits) {
      console.error(`  ${path}:${String(hit.line)} — ${hit.text}`);
    }
  }
  console.error(
    '\n`Task.yield()` polling a condition in a loop is a starvation-prone proxy for "the task ' +
      'under test made progress" — see this file\'s header for the three prior fixes of this exact ' +
      'shape. Replace the poll with a primitive that is genuinely signalled (a continuation resumed ' +
      'exactly when the event happens — see `Countdown` in ' +
      'clients/ios/Packages/Auth/Tests/AuthTests/ConcurrencyProbes.swift for the established shape). ' +
      'A real need for cooperative yielding, not event-waiting, belongs in ALLOWLISTED_FILES in ' +
      'scripts/ci/check-swift-bounded-yield.mjs, added in the same PR as the call.'
  );
  return false;
}

/**
 * Prove the guard reports rather than merely passes (ADR-045): the positive
 * case (a planted call is caught), the comment-stripping behaviour (a
 * mention in prose is not a violation), the allowlist escape hatch, and the
 * degenerate cases (zero files discovered, a read failure) each produce a
 * deterministic failure rather than silence or a crash.
 *
 * @returns {boolean}
 */
function selfTest() {
  /** @type {Record<string, boolean>} */
  const checks = {};

  checks['a real Task.yield() call is caught'] =
    findYieldCalls('func f() async {\n    await Task.yield()\n}\n').length === 1;

  checks['a Task.yield() mentioned only in a // comment is not caught'] =
    findYieldCalls('/// Mirrors the old poll: `await Task.yield()` in a loop.\n').length === 0;

  checks['a Task.yield() call with a trailing // comment on the same line is still caught'] =
    findYieldCalls('await Task.yield() // cooperative\n').length === 1;

  checks['line numbers are one-based and match the source'] =
    findYieldCalls('let a = 1\nlet b = 2\nawait Task.yield()\n')[0]?.line === 3;

  checks['findViolations skips a file listed in ALLOWLISTED_FILES'] = (() => {
    const path = 'clients/ios/Fake/Allowed.swift';
    const originalEntry = ALLOWLISTED_FILES[path];
    ALLOWLISTED_FILES[path] = 'self-test only';
    const violations = findViolations([{ path, contents: 'await Task.yield()\n' }]);
    if (originalEntry === undefined) delete ALLOWLISTED_FILES[path];
    else ALLOWLISTED_FILES[path] = originalEntry;
    return violations.length === 0;
  })();

  checks['findViolations reports a non-allowlisted file with a real call'] =
    findViolations([
      { path: 'clients/ios/Fake/NotAllowed.swift', contents: 'await Task.yield()\n' },
    ]).length === 1;

  checks['zero discovered files fails rather than passing vacuously'] =
    evaluate({ discoveredCount: 0, files: [], readFailures: [] }).reason === 'no-files-discovered';

  checks['a read failure surfaces rather than being treated as "no violations"'] =
    evaluate({
      discoveredCount: 1,
      files: [],
      readFailures: ['Ghost.swift: ENOENT'],
    }).reason === 'read-failure';

  checks['a planted violation reaches evaluate() as a failure'] =
    evaluate({
      discoveredCount: 1,
      files: [{ path: 'clients/ios/Fake/Ghost.swift', contents: 'await Task.yield()\n' }],
      readFailures: [],
    }).reason === 'violations';

  checks['a clean tree reaches evaluate() as ok'] = evaluate({
    discoveredCount: 1,
    files: [{ path: 'clients/ios/Fake/Ghost.swift', contents: 'let x = 1\n' }],
    readFailures: [],
  }).ok;

  // Discovery has to still see the real tree, or every check above is
  // proving a mechanism that no longer runs against anything.
  const realTracked = listTrackedSwiftFiles(repoRoot);
  checks['real `git ls-files` finds Swift files under clients/ios'] = realTracked.length > 0;

  // The whole point of this guard, after the fix it shipped alongside,
  // is that the real tree has ZERO real Task.yield() calls left — assert
  // that directly, so a regression that reintroduces one fails this
  // self-test the moment someone runs it, not just the real CI job.
  const { files, readFailures } = readTree(repoRoot);
  checks['reading the real tree hits no failures'] = readFailures.length === 0;
  checks['the real tree currently has zero disallowed Task.yield() calls'] =
    findViolations(files).length === 0;

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(`self-test OK — ${String(Object.keys(checks).length)} assertion(s) held.`);
  } else {
    console.error('SELF-TEST FAILED:');
    for (const [label, passed] of Object.entries(checks)) {
      console.error(`  ${passed ? 'OK' : 'XX'}  ${label}`);
    }
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-swift-bounded-yield.mjs [--self-test]\n' +
        'Fails on any `Task.yield()` call in clients/ios Swift source outside ALLOWLISTED_FILES.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  process.exit(run() ? 0 : 1);
}

if (import.meta.main) {
  main();
}
