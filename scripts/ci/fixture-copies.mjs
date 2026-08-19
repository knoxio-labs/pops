/**
 * One committed vector, several byte-identical files.
 *
 * Two guards pin an iOS↔BFM contract with a fixture that has to exist in more
 * than one place: ADR-043 forbids a unit reading a path inside another, so the
 * side that does not author the vector vendors a copy inside its own boundary
 * (the shape ADR-033 established for OpenAPI snapshots). The copies can drift,
 * and the drift is silent — both ends keep passing their own assertions while
 * asserting different bytes.
 *
 * Everything about that arrangement that is not specific to what a fixture
 * MEANS lives here: which copy is canonical, reading them, comparing them, and
 * proving the comparison still reports. Each guard supplies only its own
 * validator.
 *
 * The direction differs per fixture and is deliberately not assumed. The
 * device-signature vector can only be produced by CryptoKit, so its canonical
 * copy is the client's; the refresh message format is the BFM's to define, so
 * that one's canonical copy is the pillar's. A shared canonical-root constant
 * would have quietly imposed one of those on the other.
 */

import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * @typedef {object} FixtureCopy
 * @property {string} role Why this copy exists, for the failure message.
 * @property {string} path Repo-relative.
 */

/**
 * Every top-level directory a unit this repo builds can live under. The one
 * place that answers "what is a unit kind" for every filesystem walk that
 * hunts for a stray or undeclared copy of something — `discoverFilesNamed`
 * below, and `findUnvendoredContracts` in `check-vendored-contracts.mjs`.
 *
 * Before this constant existed, `check-vendored-contracts.mjs` and
 * `fixture-copies.mjs` each typed their own root list by hand, and the two
 * silently disagreed: the former walked `['pillars', 'clients']`, the latter
 * `['pillars', 'libs', 'clients']`, so a copy planted under `libs/` was
 * invisible to one guard and caught by the other, depending on which kind of
 * copy it was (POPS-2235). Importing this constant instead of retyping the
 * list is what makes that impossible — a new unit kind (or a typo in an old
 * one) changes what every walk covers in one place, not in however many
 * guards happened to have their own copy of the list.
 *
 * `libs/` is real, not speculative: `libs/overlay-ego` already consumes
 * `pillars/cerebrum/openapi/cerebrum.openapi.json` at codegen time, the same
 * cross-unit consumption shape that led `pillars/finance/app` to vendor a
 * copy of a sibling pillar's contract.
 */
export const UNIT_KIND_ROOTS = ['pillars', 'libs', 'clients'];

/**
 * The copy every other copy is compared against and restored from.
 *
 * Identified by where it lives rather than by position. A copy list is meant to
 * grow, so an index would silently promote a consumer's vendored copy to
 * canonical the day someone reorders it, and the drift check would then enforce
 * agreement with the wrong file — passing while the real contract had moved.
 * Ambiguity is fatal rather than resolved by picking the first match: two
 * originals is not a state a drift check can mean anything against.
 *
 * @param {readonly FixtureCopy[]} copies
 * @param {string} canonicalRoot Repo-relative prefix exactly one copy sits under.
 * @returns {FixtureCopy}
 */
