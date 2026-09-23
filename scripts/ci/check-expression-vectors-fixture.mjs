#!/usr/bin/env node
/**
 * Inventory expression-vectors fixture guard (Inventory ADR-002 D11).
 *
 * The phone evaluates computed fields itself and must reach exactly the
 * result the server's evaluator reaches. The pillar's own parser, evaluator
 * and sync projection generate one vector per case, and both languages assert
 * against it: `pillars/inventory/src/api/__tests__/expression-vectors.test.ts`
 * on the TypeScript side, `InventoryExpressionVectorTests` in AppCore on the
 * other. It exists twice, like `check-command-vectors-fixture.mjs`'s vector:
 *
 *   - `pillars/inventory/contracts/expression-vectors-v1.json` — canonical;
 *   - `clients/ios/Contracts/expression-vectors-v1.json` — vendored (ADR-043).
 *
 * Neither unit suite sees a vendored copy that lagged the canonical one; this
 * guard does, and restates the structural properties a byte-equality check
 * would still pass if both copies drifted together: every evaluated vector's
 * result names its own field, carries a closed state, and a value-bearing
 * state holds exactly one value.
 *
 * Usage:
 *   node scripts/ci/check-expression-vectors-fixture.mjs
 *   node scripts/ci/check-expression-vectors-fixture.mjs --self-test
 *
 * Exit 0 = every copy is present, byte-identical, and holds the format.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkCopies,
  discoverFilesNamed,
  findUndeclaredCopies,
  repoCopyReader,
  resolveCanonical,
  selfTestCopyHandling,
  selfTestRealTreeDiscovery,
  selfTestUndeclaredDiscovery,
  UNIT_KIND_ROOTS,
} from './fixture-copies.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const BASENAME = 'expression-vectors-v1.json';

/** @type {readonly import('./fixture-copies.mjs').FixtureCopy[]} */
export const FIXTURE_COPIES = Object.freeze([
  Object.freeze({
    role: 'canonical (the inventory evaluator produces the results)',
    path: 'pillars/inventory/contracts/expression-vectors-v1.json',
  }),
  Object.freeze({
    role: 'vendored (inside the iOS client, ADR-043)',
    path: 'clients/ios/Contracts/expression-vectors-v1.json',
  }),
]);

export const CANONICAL = resolveCanonical(FIXTURE_COPIES, 'pillars/inventory/');

/** Typed by hand so a copy silently dropped from or added to FIXTURE_COPIES fails the self-test. */
export const KNOWN_FIXTURE_COPY_PATHS = [
  'pillars/inventory/contracts/expression-vectors-v1.json',
  'clients/ios/Contracts/expression-vectors-v1.json',
];

const STATES = new Set(['ok', 'overridden', 'unavailable']);

/**
 * @typedef {object} VectorResult
 * @property {unknown} [fieldId]
 * @property {unknown} [state]
 * @property {unknown[]} [values]
 * @property {unknown} [reason]
 */

/**
 * @typedef {object} VectorExpectation
 * @property {unknown} outcome
 * @property {unknown} [code]
 * @property {VectorResult} [value]
 */

/**
 * @typedef {object} ExpressionVector
 * @property {unknown} name
 * @property {{ fieldId?: unknown }} [field]
 * @property {VectorExpectation} [expected]
 */

/**
 * @typedef {object} Fixture
 * @property {unknown} version
 * @property {ExpressionVector[]} vectors
 */

/**
 * @param {ExpressionVector} vector
 * @param {string} label
 * @returns {string[]}
 */
function checkExpected(vector, label) {
  const expected = vector.expected;
  if (expected?.outcome === 'rejected') {
    return typeof expected.code === 'string' && expected.code.length > 0
      ? []
      : [`${label}: a rejection carries no code`];
  }
  if (expected?.outcome !== 'evaluated') return [`${label}: expected.outcome is not closed`];
  const value = expected.value;
  const failures = [];
  if (value?.fieldId !== vector.field?.fieldId)
    failures.push(`${label}: the result does not name the vector's own field`);
  if (!STATES.has(String(value?.state)))
    failures.push(`${label}: result state is not ok/overridden/unavailable`);
  if (value?.state !== 'unavailable' && value?.values?.length !== 1)
    failures.push(`${label}: a value-bearing result must hold exactly one value`);
  if (value?.state === 'unavailable' && typeof value.reason !== 'string')
    failures.push(`${label}: an unavailable result carries no reason`);
  return failures;
}

/**
 * Every assertion against a parsed fixture; pure so the self-test can drive it.
 *
 * @param {Fixture} fixture
 * @returns {string[]}
 */
export function checkFixture(fixture) {
  const failures = [];
  if (fixture.version !== 1)
    failures.push(`version: fixture says ${JSON.stringify(fixture.version)}, contract says 1`);
  if (!Array.isArray(fixture.vectors) || fixture.vectors.length === 0) {
    failures.push('vectors: missing, not an array, or empty');
    return failures;
  }
  const names = new Set();
  for (const vector of fixture.vectors) {
    const label = typeof vector?.name === 'string' ? vector.name : '<unnamed vector>';
    if (typeof vector?.name !== 'string' || vector.name.length === 0)
      failures.push(`${label}: name is missing`);
    else if (names.has(vector.name)) failures.push(`${label}: name is not unique`);
    else names.add(vector.name);
    failures.push(...checkExpected(vector, label));
  }
  return failures;
}

