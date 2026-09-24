#!/usr/bin/env node
/**
 * Inventory protocol-2 value-vectors fixture guard (POPS-4403).
 *
 * The pillar's command engine and sync projection generate every primitive
 * kind, cardinality and reference/computed state a value can take; BFM's
 * contract test and the iOS client's transport-to-replica round trip assert
 * against the same file:
 *
 *   - `pillars/inventory/contracts/value-vectors-v1.json` — canonical;
 *   - `pillars/bfm/contracts/value-vectors-v1.json` — vendored, because BFM
 *     mirrors inventory's wire schemas without depending on the pillar;
 *   - `clients/ios/Contracts/value-vectors-v1.json` — vendored (ADR-043).
 *
 * Neither consumer suite sees a copy that lagged the canonical one; this guard
 * does, and restates the structural properties a byte-equality check would
 * still pass if every copy drifted together: each vector's value belongs to
 * its own item and field, both catalogue revisions the values name are
 * present, and every negative case is of a known category.
 *
 * Usage:
 *   node scripts/ci/check-value-vectors-fixture.mjs
 *   node scripts/ci/check-value-vectors-fixture.mjs --self-test
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

const BASENAME = 'value-vectors-v1.json';

/** @type {readonly import('./fixture-copies.mjs').FixtureCopy[]} */
export const FIXTURE_COPIES = Object.freeze([
  Object.freeze({
    role: 'canonical (the inventory command engine and sync projection produce the values)',
    path: 'pillars/inventory/contracts/value-vectors-v1.json',
  }),
  Object.freeze({
    role: "vendored (BFM's mirrored wire schemas)",
    path: 'pillars/bfm/contracts/value-vectors-v1.json',
  }),
  Object.freeze({
    role: 'vendored (inside the iOS client, ADR-043)',
    path: 'clients/ios/Contracts/value-vectors-v1.json',
  }),
]);

export const CANONICAL = resolveCanonical(FIXTURE_COPIES, 'pillars/inventory/');

/** Typed by hand so a copy silently dropped from or added to FIXTURE_COPIES fails the self-test. */
export const KNOWN_FIXTURE_COPY_PATHS = [
  'pillars/inventory/contracts/value-vectors-v1.json',
  'pillars/bfm/contracts/value-vectors-v1.json',
  'clients/ios/Contracts/value-vectors-v1.json',
];

const NEGATIVE_CATEGORIES = new Set([
  'malformed_value',
  'unknown_kind',
  'protocol_above_supported',
]);

/**
 * @typedef {object} ValueVector
 * @property {unknown} name
 * @property {unknown} storage
 * @property {unknown} fieldId
 * @property {unknown} itemId
 * @property {{ id?: unknown }} [item]
 * @property {{ fieldId?: unknown } | null} [fieldValue]
 * @property {{ fieldId?: unknown } | null} [computedValue]
 */

/**
 * @typedef {object} Fixture
 * @property {unknown} version
 * @property {unknown} liveRevision
 * @property {unknown} currentRevision
 * @property {{ revision?: { revision?: unknown } }[]} catalogues
 * @property {ValueVector[]} vectors
 * @property {{ name?: unknown, category?: unknown }[]} negativeVectors
 */

/**
 * @param {ValueVector} vector
 * @param {string} label
 * @returns {string[]}
 */
function checkVector(vector, label) {
  const failures = [];
  if (vector.item?.id !== vector.itemId) failures.push(`${label}: item is not the vector's item`);
  const value = vector.storage === 'computed' ? vector.computedValue : vector.fieldValue;
  if (vector.storage !== 'stored' && vector.storage !== 'computed')
    failures.push(`${label}: storage is not stored/computed`);
  else if (value != null && value.fieldId !== vector.fieldId)
    failures.push(`${label}: the value does not name the vector's own field`);
  if (vector.storage === 'computed' && value == null)
    failures.push(`${label}: a computed vector carries no computed value`);
  return failures;
}

/**
 * @param {unknown[]} entries
 * @param {string} kind
 * @returns {string[]}
 */
function checkNames(entries, kind) {
  const failures = [];
  const names = new Set();
  for (const entry of entries) {
    const name = /** @type {{ name?: unknown }} */ (entry)?.name;
    if (typeof name !== 'string' || name.length === 0) failures.push(`${kind}: a name is missing`);
    else if (names.has(name)) failures.push(`${name}: name is not unique`);
    else names.add(name);
  }
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
  const revisions = new Set(
    (Array.isArray(fixture.catalogues) ? fixture.catalogues : []).map(
      (catalogue) => catalogue?.revision?.revision
    )
  );
  for (const revision of [fixture.liveRevision, fixture.currentRevision]) {
    if (!revisions.has(revision))
      failures.push(`catalogues: revision ${JSON.stringify(revision)} is missing`);
  }
  failures.push(...checkNames([...fixture.vectors, ...(fixture.negativeVectors ?? [])], 'vector'));
  for (const vector of fixture.vectors) {
    failures.push(...checkVector(vector, typeof vector?.name === 'string' ? vector.name : '?'));
  }
  const categories = new Set((fixture.negativeVectors ?? []).map((vector) => vector?.category));
  for (const category of categories) {
    if (!NEGATIVE_CATEGORIES.has(String(category)))
      failures.push(`negativeVectors: unknown category ${JSON.stringify(category)}`);
  }
  for (const category of NEGATIVE_CATEGORIES) {
    if (!categories.has(category)) failures.push(`negativeVectors: no ${category} case`);
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
 * @param {(vector: ValueVector) => ValueVector} change
 * @param {string} storage
 * @returns {Fixture}
 */
function corruptFirst(valid, change, storage) {
  const index = valid.vectors.findIndex((vector) => vector.storage === storage);
  return {
    ...valid,
    vectors: valid.vectors.map((vector, at) => (at === index ? change(vector) : vector)),
  };
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
    ['a catalogue revision is missing', { ...valid, catalogues: valid.catalogues.slice(1) }],
    [
      'a stored value names another field',
      corruptFirst(
        valid,
        (vector) => ({ ...vector, fieldValue: { ...vector.fieldValue, fieldId: 'other' } }),
        'stored'
      ),
    ],
    [
      'a computed vector lost its value',
      corruptFirst(valid, (vector) => ({ ...vector, computedValue: null }), 'computed'),
    ],
    [
      'a vector carries another item',
      corruptFirst(valid, (vector) => ({ ...vector, itemId: 'other' }), 'stored'),
    ],
    [
      'a negative category is unknown',
      { ...valid, negativeVectors: [...valid.negativeVectors, { name: 'x', category: 'maybe' }] },
    ],
    [
      'a negative category has no case',
      {
        ...valid,
        negativeVectors: valid.negativeVectors.filter(
          (vector) => vector.category !== 'unknown_kind'
        ),
      },
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
    console.log(`OK — ${FIXTURE_COPIES.length} identical copies of the value-vectors fixture.`);
    process.exit(0);
  }
  console.error(`FAIL — ${failures.length} value-vectors problem(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nRegenerate with `mise run fixture:value-vectors`, which rebuilds the vectors from the ' +
      "pillar's command engine and re-vendors the BFM and iOS copies. A changed value shape " +
      'means updating the BFM schemas and the Swift decode in the same change.'
  );
  process.exit(1);
}

if (import.meta.main) {
  main();
}
