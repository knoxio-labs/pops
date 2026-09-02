#!/usr/bin/env node
/**
 * Design-surface predicate: is a diff confined to the design playground's
 * design surface?
 *
 * The design surface is the three directories a designer edits in
 * `pillars/design` — screens, experiments and fixtures (see that pillar's
 * README). A pull request that touches nothing else is a design iteration,
 * and AGENTS.md exempts exactly that from the LLM review, the findings gate's
 * wait for it, and the test mandate. Everything else in the pillar — its
 * chrome, frames, registry, image, and later its API — is plumbing and gets
 * the ordinary treatment.
 *
 * Two workflows ask this question and MUST answer it identically:
 * `pr-review.yml` skips the review when it is true, and
 * `review-findings-gate.yml` (a required check) stops waiting for a review
 * that will never arrive. Two copies of the prefix list would drift, and the
 * drift would be a required check that polls for ten minutes and fails on
 * every design PR — so the list lives here once, and both workflows pipe
 * their changed-file list through this script.
 *
 * The answer is FAIL-CLOSED. An empty list, a list the caller could not
 * fetch, or a single path outside the surface all answer "not surface-only",
 * which sends the PR to the ordinary review. The exemption is the exception
 * and has to be proven, never assumed.
 *
 * Usage:
 *   gh api --paginate repos/$REPO/pulls/$PR/files --jq '.[].filename' \
 *     | node scripts/ci/design-surface-only.mjs
 *   node scripts/ci/design-surface-only.mjs --self-test
 *
 * Exit 0 = every listed path is on the design surface, and there was at
 * least one. Exit 1 = not surface-only (including nothing listed). Exit 2 =
 * usage error or a failed self-test.
 *
 * Tier A (ADR-045 amendment): stdlib only, runs before any install.
 */
import { readFileSync } from 'node:fs';

/**
 * The design surface, as repo-relative directory prefixes. Adding a fourth
 * directory to the surface means adding it here AND to the sentence in
 * AGENTS.md that defines it; the two are the same list.
 */
export const DESIGN_SURFACE_PREFIXES = Object.freeze([
  'pillars/design/src/screens/',
  'pillars/design/src/experiments/',
  'pillars/design/src/fixtures/',
]);

/**
 * Whether every path in `paths` lies under one of the surface prefixes.
 * Paths are repo-relative as GitHub reports them. Empty input is not
 * surface-only: no evidence, no exemption.
 *
 * @param {readonly string[]} paths
 * @returns {boolean}
 */
export function isDesignSurfaceOnly(paths) {
  const listed = paths.map((p) => p.trim()).filter((p) => p.length > 0);
  if (listed.length === 0) return false;
  return listed.every((path) => DESIGN_SURFACE_PREFIXES.some((prefix) => path.startsWith(prefix)));
}

/**
 * Split newline-separated input into paths. Windows line endings and a
 * trailing newline both come out as nothing rather than as a bogus path.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function parsePathList(text) {
  return text.split(/\r?\n/u).filter((line) => line.trim().length > 0);
}

/**
 * The degenerate cases this predicate must get right, in the ADR-045 sense:
 * the exemption must be provable, and every way the evidence can be missing
 * or wrong has to come out as "not exempt". Returns the names of failed
 * checks; empty means the self-test passed.
 *
 * @returns {string[]}
 */
export function selfTest() {
  /** @type {[string, boolean, string[]][]} */
  const cases = [
    ['one screen', true, ['pillars/design/src/screens/finance/import-review.tsx']],
    [
      'an experiment and its fixture',
      true,
      [
        'pillars/design/src/experiments/x/experiment.yaml',
        'pillars/design/src/experiments/x/variants/a/screens/f/s.tsx',
        'pillars/design/src/fixtures/rows.ts',
      ],
    ],
    ['nothing listed', false, []],
    ['only blank lines', false, ['', '   ']],
    [
      'a screen plus the playground chrome',
      false,
      ['pillars/design/src/screens/f/s.tsx', 'pillars/design/src/shell/Dock.tsx'],
    ],
    [
      'a screen plus a file outside the pillar',
      false,
      ['pillars/design/src/screens/f/s.tsx', 'AGENTS.md'],
    ],
    ['the pillar root, not the surface', false, ['pillars/design/package.json']],
    ['a lookalike prefix', false, ['pillars/design/src/screens-old/f/s.tsx']],
    ['a path that merely contains the prefix', false, ['docs/pillars/design/src/screens/x.tsx']],
  ];
  const failures = [];
  for (const [label, expected, paths] of cases) {
    if (isDesignSurfaceOnly(paths) !== expected) failures.push(label);
  }
  if (parsePathList('a\r\nb\n\n').join(',') !== 'a,b') failures.push('parsePathList');
  return failures;
}

/**
 * @param {string[]} argv
 * @returns {number}
 */
function main(argv) {
  if (argv.includes('--self-test')) {
    const failures = selfTest();
    if (failures.length > 0) {
      process.stderr.write(`design-surface-only self-test FAILED: ${failures.join(', ')}\n`);
      return 2;
    }
    process.stdout.write('design-surface-only self-test OK\n');
    return 0;
  }
  if (argv.length > 0) {
    process.stderr.write(
      'usage: <changed paths, one per line> | node scripts/ci/design-surface-only.mjs\n' +
        '       node scripts/ci/design-surface-only.mjs --self-test\n'
    );
    return 2;
  }
  let input = '';
  try {
    input = readFileSync(0, 'utf8');
  } catch {
    // No stdin at all reads as an empty list, which is "not surface-only".
  }
  const paths = parsePathList(input);
  const surfaceOnly = isDesignSurfaceOnly(paths);
  process.stdout.write(
    surfaceOnly
      ? `design surface only: ${paths.length} path(s), all under ${DESIGN_SURFACE_PREFIXES.join(' | ')}\n`
      : `not design-surface only: ${paths.length} path(s) listed\n`
  );
  return surfaceOnly ? 0 : 1;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