function selfTestCopySet() {
  const declared = FIXTURE_COPIES.map((copy) => copy.path).toSorted();
  const expected = [...KNOWN_FIXTURE_COPY_PATHS].toSorted();
  const ok = JSON.stringify(declared) === JSON.stringify(expected);
  if (!ok)
    console.error('SELF-TEST FAILED (copy set): FIXTURE_COPIES does not match the pinned set.');
  else
    console.log(
      `self-test OK — declares exactly the ${expected.length} pinned fixture copy path(s).`
    );
  return ok;
}

/**
 * @param {Fixture} valid
 * @param {(vector: ExpressionVector) => ExpressionVector} change
 * @returns {Fixture}
 */
function corruptFirstEvaluated(valid, change) {
  const index = valid.vectors.findIndex((vector) => vector.expected?.outcome === 'evaluated');
  return {
    ...valid,
    vectors: valid.vectors.map((vector, at) => (at === index ? change(vector) : vector)),
  };
}

/**
 * @param {Fixture} valid
 * @param {(value: VectorResult) => VectorResult} change
 * @returns {Fixture}
 */
function corruptFirstResult(valid, change) {
  return corruptFirstEvaluated(valid, (vector) => ({
    ...vector,
    expected: {
      outcome: 'evaluated',
      ...vector.expected,
      value: change(vector.expected?.value ?? {}),
    },
  }));
}

/**
 * @param {Fixture} valid
 * @returns {boolean}
 */
function selfTest(valid) {
  const first = valid.vectors[0];
  if (first === undefined) {
    console.error('SELF-TEST FAILED: the committed vector has no vectors to corrupt');
    return false;
  }
  /** @type {[string, Fixture][]} */
  const corruptions = [
    ['the version pin drifted', { ...valid, version: 2 }],
    ['vectors is empty', { ...valid, vectors: [] }],
    ['two vectors share a name', { ...valid, vectors: [first, ...valid.vectors] }],
    [
      'a result names another field',
      corruptFirstResult(valid, (value) => ({ ...value, fieldId: 'other' })),
    ],
    [
      'a result state is unknown',
      corruptFirstResult(valid, (value) => ({ ...value, state: 'stale' })),
    ],
    [
      'a result holds two values',
      corruptFirstResult(valid, (value) => ({ ...value, state: 'ok', values: [1, 2] })),
    ],
    [
      'an outcome is neither evaluated nor rejected',
      corruptFirstEvaluated(valid, (vector) => ({ ...vector, expected: { outcome: 'skipped' } })),
    ],
  ];
  let ok = checkFixture(valid).length === 0;
  if (!ok) console.error('SELF-TEST FAILED: the committed vector does not pass its own checks');
  for (const [label, corrupted] of corruptions) {
    if (checkFixture(corrupted).length === 0) {
      console.error(`SELF-TEST FAILED: not caught — ${label}`);
      ok = false;
    }
  }
  if (!selfTestCopyHandling(FIXTURE_COPIES, CANONICAL.path, valid, checkFixture)) ok = false;
  if (!selfTestUndeclaredDiscovery(FIXTURE_COPIES)) ok = false;
  if (ok) console.log(`self-test OK — rejects ${corruptions.length} corruptions of the vector.`);
  return ok;
}

function main() {
  const argv = process.argv.slice(2);
  /** @type {(message: string) => never} */
  const bail = (message) => {
    console.error(message);
    process.exit(1);
  };
  const read = repoCopyReader(repoRoot, bail);
  if (argv.includes('--self-test')) {
    const copySet = selfTestCopySet();
    const discovery = selfTestRealTreeDiscovery(
      repoRoot,
      UNIT_KIND_ROOTS,
      BASENAME,
      FIXTURE_COPIES
    );
    const canonical = read(CANONICAL.path);
    if (canonical === null) bail(`FAIL — ${CANONICAL.path} does not exist`);
    /** @type {Fixture} */
    let valid;
    try {
      valid = JSON.parse(canonical);
    } catch (error) {
      bail(`FAIL — ${CANONICAL.path} is not parseable as JSON: ${String(error)}`);
    }
    process.exit(selfTest(valid) && copySet && discovery ? 0 : 1);
  }
  const discovered = discoverFilesNamed(repoRoot, UNIT_KIND_ROOTS, BASENAME);
  const failures = [
    ...checkCopies(FIXTURE_COPIES, CANONICAL.path, read, checkFixture),
    ...findUndeclaredCopies(discovered, FIXTURE_COPIES).map(
      (path) => `${path}: an undeclared copy of ${BASENAME} — declare it in FIXTURE_COPIES`
    ),
  ];
  if (failures.length === 0) {
    console.log(
      `OK — ${FIXTURE_COPIES.length} identical copies of the expression-vectors fixture.`
    );
    process.exit(0);
  }
  console.error(`FAIL — ${failures.length} expression-vectors problem(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nRegenerate with `mise run fixture:expression-vectors`, which rebuilds the vector from the ' +
      "pillar's evaluator and re-vendors the client's copy. Changing evaluator behaviour means " +
      'updating the Swift evaluator in the same change.'
  );
  process.exit(1);
}

if (import.meta.main) {
  main();
}
