#!/usr/bin/env node
/**
 * Vendored-contract drift guard.
 *
 * Some units consume a sibling pillar's OpenAPI contract at codegen time but
 * cannot depend on it through a `@pops/*` package, because one side of the seam
 * is not in the pnpm workspace: the producer may be (`contacts`, a Rust pillar
 * pnpm cannot see), or the consumer may be (`clients/ios`, a Swift app —
 * ADR-043).
 * Per ADR-033 the OpenAPI snapshot IS that pillar's cross-language contract, so
 * the consumer vendors a copy of the published snapshot inside its OWN unit
 * boundary and generates its client from the local copy. That keeps the unit
 * black-box-isolated and extraction-ready: it never reaches into the sibling
 * pillar's folder, and on extraction it carries its own contract input.
 *
 * The one risk a vendored copy introduces is drift: the snapshot the consumer
 * ships could lag the producer's canonical spec. This guard closes that gap —
 * every vendored copy must be byte-identical to the canonical
 * `pillars/<pillar>/openapi/<pillar>.openapi.json`. If the producer's contract
 * changes, this fails until the consumer re-vendors (and regenerates its
 * client), so the seam stays honest.
 *
 * It is a whole-tree check (reads the working tree directly, pulls in no
 * third-party deps) and is mapping-driven: a vendored file under one of the
 * VENDOR_DIRECTORIES below is paired with the canonical producer spec
 * `pillars/<name>/openapi/<name>.openapi.json` by filename. A vendored file
 * with no matching producer spec is itself a failure (stale or mis-named) so
 * the convention can't rot silently.
 *
 * Usage:
 *   node scripts/ci/check-vendored-contracts.mjs
 *   node scripts/ci/check-vendored-contracts.mjs --self-test
 *
 * Exit 0 = every vendored copy matches its source. Exit 1 = drift / orphan.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const VENDORED_SUFFIX = '.openapi.json';

/**
 * Where a consumer is allowed to keep a vendored snapshot, as
 * `<unit-kind-root>/<consumer>/<path...>`. Each entry names the directory a
 * unit kind's units live under, plus the path inside one unit that holds the
 * copies.
 *
 * The two differ in spelling because each follows its own language's
 * convention, and neither is worth normalising: a pnpm app keeps its codegen
 * inputs in a lowercase `app/contracts/`, while the Swift client already has a
 * `Contracts/` directory for the artefacts it and the BFM agree on byte for
 * byte, and the OpenAPI snapshot is one of those.
 *
 * A directory NOT listed here is not scanned, so a copy that lands somewhere
 * else is invisible to this guard rather than silently allowed — which is why
 * the consuming unit's own docs point at this list.
 */
const VENDOR_DIRECTORIES = [
  ['pillars', 'app', 'contracts'],
  ['clients', 'Contracts'],
];

/**
 * @typedef {object} VendoredContract
 * @property {string} copy        Absolute path to the vendored snapshot.
 * @property {string} source      Absolute path to the canonical producer spec.
 * @property {string} pillarId    Producer pillar id (derived from the filename).
 */

/**
 * Discover every vendored contract under one of ``VENDOR_DIRECTORIES`` and pair
 * each with the canonical producer spec it must mirror.
 *
 * @param {string} root Repo root to scan.
 * @returns {VendoredContract[]}
 */
export function discoverVendoredContracts(root) {
  /** @type {VendoredContract[]} */
  const found = [];
  const pillarsDir = join(root, 'pillars');

  for (const [unitKind, ...withinUnit] of VENDOR_DIRECTORIES) {
    const unitKindDir = join(root, unitKind);
    if (!existsSync(unitKindDir)) continue;

    for (const consumer of readdirSync(unitKindDir, { withFileTypes: true })) {
      if (!consumer.isDirectory()) continue;
      const contractsDir = join(unitKindDir, consumer.name, ...withinUnit);
      if (!existsSync(contractsDir)) continue;
      for (const entry of readdirSync(contractsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(VENDORED_SUFFIX)) continue;
        const pillarId = entry.name.slice(0, -VENDORED_SUFFIX.length);
        found.push({
          copy: join(contractsDir, entry.name),
          source: join(pillarsDir, pillarId, 'openapi', entry.name),
          pillarId,
        });
      }
    }
  }
  return found.toSorted((a, b) => a.copy.localeCompare(b.copy));
}

/**
 * @typedef {object} DriftFinding
 * @property {'orphan' | 'drift'} kind
 * @property {string} copy
 * @property {string} source
 */

/**
 * Compare each vendored copy against its canonical source.
 *
 * @param {VendoredContract[]} contracts
 * @param {(p: string) => string | null} read Reads a file, or null if absent.
 * @returns {DriftFinding[]}
 */
export function findDrift(contracts, read) {
  /** @type {DriftFinding[]} */
  const findings = [];
  for (const { copy, source } of contracts) {
    const sourceText = read(source);
    if (sourceText === null) {
      findings.push({ kind: 'orphan', copy, source });
      continue;
    }
    const copyText = read(copy);
    if (copyText !== sourceText) {
      findings.push({ kind: 'drift', copy, source });
    }
  }
  return findings;
}

