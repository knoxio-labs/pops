#!/usr/bin/env node
/**
 * Inventory command-vectors fixture guard (Inventory ADR-002 D11).
 *
 * A Swift reducer applies every inventory command locally (offline-first) and
 * has to reach the same outcome the TypeScript command engine reaches on the
 * server. No compiler sees both implementations, so the engine's own test
 * suite generates one fixture per registered op — seed state, the mutation
 * envelope, and the engine's real outcome — and both languages assert against
 * it: `pillars/inventory/src/domain/commands/__tests__/command-vectors.test.ts`
 * on the TypeScript side, the Swift reducer's own suite (B3) on the other.
 *
 * That vector exists twice, the same shape ADR-033 established for OpenAPI
 * snapshots and the arrangement `check-refresh-message-fixture.mjs` already
 * uses for a non-OpenAPI vector:
 *
 *   - `pillars/inventory/contracts/command-vectors-v1.json` — canonical,
 *     because the command engine is the party that produces the outcomes;
 *   - `clients/ios/Contracts/command-vectors-v1.json` — vendored, because
 *     ADR-043 forbids the client reading a path under `pillars/`.
 *
 * `scripts/ci/check-vendored-contracts.mjs` cannot cover this leg: it pairs a
 * vendored copy with `pillars/<id>/openapi/<id>.openapi.json` by filename, and
 * this fixture is neither named nor located that way — it is a hand-generated
 * test vector, not an OpenAPI snapshot. So this guard follows
 * `check-refresh-message-fixture.mjs`'s pattern instead, sharing its copy
 * machinery in `fixture-copies.mjs` (ADR-002's own text for slice B2 says so:
 * "the same drift guard as the refresh-message vector").
 *
 * ## What this guard adds over the two unit suites
 *
 * `command-vectors.test.ts` already asserts the TypeScript side regenerates
 * byte-for-byte the same file. Neither unit suite catches a vendored copy that
 * simply lagged — a change landed and regenerated the canonical file but
 * nobody re-ran `mise run fixture:command-vectors:vendor`. This guard also
 * restates a few structural properties a plain byte-equality check would
 * still pass if both copies drifted together in the same broken regeneration:
 * every vector's own `op` must match the `mutation.op` it records, and the
 * `outcome.mutationId` must be the `mutation.mutationId` it is the outcome of
 * — the two ends of one causal record, not independently generated fields.
 *
 * Usage:
 *   node scripts/ci/check-command-vectors-fixture.mjs
 *   node scripts/ci/check-command-vectors-fixture.mjs --self-test
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

/** Directories a discovered-copy walk covers — every unit kind that can vendor this fixture. */
const SCAN_ROOTS = UNIT_KIND_ROOTS;

/** The filename a copy of this vector is always named, wherever it lives. */
const BASENAME = 'command-vectors-v1.json';

/**
 * Every copy of the vector. Repo-relative so the failure messages, the
 * self-test and the unit suite all name the same strings.
 *
 * Adding a copy is adding an entry here: the equality check is pairwise
 * against the canonical one, so a third consumer needs no new code.
 *
 * @type {readonly import('./fixture-copies.mjs').FixtureCopy[]}
 */
export const FIXTURE_COPIES = Object.freeze([
  Object.freeze({
    role: 'canonical (the inventory command engine produces the outcomes)',
    path: 'pillars/inventory/contracts/command-vectors-v1.json',
  }),
  Object.freeze({
    role: 'vendored (inside the iOS client, ADR-043)',
    path: 'clients/ios/Contracts/command-vectors-v1.json',
  }),
]);

/** The engine rejects a wrong mutation, so the pillar holds the original. */
const CANONICAL_ROOT = 'pillars/inventory/';

export const CANONICAL = resolveCanonical(FIXTURE_COPIES, CANONICAL_ROOT);