export function resolveCanonical(copies, canonicalRoot) {
  const found = copies.filter((copy) => copy.path.startsWith(canonicalRoot));
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one fixture copy under ${canonicalRoot}, found ${String(found.length)}`
    );
  }
  return found[0];
}

/** Directory names a discovery walk never descends into. */
const DISCOVERY_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.turbo',
]);

/**
 * Whether `absolutePath` — a symlink — resolves to a regular file that stays
 * inside `repoRoot`.
 *
 * A discovery walk that treats a matching symlink as a find has two things to
 * get right, and this is both of them:
 *
 * 1. It must not loop. Both walks in this module only ever call this for a
 *    `Dirent` that is a symlink, never one that is a directory — a walk never
 *    descends into a symlinked directory (see the `entry.isDirectory()`
 *    branches below and in `check-vendored-contracts.mjs`'s
 *    `findOpenapiJsonFiles`), so a link back to an ancestor directory is
 *    never traversed in the first place. That omission is deliberate and is
 *    the cycle guard — a single-level file symlink cannot cycle, because
 *    resolving it does not recurse.
 * 2. It must not silently vouch for a path outside the checkout. Every guard
 *    that uses this eventually `readFileSync`s what it discovers; a symlink
 *    is not followed for content that lives outside the repo just because
 *    its name happens to match what the walk is looking for.
 *
 * @param {string} repoRoot Absolute path to the repo root.
 * @param {string} absolutePath Absolute path of the symlink itself.
 * @returns {boolean}
 */
export function symlinkResolvesToFileInRepo(repoRoot, absolutePath) {
  // `repoRoot` itself can be reached through a symlinked ancestor — macOS
  // resolves its default tmp dir (`/var/...`) through `/private/var/...`,
  // and `mkdtempSync(tmpdir())` in the self-tests below hits exactly that —
  // so the root has to be realpath'd the same way the candidate is, or a
  // perfectly in-repo symlink fails containment on nothing but a path-string
  // mismatch.
  /** @type {string} */
  let realRoot;
  try {
    realRoot = realpathSync(repoRoot);
  } catch {
    return false;
  }
  /** @type {string} */
  let real;
  try {
    real = realpathSync(absolutePath);
  } catch {
    // Broken link, or a race with something that deleted the target.
    return false;
  }
  if (real !== realRoot && !real.startsWith(realRoot + sep)) return false;
  try {
    return statSync(real).isFile();
  } catch {
    return false;
  }
}

/**
 * Every file under `root/<scanRoot>` (recursively, skipping build/dependency
 * noise and dot-directories) named exactly `basename` — repo-relative,
 * POSIX-separated, sorted. A symlink named `basename` counts too, provided it
 * resolves to a regular file inside `repoRoot` (see
 * {@link symlinkResolvesToFileInRepo}); a symlinked directory is never
 * descended into.
 *
 * This is the leg POPS-2206 found missing entirely: `checkCopies` and its
 * pin both only ever read paths a `FixtureCopy[]` DECLARED, so a copy placed
 * somewhere nobody declared was invisible to both — the guard reported the
 * copies it was told to look at, and the pin certified the list of paths it
 * was told to look at against a second list of paths it was told to look
 * at. Matching by basename rather than a fixed shape is deliberate:
 * `pillars/<id>/contracts/` is a real, growing convention (see
 * `pillars/bfm/contracts/`), and a shape-specific walk would need a new
 * entry every time another pillar adopted it — exactly the kind of
 * assumption that produced this gap.
 *
 * @param {string} repoRoot Absolute path to the repo root.
 * @param {readonly string[]} scanRoots Repo-relative directories to walk (see {@link UNIT_KIND_ROOTS}).
 * @param {string} basename Exact filename to match.
 * @returns {string[]}
 */
export function discoverFilesNamed(repoRoot, scanRoots, basename) {
  /** @type {string[]} */
  const found = [];

  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (DISCOVERY_SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(entryPath);
        continue;
      }
      if (entry.name !== basename) continue;
      if (
        entry.isFile() ||
        (entry.isSymbolicLink() && symlinkResolvesToFileInRepo(repoRoot, entryPath))
      ) {
        found.push(relative(repoRoot, entryPath).split(sep).join('/'));
      }
    }
  };

  for (const scanRoot of scanRoots) {
    const abs = join(repoRoot, scanRoot);
    if (existsSync(abs)) walk(abs);
  }

  return found.toSorted();
}

/**
 * Every discovered path that is not one of the declared copies.
 *
 * The half of the fix that actually closes POPS-2206: a same-named file can
 * sit on disk, byte-identical or corrupted, and pass every check that only
 * ever reads `copies` — because `copies` is the thing being checked, not
 * the ground truth it is supposed to describe. This compares against the
 * filesystem instead.
 *
 * @param {readonly string[]} discovered
 * @param {readonly FixtureCopy[]} copies
 * @returns {string[]}
 */
export function findUndeclaredCopies(discovered, copies) {
  const declared = new Set(copies.map((copy) => copy.path));
  return discovered.filter((path) => !declared.has(path));
}

/**
 * Prove {@link findUndeclaredCopies} actually reports, and does not flag the
 * copies it is handed as ground truth (including the canonical one — it is
 * one of `copies` like any other, never treated specially here).
 *
 * Fabricates its discovered-path list rather than writing to the real tree:
 * a file planted for real under `pillars/` would be visible to every other
 * tree-scanning guard's own self-test running concurrently in the same
 * `vitest run scripts/` invocation, producing a spurious failure unrelated
 * to this one (see `scripts/ci/__tests__/check-icon-dynamic-import.test.ts`
 * for the same interaction hit while writing that guard's suite).
 *
 * @param {readonly FixtureCopy[]} copies
 * @returns {boolean}
 */
export function selfTestUndeclaredDiscovery(copies) {
  const declaredPaths = copies.map((copy) => copy.path);
  let ok = true;

  if (findUndeclaredCopies(declaredPaths, copies).length > 0) {
    console.error('SELF-TEST FAILED (discovery): a declared copy was reported as undeclared');
    ok = false;
  }

  const basename = declaredPaths[0]?.split('/').pop();
  if (basename === undefined) {
    console.error('SELF-TEST FAILED (discovery): no declared copy to derive a basename from');
    return false;
  }
  const planted = `pillars/purchases/contracts/${basename}`;
  const undeclared = findUndeclaredCopies([...declaredPaths, planted], copies);
  if (undeclared.length !== 1 || undeclared[0] !== planted) {
    console.error(`SELF-TEST FAILED (discovery): not caught — an undeclared copy at ${planted}`);
    ok = false;
  }

  if (ok) {
    console.log(
      `self-test OK — reports a same-named file discovered outside the ${String(declaredPaths.length)} declared copies.`
    );
  }
  return ok;
}

/**
 * Prove {@link findUndeclaredCopies} against the REAL tree: no file named
 * `basename` sits under `scanRoots` outside `copies` in this repo, right now.
 *
 * {@link selfTestUndeclaredDiscovery} only proves the comparison mechanism
 * against a fabricated discovered-path list — it never calls
 * {@link discoverFilesNamed} at all, so it cannot see a stray copy actually
 * present on disk. This is the leg `check-vendored-contracts.mjs`'s
 * `selfTestLegSet` runs for the same reason: `findUnvendoredContracts(repoRoot)`
 * there is called against the real tree, not a synthetic one, so a stray file
 * genuinely on disk fails `--self-test` by path. This does the equivalent scan
 * for a fixture copy set, without planting anything — {@link discoverFilesNamed}
 * only reads; it never writes — so it carries none of the cross-suite
 * concurrency risk {@link selfTestUndeclaredDiscovery}'s docstring describes:
 * that risk is specific to a self-test PLANTING a file for real, not to
 * reading the tree as it already stands.
 *
 * `undeclared.length === 0` on its own is satisfied identically by a healthy
 * walk and by a dead one — a `discoverFilesNamed` that always returns `[]`
 * leaves nothing undeclared and passes forever. So this also pins the
 * POSITIVE result: every path `copies` declares must actually be among
 * `discovered`, the same floor `check-vendored-contracts.mjs`'s
 * `selfTestLegSet` pins for its own real-tree leg (`self-test OK — discovers
 * exactly the N pinned vendored leg(s)`). A walk that goes dead, or narrows to
 * miss a real copy, now fails this self-test by name instead of reading as
 * "nothing undeclared, so OK".
 *
 * @param {string} repoRoot Absolute path to the repo root.
 * @param {readonly string[]} scanRoots Repo-relative directories to walk.
 * @param {string} basename Exact filename to match.
 * @param {readonly FixtureCopy[]} copies
 * @returns {boolean}
 */
export function selfTestRealTreeDiscovery(repoRoot, scanRoots, basename, copies) {
  const discovered = discoverFilesNamed(repoRoot, scanRoots, basename);
  const undeclared = findUndeclaredCopies(discovered, copies);
  const declaredPaths = copies.map((copy) => copy.path).toSorted();
  const missing = declaredPaths.filter((path) => !discovered.includes(path));
  const ok = undeclared.length === 0 && missing.length === 0;

  if (!ok) {
    console.error(
      `SELF-TEST FAILED (real-tree discovery): expected to discover exactly the ` +
        `${String(declaredPaths.length)} declared copy path(s) of ${basename}, found ` +
        `${String(discovered.length)}.`
    );
    for (const path of undeclared) console.error(`  undeclared (found, not declared): ${path}`);
    for (const path of missing) console.error(`  missing (declared, not found):     ${path}`);
  } else {
    console.log(
      `self-test OK — discovers exactly the ${String(declaredPaths.length)} declared copy ` +
        `path(s) of ${basename} on disk under ${scanRoots.join(', ')}, no more and no fewer.`
    );
  }
  return ok;
}

/**
 * Whether a `readFileSync` rejection means the file is absent, as opposed to
 * present but unreadable.
 *
 * Exported because {@link checkCopies}'s `null` means "absent" and nothing
 * else, and every reader handed to it has to agree — including the ones in the
 * unit suites. A reader that also returns `null` for EACCES turns a permissions
 * problem into a "missing" report, which is the misdirection this predicate
 * exists to prevent; sharing it makes that agreement structural rather than a
 * convention several files are each expected to remember.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isFileNotFound(error) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/**
 * Check every copy of a fixture: each one present, each one byte-identical to
 * the canonical copy, and each one passing `validate` on its own.
 *
 * Validating each copy separately rather than only the canonical one is not
 * redundant with the equality check — it is what makes the two independent.
 * Should the equality comparison ever be neutered, the content assertions still
 * run against the bytes each consumer's tests actually read.
 *
 * Pure in its I/O so a self-test can drive it with a reader that returns
 * drifted or missing copies.
 *
 * @template T
 * @param {readonly FixtureCopy[]} copies
 * @param {string} canonicalPath Repo-relative path of the canonical copy.
 * @param {(repoRelativePath: string) => string | null} read Reads a copy, or null if absent.
 * @param {(fixture: T) => string[]} validate One message per failed assertion.
 * @returns {string[]} One message per failure; empty means every copy holds.
 */
export function checkCopies(copies, canonicalPath, read, validate) {
  /** @type {string[]} */
  const failures = [];
  /** @type {Map<string, string>} */
  const texts = new Map();

  // A canonical path that is not one of the copies leaves the comparison below
  // with nothing to compare against, and it does so through the same
  // `texts.get() === undefined` that means "the canonical copy is absent from
  // disk". That one is already reported; this one is a guard wired up wrong,
  // and without this it would pass having compared nothing.
  if (!copies.some((copy) => copy.path === canonicalPath)) {
    failures.push(
      `${canonicalPath}: named as the canonical copy but not one of the ` +
        `${String(copies.length)} declared — nothing would be compared against it`
    );
  }

  for (const { role, path } of copies) {
    const text = read(path);
    if (text === null) {
      failures.push(`${path}: missing — the ${role} copy of the fixture is not on disk`);
      continue;
    }
    texts.set(path, text);
  }

  const canonicalText = texts.get(canonicalPath);
  if (canonicalText !== undefined) {
    for (const [path, text] of texts) {
      if (path !== canonicalPath && text !== canonicalText) {
        failures.push(`${path}: drifted from ${canonicalPath} — the copies must be byte-identical`);
      }
    }
  }

  for (const [path, text] of texts) {
    /** @type {T} */
    let fixture;
    try {
      fixture = JSON.parse(text);
    } catch (error) {
      failures.push(`${path}: not parseable as JSON — ${String(error)}`);
      continue;
    }
    for (const failure of validate(fixture)) failures.push(`${path}: ${failure}`);
  }

  return failures;
}

/**
 * Prove {@link checkCopies} still reports every way a copy set can go wrong.
 *
 * A guard nobody has watched fail is a guard nobody knows works, and this is
 * the half of a fixture guard with no crypto in it — the half that looks
 * obviously correct and is exactly as easy to neuter as any other comparison.
 *
 * Logs its own findings so a caller only has to propagate the boolean.
 *
 * @template T
 * @param {readonly FixtureCopy[]} copies
 * @param {string} canonicalPath
 * @param {T} valid A fixture already known to pass `validate`.
 * @param {(fixture: T) => string[]} validate
 * @returns {boolean}
 */
export function selfTestCopyHandling(copies, canonicalPath, valid, validate) {
  const validText = JSON.stringify(valid);
  /** @param {Map<string, string>} files */
  const readerOver = (files) => (/** @type {string} */ p) => files.get(p) ?? null;
  const identical = new Map(copies.map(({ path }) => [path, validText]));

  // Drift is only meaningful against the canonical copy, so every case below
  // perturbs a copy that is NOT it — chosen by that property rather than by
  // position, so reordering or extending the copy list cannot turn these into
  // assertions about the canonical file drifting from itself.
  const perturbable = copies.find((copy) => copy.path !== canonicalPath);
  if (perturbable === undefined) {
    console.error('SELF-TEST FAILED: no non-canonical copy to perturb — drift is untestable');
    return false;
  }

  /** @param {string} contents */
  const withPerturbed = (contents) =>
    checkCopies(
      copies,
      canonicalPath,
      readerOver(new Map(identical).set(perturbable.path, contents)),
      validate
    );

  let ok = true;
  if (checkCopies(copies, canonicalPath, readerOver(identical), validate).length > 0) {
    console.error('SELF-TEST FAILED: identical copies were reported as drifted');
    ok = false;
  }

  /** @type {[string, string[]][]} */
  const driftCases = [
    ['one copy edited without the other', withPerturbed(JSON.stringify({ ...valid, drift: 1 }))],
    ['one copy reformatted but semantically equal', withPerturbed(JSON.stringify(valid, null, 4))],
    ['one copy is not JSON at all', withPerturbed('{ not json')],
    [
      'a copy deleted',
      checkCopies(
        copies,
        canonicalPath,
        readerOver(new Map([[canonicalPath, validText]])),
        validate
      ),
    ],
    // Not a state of the files — a state of the wiring, and the one that fails
    // green: with nothing to compare against, every copy still validates on its
    // own and the guard reports success having compared nothing.
    [
      'the canonical path is not one of the declared copies',
      checkCopies(copies, 'not/a/declared/copy.json', readerOver(identical), validate),
    ],
  ];

  for (const [label, failures] of driftCases) {
    if (failures.length === 0) {
      console.error(`SELF-TEST FAILED: not caught — ${label}`);
      ok = false;
    }
  }

  if (ok) {
    console.log(
      `self-test OK — rejects ${driftCases.length} ways the ${copies.length} copies can disagree.`
    );
  }
  return ok;
}

/**
 * Read a copy from the working tree under {@link checkCopies}'s `string | null`
 * contract.
 *
 * The only place a guard decides what `null` means, and the reason it is here
 * rather than inline in each one. An absent copy is a FINDING — `checkCopies`
 * reports it as missing — but an unreadable one is an environment failure, and
 * collapsing the two prints "not on disk" about a file that is right there.
 * Wrong output is worse than none: it sends the reader to `git status` instead
 * of to the permissions.
 *
 * @param {string} repoRoot
 * @param {(message: string) => never} fail Called when a copy exists but cannot be read.
 * @returns {(repoRelativePath: string) => string | null}
 */
export function repoCopyReader(repoRoot, fail) {
  return (repoRelativePath) => {
    try {
      return readFileSync(join(repoRoot, repoRelativePath), 'utf8');
    } catch (error) {
      if (isFileNotFound(error)) return null;
      return fail(`FAIL — cannot read ${repoRelativePath}: ${String(error)}`);
    }
  };
}
