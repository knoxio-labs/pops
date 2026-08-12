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
 * A directory scan cannot prove a copy still exists once its directory has
 * moved — it just finds nothing there and moves on. So this guard also reads
 * what each consumer's OWN codegen config expects (`VENDOR_DECLARATIONS`,
 * `deriveExpectedContracts`) and cross-checks that expectation against the
 * filesystem independently of the directory walk (`findMoved`). A `contracts/`
 * or `Contracts/` directory that moves without its declaration following is
 * then a reported mismatch, not an empty scan that prints success.
 *
 * Usage:
 *   node scripts/ci/check-vendored-contracts.mjs
 *   node scripts/ci/check-vendored-contracts.mjs --self-test
 *
 * Exit 0 = every vendored copy matches its source and every declared
 * expectation is on disk as a regular file. Exit 1 = drift / orphan / moved /
 * not-a-file / unreadable, or total discovery loss.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isFileNotFound } from './fixture-copies.mjs';

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
 * How each `VENDOR_DIRECTORIES` entry's consumer DECLARES that it depends on a
 * vendored copy, independent of the directory scan `discoverVendoredContracts`
 * performs. See {@link deriveExpectedContracts}.
 *
 * Indexed the same as `VENDOR_DIRECTORIES` — entry `i` here answers for unit
 * kind `i` there. Checked at load time below rather than left to go out of
 * sync silently.
 */