/** @param {string} path @returns {string | null} */
function readOrNull(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** @param {string} to */
function rel(to) {
  return to.startsWith(`${repoRoot}/`) ? to.slice(repoRoot.length + 1) : to;
}

/**
 * Self-test half one: every directory shape in ``VENDOR_DIRECTORIES`` is
 * actually scanned, and each copy is paired with the right producer spec.
 *
 * This half exists because the script treats "found nothing" as success — a
 * mis-typed entry, or a consuming unit whose layout moved, would take a whole
 * unit kind out of the scan and still exit 0 with an approving message. Built
 * from `VENDOR_DIRECTORIES` rather than from a fixed list of paths, so a new
 * entry is covered the moment it is added.
 *
 * @returns {boolean}
 */
function selfTestDiscovery() {
  const root = mkdtempSync(join(tmpdir(), 'vendored-discovery-'));
  try {
    /** @type {string[]} */
    const expected = [];
    for (const [index, [unitKind, ...withinUnit]] of VENDOR_DIRECTORIES.entries()) {
      const pillarId = `producer${index}`;
      mkdirSync(join(root, 'pillars', pillarId, 'openapi'), { recursive: true });
      writeFileSync(join(root, 'pillars', pillarId, 'openapi', `${pillarId}.openapi.json`), '{}\n');

      const contractsDir = join(root, unitKind, `consumer${index}`, ...withinUnit);
      mkdirSync(contractsDir, { recursive: true });
      const copy = join(contractsDir, `${pillarId}.openapi.json`);
      writeFileSync(copy, '{}\n');
      expected.push(copy);

      // A neighbour that must NOT be picked up: `Contracts/` also holds
      // artefacts that are not vendored pillar snapshots.
      writeFileSync(join(contractsDir, 'not-a-snapshot.json'), '{}\n');
    }

    const discovered = discoverVendoredContracts(root);
    const paths = discovered.map((c) => c.copy);
    const foundAll = expected.every((p) => paths.includes(p));
    const noExtras = discovered.length === expected.length;
    const pairedRight = discovered.every((c) => existsSync(c.source));

    if (!(foundAll && noExtras && pairedRight)) {
      console.error('SELF-TEST FAILED (discovery):');
      console.error(`  scanned every VENDOR_DIRECTORIES entry: ${foundAll}`);
      console.error(`  picked up nothing else:                 ${noExtras}`);
      console.error(`  paired each copy with a producer spec:  ${pairedRight}`);
      console.error(`  expected ${expected.length}, found ${discovered.length}`);
      return false;
    }
    console.log(
      `self-test OK — scans all ${VENDOR_DIRECTORIES.length} vendored-contract location(s).`
    );
    return true;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/**
 * Self-test half two: prove the detector flags drift and an orphan, and passes
 * an identical pair. CI runs this so a regression that neuters the matcher is
 * caught deterministically.
 *
 * @returns {boolean}
 */
function selfTestDrift() {
  const dir = mkdtempSync(join(tmpdir(), 'vendored-contracts-'));
  try {
    const files = new Map([
      [join(dir, 'src-match.json'), '{"a":1}\n'],
      [join(dir, 'copy-match.json'), '{"a":1}\n'],
      [join(dir, 'src-drift.json'), '{"a":1}\n'],
      [join(dir, 'copy-drift.json'), '{"a":2}\n'],
      [join(dir, 'copy-orphan.json'), '{"a":1}\n'],
    ]);
    for (const [path, text] of files) writeFileSync(path, text);

    const read = (/** @type {string} */ p) => (files.has(p) ? (files.get(p) ?? null) : null);
    const contracts = [
      { copy: join(dir, 'copy-match.json'), source: join(dir, 'src-match.json'), pillarId: 'm' },
      { copy: join(dir, 'copy-drift.json'), source: join(dir, 'src-drift.json'), pillarId: 'd' },
      {
        copy: join(dir, 'copy-orphan.json'),
        source: join(dir, 'src-missing.json'),
        pillarId: 'o',
      },
    ];
    const findings = findDrift(contracts, read);
    const drift = findings.find((f) => f.kind === 'drift' && f.copy.endsWith('copy-drift.json'));
    const orphan = findings.find((f) => f.kind === 'orphan' && f.copy.endsWith('copy-orphan.json'));
    const matchedAllowed = !findings.some((f) => f.copy.endsWith('copy-match.json'));

    const ok = Boolean(drift) && Boolean(orphan) && matchedAllowed && findings.length === 2;
    if (!ok) {
      console.error('SELF-TEST FAILED (drift):');
      console.error(`  caught drift:          ${Boolean(drift)}`);
      console.error(`  caught orphan:         ${Boolean(orphan)}`);
      console.error(`  allowed identical:     ${matchedAllowed}`);
      console.error(`  exactly 2 findings:    ${findings.length === 2}`);
    } else {
      console.log('self-test OK — flags drift + orphan, allows an identical copy.');
    }
    return ok;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/ci/check-vendored-contracts.mjs [--self-test]');
    process.exit(2);
  }
  if (argv.includes('--self-test')) {
    // Both halves run even when the first fails, so one invocation reports
    // every problem.
    const discovery = selfTestDiscovery();
    const drift = selfTestDrift();
    process.exit(discovery && drift ? 0 : 1);
  }

  const contracts = discoverVendoredContracts(repoRoot);
  if (contracts.length === 0) {
    console.log('OK — no vendored pillar contracts found.');
    process.exit(0);
  }

  const findings = findDrift(contracts, readOrNull);
  if (findings.length === 0) {
    console.log(`OK — ${contracts.length} vendored contract(s) match their canonical source.`);
    process.exit(0);
  }

  console.error(`FAIL — ${findings.length} vendored contract problem(s):`);
  for (const f of findings) {
    if (f.kind === 'orphan') {
      console.error(
        `  ${rel(f.copy)}\n      no canonical source at ${rel(f.source)} (stale or mis-named vendored copy)`
      );
    } else {
      console.error(
        `  ${rel(f.copy)}\n      drifted from ${rel(f.source)} — re-vendor and regenerate the client`
      );
    }
  }
  console.error(
    '\nA vendored contract must stay byte-identical to its producing pillar’s ' +
      'canonical OpenAPI snapshot. Copy the source over the vendored file and ' +
      'rerun the consumer’s generate:*-client script.'
  );
  process.exit(1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