/**
 * The exact paths `FIXTURE_COPIES` is known to carry today, as literals —
 * typed by hand, not derived from `FIXTURE_COPIES` itself. `FIXTURE_COPIES`
 * is what every content check above walks, so an entry silently dropped from
 * it (a copy quietly stops being checked) or silently added to it (an
 * unreviewed copy starts being trusted) changes what those checks cover
 * without changing anything a test derived from `FIXTURE_COPIES` could ever
 * notice — that test would just walk the new, wrong list. A literal pin is
 * the only thing that can catch DRIFT WITHIN THE DECLARED LIST. It cannot see
 * a copy that was never declared in the first place — closing that is
 * `discoverFilesNamed`'s job below, which asks the filesystem instead of
 * `FIXTURE_COPIES`.
 *
 * A change to this set landing without a matching update here is the
 * friction ADR-045 asks for — visible on the commit that makes it, not a
 * silently-widened or -narrowed floor.
 */
export const KNOWN_FIXTURE_COPY_PATHS = [
  'pillars/inventory/contracts/command-vectors-v1.json',
  'clients/ios/Contracts/command-vectors-v1.json',
];

/**
 * Self-test: `FIXTURE_COPIES` still declares exactly {@link KNOWN_FIXTURE_COPY_PATHS}.
 *
 * Every other self-test half exercises what a copy's CONTENTS must hold; none
 * of them can see a copy dropped from — or added to — the list they all walk,
 * because they all walk that same list. This is the one check in the file
 * that compares `FIXTURE_COPIES` against something not derived from itself.
 *
 * @returns {boolean}
 */
function selfTestCopySet() {
  const declared = FIXTURE_COPIES.map((copy) => copy.path).toSorted();
  const expected = [...KNOWN_FIXTURE_COPY_PATHS].toSorted();

  const missing = expected.filter((path) => !declared.includes(path));
  const extra = declared.filter((path) => !expected.includes(path));
  const ok = missing.length === 0 && extra.length === 0;

  if (!ok) {
    console.error('SELF-TEST FAILED (copy set): FIXTURE_COPIES does not match the pinned set.');
    for (const path of missing) console.error(`  missing (pinned, not declared): ${path}`);
    for (const path of extra) console.error(`  extra (declared, not pinned):    ${path}`);
    console.error(
      '  if this is a deliberate addition/removal, update KNOWN_FIXTURE_COPY_PATHS in the ' +
        'same commit; if it is not, FIXTURE_COPIES has drifted unexpectedly.'
    );
  } else {
    console.log(
      `self-test OK — declares exactly the ${expected.length} pinned fixture copy path(s).`
    );
  }
  return ok;
}

/** The envelope shape every vector's `mutation` restates. */
const REQUIRED_MUTATION_FIELDS = ['mutationId', 'op', 'entityId', 'baseRevision'];

/** The envelope shape every vector's `outcome` restates. */
const REQUIRED_OUTCOME_FIELDS = ['mutationId', 'status'];

/**
 * @typedef {object} CommandVector
 * @property {string} name
 * @property {string} op
 * @property {unknown[]} seedLocations
 * @property {unknown[]} seedItems
 * @property {Record<string, unknown>} mutation
 * @property {Record<string, unknown>} actor
 * @property {Record<string, unknown>} outcome
 */

/**
 * @typedef {object} Fixture
 * @property {number} version
 * @property {CommandVector[]} vectors
 */

/**
 * Run every assertion against a parsed fixture.
 *
 * Pure and dependency-free so the self-test can drive it with a deliberately
 * corrupted fixture and observe it fail.
 *
 * @param {Fixture} fixture
 * @returns {string[]} One message per failed assertion; empty means the fixture holds.
 */