const VENDOR_DECLARATIONS = [
  {
    /**
     * A pnpm app's Hey API codegen config:
     * `pillars/<consumer>/app/openapi-ts*.config.ts`, whichever one points at
     * a vendored input.
     *
     * @param {string} consumerDir
     * @returns {string[]}
     */
    findDeclarationFiles(consumerDir) {
      const appDir = join(consumerDir, 'app');
      if (!existsSync(appDir)) return [];
      return readdirSync(appDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /^openapi-ts.*\.config\.ts$/.test(entry.name))
        .map((entry) => join(appDir, entry.name));
    },
    /** @param {string} text @returns {string[]} */
    extractDeclaredFilenames(text) {
      const names = [];
      const pattern =
        /input:\s*fileURLToPath\(\s*new URL\(\s*'\.\/contracts\/([^']+\.openapi\.json)'/g;
      for (const match of text.matchAll(pattern)) names.push(match[1]);
      return names;
    },
  },
  {
    /**
     * The Swift client's `mise run generate:*-client` task, whose run script
     * assigns `vendored=Contracts/<pillar>.openapi.json` before copying over
     * it. `clients/ios` is in neither the pnpm nor the Rust workspace, so
     * there is no `.config.ts` on this side — `mise.toml`'s own task body is
     * the only place this expectation is written down.
     *
     * @param {string} consumerDir
     * @returns {string[]}
     */
    findDeclarationFiles(consumerDir) {
      const miseToml = join(consumerDir, 'mise.toml');
      return existsSync(miseToml) ? [miseToml] : [];
    },
    /** @param {string} text @returns {string[]} */
    extractDeclaredFilenames(text) {
      const names = [];
      const pattern = /vendored\s*=\s*Contracts\/([^\s'"]+\.openapi\.json)/g;
      for (const match of text.matchAll(pattern)) names.push(match[1]);
      return names;
    },
  },
];

if (VENDOR_DECLARATIONS.length !== VENDOR_DIRECTORIES.length) {
  throw new Error(
    'VENDOR_DECLARATIONS must have exactly one entry per VENDOR_DIRECTORIES entry, in the same order'
  );
}

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
 * @typedef {object} DeclaredCopy
 * @property {string} copy        Absolute path the declaration expects a vendored copy at.
 * @property {string} source      Absolute path of the canonical producer spec.
 * @property {string} pillarId    Producer pillar id (derived from the declared filename).
 * @property {string} declaredBy  Absolute path of the file that declares this expectation.
 */

/**
 * Derive every vendored copy a consumer's OWN codegen config says it depends
 * on — independent of `discoverVendoredContracts`'s directory walk.
 *
 * That walk reports nothing when a consumer's copy directory moves; the file
 * that used to be found simply is not visited, and an empty scan looks
 * exactly like a healthy one. This function never visits that directory: it
 * reads each consumer's OWN config (which the consumer's real build depends
 * on, so it cannot drift from reality without breaking that build too) and
 * extracts the path recorded there. `findMoved` then checks that the path
 * still exists, which is what turns a moved directory into a reported
 * mismatch instead of silence.
 *
 * @param {string} root Repo root to scan.
 * @returns {DeclaredCopy[]}
 */
export function deriveExpectedContracts(root) {
  /** @type {DeclaredCopy[]} */
  const found = [];
  const pillarsDir = join(root, 'pillars');

  VENDOR_DIRECTORIES.forEach(([unitKind, ...withinUnit], index) => {
    const unitKindDir = join(root, unitKind);
    if (!existsSync(unitKindDir)) return;
    const { findDeclarationFiles, extractDeclaredFilenames } = VENDOR_DECLARATIONS[index];

    for (const consumer of readdirSync(unitKindDir, { withFileTypes: true })) {
      if (!consumer.isDirectory()) continue;
      const consumerDir = join(unitKindDir, consumer.name);

      for (const declarationFile of findDeclarationFiles(consumerDir)) {
        const text = readOrNull(declarationFile);
        // Vanished between readdir and read: a TOCTOU race, not a finding
        // this function makes — `deriveExpectedContracts` only reports what
        // a config says, and a config that is not there says nothing.
        if (text === null) continue;

        for (const filename of extractDeclaredFilenames(text)) {
          const pillarId = filename.slice(0, -VENDORED_SUFFIX.length);
          found.push({
            copy: join(consumerDir, ...withinUnit, filename),
            source: join(pillarsDir, pillarId, 'openapi', filename),
            pillarId,
            declaredBy: declarationFile,
          });
        }
      }
    }
  });

  return found.toSorted((a, b) => a.copy.localeCompare(b.copy));
}

/**
 * @typedef {object} DriftFinding
 * @property {'orphan' | 'drift' | 'unreadable'} kind
 * @property {string} copy
 * @property {string} source
 * @property {string} [detail] Present for `'unreadable'` — which side, and why.
 */

/**
 * Compare each vendored copy against its canonical source.
 *
 * @param {VendoredContract[]} contracts
 * @param {(p: string) => string | null} read Reads a file; `null` means absent,
 *   throws for any other read failure (see `readOrNull`).
 * @returns {DriftFinding[]}
 */
export function findDrift(contracts, read) {
  /** @type {DriftFinding[]} */
  const findings = [];
  for (const { copy, source } of contracts) {
    let sourceText;
    try {
      sourceText = read(source);
    } catch (error) {
      findings.push({
        kind: 'unreadable',
        copy,
        source,
        detail: `could not read the canonical source (not simply missing): ${String(error)}`,
      });
      continue;
    }
    if (sourceText === null) {
      findings.push({ kind: 'orphan', copy, source });
      continue;
    }

    let copyText;
    try {
      copyText = read(copy);
    } catch (error) {
      findings.push({
        kind: 'unreadable',
        copy,
        source,
        detail: `could not read the vendored copy (not simply missing): ${String(error)}`,
      });
      continue;
    }
    if (copyText === null) {
      findings.push({
        kind: 'unreadable',
        copy,
        source,
        detail: 'vendored copy was found by the scan but had vanished by the time it was read',
      });
      continue;
    }
    if (copyText !== sourceText) {
      findings.push({ kind: 'drift', copy, source });
    }
  }
  return findings;
}

/**
 * @typedef {object} MovedFinding
 * @property {'moved' | 'not-a-file' | 'unreadable'} kind
 * @property {string} copy
 * @property {string} source
 * @property {string} declaredBy
 * @property {string} [detail] Present for `'unreadable'`.
 */

/**
 * Whether a declared vendored-copy path is absent, a regular file, or present
 * as something else (a directory, a symlink to one, …).
 *
 * `existsSync` alone would call a directory sitting at that path "present" —
 * `discoverVendoredContracts` never would, since its scan filters to
 * `entry.isFile()`. A directory (say, from a bad merge, or a symlink that
 * used to point at a file and now points at a directory) would then read as
 * a healthy vendored copy to `findMoved` while being invisible to every other
 * check in this guard, including the byte-drift comparison. Distinguishing
 * the three outcomes is what lets `findMoved` tell "nothing at that path"
 * (`'absent'` — the config's declared path really has moved) apart from
 * "something is there, but it is not the file the config declared"
 * (`'not-a-file'` — a different, still-reportable problem).
 *
 * @param {string} path
 * @returns {'absent' | 'file' | 'not-a-file'}
 */
export function statKind(path) {
  let stats;
  try {
    stats = statSync(path);
  } catch (error) {
    if (isFileNotFound(error)) return 'absent';
    throw error;
  }
  return stats.isFile() ? 'file' : 'not-a-file';
}

/**
 * Cross-check every config-declared expectation against the filesystem.
 *
 * A moved `contracts/`/`Contracts/` directory is exactly the case the
 * directory-scan side of this guard cannot see — it just finds nothing there.
 * The declaration a consumer's own config makes does not move just because
 * the directory did, so checking it independently is what turns that move
 * into a reported failure.
 *
 * @param {DeclaredCopy[]} expected
 * @param {(p: string) => 'absent' | 'file' | 'not-a-file'} stat
 * @returns {MovedFinding[]}
 */
export function findMoved(expected, stat) {
  /** @type {MovedFinding[]} */
  const findings = [];
  for (const declared of expected) {
    let kind;
    try {
      kind = stat(declared.copy);
    } catch (error) {
      findings.push({
        kind: 'unreadable',
        copy: declared.copy,
        source: declared.source,
        declaredBy: declared.declaredBy,
        detail: `declared vendored copy could not be checked: ${String(error)}`,
      });
      continue;
    }
    if (kind === 'file') continue;
    findings.push({
      kind: kind === 'absent' ? 'moved' : 'not-a-file',
      copy: declared.copy,
      source: declared.source,
      declaredBy: declared.declaredBy,
    });
  }
  return findings;
}

/**
 * Read a file's text, or `null` if it does not exist.
 *
 * Distinguishes "not there" from "there but unreadable" — the latter (EACCES,
 * a directory where a file was expected, …) is a genuine environment problem,
 * not a stale or mis-named vendored copy, and collapsing the two into the same
 * `null` misreports a permissions failure as "orphan". Reuses `isFileNotFound`
 * from `./fixture-copies.mjs` rather than repeating the errno check, so the
 * two guards cannot drift into disagreeing about what `null` means.
 *
 * @param {string} path
 * @returns {string | null}
 */
export function readOrNull(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (isFileNotFound(error)) return null;
    throw error;
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
 * `main()` now hard-fails when discovery finds nothing at all (see the
 * `discovered.length === 0` check below), so total loss is no longer the
 * silent case. What that floor does NOT catch is a mis-typed
 * `VENDOR_DIRECTORIES` entry, or one consuming unit's layout moving while
 * another's stays put — either would drop a whole unit kind (or one
 * consumer) out of the scan while `discovered.length` stays comfortably
 * non-zero, and print `OK` about a repo that has quietly lost a check. This
 * half proves the SHAPE is scanned correctly, built from `VENDOR_DIRECTORIES`
 * itself so a new entry is covered the moment it is added.
 *
 * What this half does NOT prove is that today's real copies are still where
 * this shape says they should be — only that the shape itself is scanned
 * correctly. `selfTestDeclaration` below covers that gap.
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

    // A `read` that THROWS for a reason other than not-found (EACCES, say)
    // must be reported as `'unreadable'`, never crash the whole self-test —
    // proof that the readOrNull/findDrift split does not just move the bug
    // this guard exists to catch one level up.
    const throwingRead = (/** @type {string} */ p) => {
      if (p.endsWith('copy-unreadable.json'))
        throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      return read(p);
    };
    const unreadableFindings = findDrift(
      [
        {
          copy: join(dir, 'copy-unreadable.json'),
          source: join(dir, 'src-match.json'),
          pillarId: 'u',
        },
      ],
      throwingRead
    );
    const caughtUnreadable =
      unreadableFindings.length === 1 && unreadableFindings[0].kind === 'unreadable';

    const ok =
      Boolean(drift) &&
      Boolean(orphan) &&
      matchedAllowed &&
      findings.length === 2 &&
      caughtUnreadable;
    if (!ok) {
      console.error('SELF-TEST FAILED (drift):');
      console.error(`  caught drift:              ${Boolean(drift)}`);
      console.error(`  caught orphan:             ${Boolean(orphan)}`);
      console.error(`  allowed identical:         ${matchedAllowed}`);
      console.error(`  exactly 2 findings:        ${findings.length === 2}`);
      console.error(`  reported unreadable, not crashed: ${caughtUnreadable}`);
    } else {
      console.log('self-test OK — flags drift + orphan + unreadable, allows an identical copy.');
    }
    return ok;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Self-test half three: prove `deriveExpectedContracts` + `findMoved` catch
 * the failure `selfTestDiscovery` cannot — a consumer's vendored-copy
 * directory moving out from under a declaration that still names it.
 *
 * Builds one synthetic consumer per `VENDOR_DIRECTORIES` entry with both a
 * declaration file and a matching vendored copy (the positive case: nothing
 * flagged), then deletes just the FIRST consumer's copy while leaving its
 * declaration untouched (the degenerate case) and asserts that is reported,
 * not silently absent.
 *
 * @returns {boolean}
 */
function selfTestDeclaration() {
  const root = mkdtempSync(join(tmpdir(), 'vendored-declaration-'));
  try {
    /** @type {string[]} */
    const copies = [];
    for (const [index, [unitKind, ...withinUnit]] of VENDOR_DIRECTORIES.entries()) {
      const pillarId = `declared${index}`;
      mkdirSync(join(root, 'pillars', pillarId, 'openapi'), { recursive: true });
      writeFileSync(join(root, 'pillars', pillarId, 'openapi', `${pillarId}.openapi.json`), '{}\n');

      const consumerDir = join(root, unitKind, `consumer${index}`);
      const contractsDir = join(consumerDir, ...withinUnit);
      mkdirSync(contractsDir, { recursive: true });
      const copy = join(contractsDir, `${pillarId}.openapi.json`);
      writeFileSync(copy, '{}\n');
      copies.push(copy);

      if (index === 0) {
        mkdirSync(join(consumerDir, 'app'), { recursive: true });
        writeFileSync(
          join(consumerDir, 'app', `openapi-ts.${pillarId}.config.ts`),
          `export default { input: fileURLToPath(new URL('./contracts/${pillarId}.openapi.json', import.meta.url)) };\n`
        );
      } else {
        writeFileSync(
          join(consumerDir, 'mise.toml'),
          `[tasks."generate:${pillarId}-client"]\nrun = '''\nvendored=Contracts/${pillarId}.openapi.json\n'''\n`
        );
      }
    }

    const expectedBefore = deriveExpectedContracts(root);
    const positiveOk =
      expectedBefore.length === VENDOR_DIRECTORIES.length &&
      findMoved(expectedBefore, statKind).length === 0;

    // The degenerate case: the first consumer's vendored-copy directory
    // moves (simulated by deleting the file it held), but nothing told its
    // declaration file, so the declaration still names the old path.
    rmSync(copies[0]);

    // A second, distinct degenerate case: the second consumer's declared
    // path is occupied by a DIRECTORY rather than deleted outright — the
    // case `existsSync` alone would miss, since it calls a directory
    // "present" the same as a file.
    rmSync(copies[1]);
    mkdirSync(copies[1]);

    const expectedAfter = deriveExpectedContracts(root);
    const moved = findMoved(expectedAfter, statKind);
    const caughtMove =
      moved.length === 2 &&
      moved.some((f) => f.copy === copies[0] && f.kind === 'moved') &&
      moved.some((f) => f.copy === copies[1] && f.kind === 'not-a-file');

    // A `stat` that THROWS for a reason other than not-found (EACCES, say)
    // must be reported as `'unreadable'`, never crash the self-test — the
    // same proof `selfTestDrift` runs for `findDrift`'s reader, here for
    // `findMoved`'s.
    const throwingStat = (/** @type {string} */ p) => {
      if (p === copies[0]) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      return statKind(p);
    };
    const unreadableFindings = findMoved(expectedAfter, throwingStat);
    const caughtUnreadable =
      unreadableFindings.some((f) => f.copy === copies[0] && f.kind === 'unreadable') &&
      unreadableFindings.some((f) => f.copy === copies[1] && f.kind === 'not-a-file');

    const ok = positiveOk && caughtMove && caughtUnreadable;
    if (!ok) {
      console.error('SELF-TEST FAILED (declaration):');
      console.error(`  positive case (config + copy agree, nothing flagged): ${positiveOk}`);
      console.error(`  moved + non-file contracts are both reported, not silent: ${caughtMove}`);
      console.error(`  a stat failure is reported as unreadable, not crashed: ${caughtUnreadable}`);
    } else {
      console.log(
        'self-test OK — a config-declared vendored copy that moves, or turns into a ' +
          'directory, is reported, not silent.'
      );
    }
    return ok;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/ci/check-vendored-contracts.mjs [--self-test]');
    process.exit(2);
  }
  if (argv.includes('--self-test')) {
    // All three halves run even when one fails, so one invocation reports
    // every problem.
    const discovery = selfTestDiscovery();
    const drift = selfTestDrift();
    const declaration = selfTestDeclaration();
    process.exit(discovery && drift && declaration ? 0 : 1);
  }

  /** @type {VendoredContract[]} */
  let discovered;
  /** @type {DeclaredCopy[]} */
  let expected;
  try {
    discovered = discoverVendoredContracts(repoRoot);
    expected = deriveExpectedContracts(repoRoot);
  } catch (error) {
    console.error(`FAIL — could not scan the tree for vendored contracts: ${String(error)}`);
    process.exit(1);
  }

  // "Found nothing" is a finding, not success: at least one vendored contract
  // is known to exist in this repo today (clients/ios cannot depend on
  // @pops/bfm and will always vendor its snapshot — see ADR-043). If that
  // ever legitimately drops to zero, this floor is the line to change, in the
  // same commit as whatever removed the last vendored contract — not a
  // silent side effect of one moving.
  if (discovered.length === 0) {
    console.error(
      'FAIL — discovered zero vendored pillar contracts, but this repo is known to vendor ' +
        'at least one (see the doc comment on VENDOR_DIRECTORIES in this script). Either ' +
        'every vendored copy was deliberately removed — update this floor in the same commit ' +
        '— or a consuming unit’s contracts directory moved and the scan can no longer see it.'
    );
    process.exit(1);
  }

  const driftFindings = findDrift(discovered, readOrNull);
  const movedFindings = findMoved(expected, statKind);
  const findings = [...driftFindings, ...movedFindings];

  if (findings.length === 0) {
    console.log(
      `OK — ${discovered.length} vendored contract(s) match their canonical source, ` +
        `${expected.length} config-declared expectation(s) all present on disk.`
    );
    process.exit(0);
  }

  console.error(`FAIL — ${findings.length} vendored contract problem(s):`);
  for (const f of findings) {
    if (f.kind === 'orphan') {
      console.error(
        `  ${rel(f.copy)}\n      no canonical source at ${rel(f.source)} (stale or mis-named vendored copy)`
      );
    } else if (f.kind === 'drift') {
      console.error(
        `  ${rel(f.copy)}\n      drifted from ${rel(f.source)} — re-vendor and regenerate the client`
      );
    } else if (f.kind === 'unreadable') {
      console.error(`  ${rel(f.copy)}\n      ${f.detail}`);
    } else if (f.kind === 'not-a-file') {
      console.error(
        `  ${rel(f.copy)}\n      declared by ${rel(f.declaredBy)} but is not a regular file — ` +
          'a directory (or a symlink to one) sits at that path instead of the vendored copy'
      );
    } else {
      console.error(
        `  ${rel(f.copy)}\n      declared by ${rel(f.declaredBy)} but not on disk — its ` +
          'vendored-contracts directory moved, or the file was renamed, without re-vendoring'
      );
    }
  }
  console.error(
    '\nA vendored contract must stay byte-identical to its producing pillar’s ' +
      'canonical OpenAPI snapshot, at the path its own consumer declares in its codegen ' +
      'config. Copy the source over the vendored file and rerun the consumer’s ' +
      'generate:*-client script.'
  );
  process.exit(1);
}

if (import.meta.main) {
  main();
}
