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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {object} FixtureCopy
 * @property {string} role Why this copy exists, for the failure message.
 * @property {string} path Repo-relative.
 */

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