export function checkFixture(fixture) {
  /** @type {string[]} */
  const failures = [];

  if (fixture.version !== 1) {
    failures.push(`version: fixture says ${JSON.stringify(fixture.version)}, contract says 1`);
  }
  if (!Array.isArray(fixture.vectors) || fixture.vectors.length === 0) {
    failures.push('vectors: missing, not an array, or empty — at least one op must be covered');
    return failures;
  }

  const seenNames = new Set();
  for (const vector of fixture.vectors) {
    const label = typeof vector?.name === 'string' ? vector.name : '<unnamed vector>';

    if (typeof vector?.name !== 'string' || vector.name.length === 0) {
      failures.push(`${label}: name is missing or not a non-empty string`);
    } else if (seenNames.has(vector.name)) {
      failures.push(`${label}: name is not unique across vectors`);
    } else {
      seenNames.add(vector.name);
    }

    if (typeof vector?.op !== 'string' || vector.op.length === 0) {
      failures.push(`${label}: op is missing or not a non-empty string`);
    }

    const mutation = vector?.mutation;
    if (mutation === null || typeof mutation !== 'object') {
      failures.push(`${label}: mutation is missing or not an object`);
    } else {
      for (const field of REQUIRED_MUTATION_FIELDS) {
        if (!(field in mutation)) failures.push(`${label}: mutation.${field} is missing`);
      }
      if (typeof vector.op === 'string' && mutation.op !== vector.op) {
        failures.push(
          `${label}: mutation.op (${JSON.stringify(mutation.op)}) does not match the vector's ` +
            `own op (${JSON.stringify(vector.op)}) — the vector does not describe its own mutation`
        );
      }
    }

    const outcome = vector?.outcome;
    if (outcome === null || typeof outcome !== 'object') {
      failures.push(`${label}: outcome is missing or not an object`);
    } else {
      for (const field of REQUIRED_OUTCOME_FIELDS) {
        if (!(field in outcome)) failures.push(`${label}: outcome.${field} is missing`);
      }
      if (
        mutation !== null &&
        typeof mutation === 'object' &&
        'mutationId' in mutation &&
        outcome.mutationId !== mutation.mutationId
      ) {
        failures.push(
          `${label}: outcome.mutationId (${JSON.stringify(outcome.mutationId)}) does not match ` +
            `mutation.mutationId (${JSON.stringify(mutation.mutationId)}) — the outcome is not ` +
            'recorded as the result of its own mutation'
        );
      }
    }
  }

  return failures;
}

/**
 * Check every committed copy: present, byte-identical, holding the format,
 * and no OTHER file named `command-vectors-v1.json` sitting undeclared under
 * {@link SCAN_ROOTS}.
 *
 * @param {(repoRelativePath: string) => string | null} read Reads a copy, or null if absent.
 * @param {readonly string[]} discovered Every file named {@link BASENAME} found under {@link SCAN_ROOTS}.
 * @returns {string[]}
 */
export function checkAllCopies(read, discovered) {
  const contentFailures = checkCopies(FIXTURE_COPIES, CANONICAL.path, read, checkFixture);
  const undeclaredFailures = findUndeclaredCopies(discovered, FIXTURE_COPIES).map(
    (path) =>
      `${path}: an undeclared copy of ${BASENAME} — every copy must be named in FIXTURE_COPIES ` +
      '(and KNOWN_FIXTURE_COPY_PATHS) or it is not being checked by anything'
  );
  return [...contentFailures, ...undeclaredFailures];
}

/**
 * Self-test: prove the assertions actually fail on a vector broken in each of
 * the ways this guard exists to catch.
 *
 * Every corruption below is one a regeneration would happily produce, because
 * those are the ones the two unit suites cannot see.
 *
 * @param {Fixture} valid A fixture already known to pass.
 * @returns {boolean}
 */
function selfTest(valid) {
  const firstVector = valid.vectors[0];
  if (firstVector === undefined) {
    console.error('SELF-TEST FAILED: the committed vector has no vectors to corrupt');
    return false;
  }

  /** @type {[string, Fixture][]} */
  const corruptions = [
    ['the version pin drifted', { ...valid, version: valid.version + 1 }],
    ['vectors is empty', { ...valid, vectors: [] }],
    [
      "a vector's name went missing",
      { ...valid, vectors: [{ ...firstVector, name: '' }, ...valid.vectors.slice(1)] },
    ],
    [
      'two vectors share a name',
      {
        ...valid,
        vectors: [firstVector, { ...firstVector }, ...valid.vectors.slice(1)],
      },
    ],
    [
      "a vector's mutation.op disagrees with its own op",
      {
        ...valid,
        vectors: [
          { ...firstVector, mutation: { ...firstVector.mutation, op: `${firstVector.op}-other` } },
          ...valid.vectors.slice(1),
        ],
      },
    ],
    [
      "a vector's outcome.mutationId disagrees with its mutation.mutationId",
      {
        ...valid,
        vectors: [
          {
            ...firstVector,
            outcome: { ...firstVector.outcome, mutationId: 'not-the-real-mutation-id' },
          },
          ...valid.vectors.slice(1),
        ],
      },
    ],
    [
      'a required mutation field is gone',
      {
        ...valid,
        vectors: [
          {
            ...firstVector,
            mutation: Object.fromEntries(
              Object.entries(firstVector.mutation).filter(([key]) => key !== 'baseRevision')
            ),
          },
          ...valid.vectors.slice(1),
        ],
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

  if (ok) {
    console.log(
      `self-test OK — accepts the vector and rejects ${corruptions.length} corruptions of it.`
    );
  }
  return ok;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/ci/check-command-vectors-fixture.mjs [--self-test]');
    process.exit(2);
  }

  /** @type {(message: string) => never} */
  const bail = (message) => {
    console.error(message);
    process.exit(1);
  };
  const read = repoCopyReader(repoRoot, bail);

  if (argv.includes('--self-test')) {
    // All halves run even when one fails, so one invocation reports every
    // problem. The copy-set and real-tree-discovery halves need no fixture at
    // all, so they run first.
    const copySet = selfTestCopySet();
    const realTreeDiscovery = selfTestRealTreeDiscovery(
      repoRoot,
      SCAN_ROOTS,
      BASENAME,
      FIXTURE_COPIES
    );

    // The self-test needs a fixture it can corrupt, and the canonical copy is
    // the only source of one. Both failure modes are reported rather than
    // thrown: this runs as the FIRST step of its CI job, so an unhandled
    // SyntaxError here would report a broken fixture as a broken guard.
    const canonical = read(CANONICAL.path);
    if (canonical === null) bail(`FAIL — ${CANONICAL.path} does not exist`);
    /** @type {Fixture} */
    let valid;
    try {
      valid = JSON.parse(canonical);
    } catch (error) {
      bail(`FAIL — ${CANONICAL.path} is not parseable as JSON: ${String(error)}`);
    }
    process.exit(selfTest(valid) && copySet && realTreeDiscovery ? 0 : 1);
  }

  const discovered = discoverFilesNamed(repoRoot, SCAN_ROOTS, BASENAME);
  const failures = checkAllCopies(read, discovered);
  if (failures.length === 0) {
    console.log(
      `OK — ${String(FIXTURE_COPIES.length)} identical copies of the command-vectors fixture, ` +
        'each holding a mutation/outcome pair per vector.'
    );
    process.exit(0);
  }

  console.error(`FAIL — ${String(failures.length)} command-vectors problem(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nThe iOS reducer and the inventory command engine must agree on every vector, and every ' +
      'copy of the fixture must be byte-identical. Regenerate with `mise run fixture:command-vectors`, ' +
      "which rebuilds the vector from the pillar's own command engine and re-vendors the client's " +
      'copy. Changing engine behaviour means updating the Swift reducer it is pinned to in the same commit.'
  );
  process.exit(1);
}

if (import.meta.main) {
  main();
}
