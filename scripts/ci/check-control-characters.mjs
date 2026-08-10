#!/usr/bin/env node
/**
 * Control-character guard.
 *
 * A composite map key built from a template literal once used a literal
 * `U+0000` (NUL) as its separator instead of a named join. It behaved
 * correctly — NUL is a legal separator — so tests passed, and `oxlint
 * --type-aware`, `oxfmt --check`, `tsc --noEmit` and the pre-commit hook were
 * all green with it in place. Only `git diff`/`grep` noticed, and both did it
 * by silently reclassifying the file as binary rather than by reporting
 * anything: `grep` returns no matches (reads as "the symbol is gone", not
 * "this file is binary") and `git diff` prints "Binary files … differ"
 * instead of a line-level diff. A control byte that turns off the tools built
 * to show it is worth failing the build over on its own, independent of
 * whatever behaviour it happens to produce.
 *
 * THE CHARACTER CLASS — decided explicitly, not left to a library default:
 *
 *   - Tab (0x09), LF (0x0A) and CR (0x0D) are legitimate: every text file in
 *     this repo already contains them, they render consistently everywhere,
 *     and no tool treats a file as binary for having them.
 *   - Every other C0 control (0x00–0x1F) and DEL (0x7F) is disallowed. None
 *     of the remaining twenty-nine has a legitimate reason to reach committed
 *     source or config here: no fixture in this repo captures raw terminal
 *     escape sequences (ESC, 0x1B) or other C0 controls as literal bytes, and
 *     the incident this guard exists for is exactly one of them (NUL, 0x00).
 *   - Unicode's C1 controls (U+0080–U+009F) are deliberately OUT of scope.
 *     This guard scans raw bytes, not decoded code points, and every byte in
 *     0x80–0xBF is a valid UTF-8 CONTINUATION byte — it appears constantly in
 *     ordinary multi-byte text (accents, CJK, emoji) with no relation to a C1
 *     control. Flagging that range at the byte level would misclassify most
 *     non-ASCII text in `docs/` as a violation. Catching a C1 control would
 *     need a real UTF-8 decode step, which is a different, heavier guard than
 *     "a byte that turns off `grep`" — not built here because nothing in this
 *     repo's incident history has ever needed it.
 *
 * FILE-TYPE DISCRIMINATION is by extension, not by content-sniffing. The
 * obvious alternative — "binary is whatever contains a NUL early in the
 * file", which is what `grep` and `git diff` already do — is the exact
 * failure mode this guard exists to close: a text file with a stray NUL would
 * be reclassified as binary and silently exempted, so the incident would slip
 * through the guard built to catch it. `BINARY_EXTENSIONS` below is a
 * deliberately short, explicit allowlist of formats that are genuinely binary
 * by specification (images, fonts, archives, certs, databases, media) and
 * that this repo actually or plausibly commits under the scanned roots. A
 * path with no extension (`Dockerfile`) or an unrecognised one is scanned as
 * text — the safe default, since scanning a text file costs nothing and
 * silently skipping one hides exactly this incident.
 *
 * SCOPE is `pillars/`, `libs/`, `scripts/`, `.github/` and `docs/` — the
 * source-and-config roots — discovered via `git ls-files`, so untracked and
 * gitignored paths (`node_modules/`, `dist/`, build output) never enter the
 * scan without another ignore list to keep in sync. `clients/` and root-level
 * config (`package.json`, `mise.toml`, `infra/`) are not in this pass; see the
 * Huly backlog for the follow-up on widening scope.
 *
 * TIER — install-free (Tier A, ADR-045 amendment). This is a byte-level scan
 * over `node:fs`/`node:child_process` only; it needs no YAML/TOML parser, so
 * it runs straight after `actions/checkout` with no `pnpm install`.
 *
 * Usage:
 *   node scripts/ci/check-control-characters.mjs
 *   node scripts/ci/check-control-characters.mjs --self-test
 *
 * Exit 0 = every scanned file is clean. Exit 1 = a violation, a read failure,
 * or zero files discovered (ADR-045: an empty scan is a failure, not an OK).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** The source-and-config roots this guard scans. See file header "SCOPE". */
export const SCOPE_ROOTS = Object.freeze(['pillars', 'libs', 'scripts', '.github', 'docs']);

/** Tab, LF, CR — the only control bytes this repo treats as legitimate. */
const ALLOWED_CONTROL_BYTES = new Set([0x09, 0x0a, 0x0d]);

/**
 * Genuinely binary formats this repo commits (or plausibly will) under
 * {@link SCOPE_ROOTS}. See file header "FILE-TYPE DISCRIMINATION" for why
 * this is an extension allowlist rather than content-sniffing.
 */
export const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.tif',
  '.avif',
  '.icns',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.zip',
  '.gz',
  '.tgz',
  '.pdf',
  '.wasm',
  '.der',
  '.p12',
  '.pfx',
  '.jks',
  '.keystore',
  '.sqlite',
  '.sqlite3',
  '.db',
  '.mp4',
  '.mp3',
  '.wav',
  '.mov',
  '.avi',
]);

/**
 * @typedef {object} ControlCharacterHit
 * @property {number} offset Zero-based byte offset into the file.
 * @property {number} byte   The disallowed byte value (0–255).
 * @property {number} line   One-based line number the byte falls on.
 */

/**
 * @param {number} byte
 * @returns {boolean}
 */
export function isDisallowedControlByte(byte) {
  if (ALLOWED_CONTROL_BYTES.has(byte)) return false;
  return byte < 0x20 || byte === 0x7f;
}

/**
 * Scan one file's raw bytes for disallowed control characters. Operates on
 * bytes, not decoded text, so a multi-byte UTF-8 sequence (every byte of
 * which is >= 0x80) can never be mistaken for a C0 control or DEL — see file
 * header.
 *
 * @param {Buffer} bytes
 * @returns {ControlCharacterHit[]}
 */
export function findControlCharacters(bytes) {
  /** @type {ControlCharacterHit[]} */
  const hits = [];
  let line = 1;
  for (let offset = 0; offset < bytes.length; offset += 1) {
    const byte = bytes[offset];
    if (isDisallowedControlByte(byte)) hits.push({ offset, byte, line });
    if (byte === 0x0a) line += 1;
  }
  return hits;
}

/**
 * @param {string} relPath POSIX-style, repo-relative.
 * @returns {boolean}
 */
export function isBinaryAsset(relPath) {
  const dot = relPath.lastIndexOf('.');
  if (dot === -1) return false;
  return BINARY_EXTENSIONS.has(relPath.slice(dot).toLowerCase());
}

/**
 * The subset of tracked paths this guard actually reads: everything not
 * classified as a genuine binary asset. Pure and separated from disk I/O so
 * the self-test can prove the extension filter does the right thing without
 * touching the filesystem.
 *
 * @param {string[]} relPaths
 * @returns {string[]}
 */
export function filterScannableFiles(relPaths) {
  return relPaths.filter((p) => !isBinaryAsset(p));
}

/**
 * Every path `git` tracks under `roots`, repo-relative and POSIX-separated.
 * `-z` NUL-delimits the output — the one place in this file a NUL is exactly
 * the right separator, because it is `git` producing process output, not a
 * byte inside a committed file.
 *
 * @param {string} root Absolute path to the repo root.
 * @param {readonly string[]} roots
 * @returns {string[]}
 */
export function listTrackedFiles(root, roots) {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...roots], {
    cwd: root,
    encoding: 'utf8',
  });
  return out.split('\0').filter((p) => p.length > 0);
}

/**
 * @typedef {object} FileViolations
 * @property {string} path
 * @property {ControlCharacterHit[]} hits
 */

/**
 * Pure core: given already-read file contents, report every file carrying a
 * disallowed control character. No I/O, so the self-test drives it with
 * in-memory buffers.
 *
 * @param {Array<{ path: string, bytes: Buffer }>} files
 * @returns {FileViolations[]}
 */
export function findControlCharacterViolations(files) {
  /** @type {FileViolations[]} */
  const violations = [];
  for (const { path, bytes } of files) {
    const hits = findControlCharacters(bytes);
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
 * The full decision, isolated from process.exit so the self-test can drive
 * every branch directly — including the ones a real run should never hit.
 *
 * Order matters and is the ADR-045 discovery-floor shape: zero discovered
 * files fails before anything else runs (a renamed root or a guard running
 * outside a git checkout must not read as "nothing to report"), a read error
 * fails rather than being treated as "file has no violations", and only then
 * are the actual byte contents checked.
 *
 * @param {{ trackedCount: number, files: Array<{ path: string, bytes: Buffer }>, readFailures: string[] }} input
 * @returns {Evaluation}
 */
export function evaluate({ trackedCount, files, readFailures }) {
  if (trackedCount === 0) return { ok: false, reason: 'no-files-discovered' };
  if (readFailures.length > 0) return { ok: false, reason: 'read-failure', readFailures };
  const violations = findControlCharacterViolations(files);
  if (violations.length > 0) return { ok: false, reason: 'violations', violations };
  return { ok: true };
}

/**
 * Read every scannable tracked file under `roots`. A read error is recorded
 * rather than thrown or skipped, so it reaches {@link evaluate} as a failure
 * (ADR-045: no bare catch between finding a subject and reporting on it).
 *
 * @param {string} root
 * @param {readonly string[]} roots
 * @returns {{ trackedCount: number, files: Array<{ path: string, bytes: Buffer }>, readFailures: string[] }}
 */
function readTree(root, roots) {
  const tracked = listTrackedFiles(root, roots);
  const scannable = filterScannableFiles(tracked);
  /** @type {Array<{ path: string, bytes: Buffer }>} */
  const files = [];
  /** @type {string[]} */
  const readFailures = [];
  for (const relPath of scannable) {
    try {
      files.push({ path: relPath, bytes: readFileSync(join(root, relPath)) });
    } catch (error) {
      readFailures.push(`${relPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { trackedCount: tracked.length, files, readFailures };
}

function run() {
  const { trackedCount, files, readFailures } = readTree(repoRoot, SCOPE_ROOTS);
  const result = evaluate({ trackedCount, files, readFailures });

  if (result.ok) {
    console.log(
      `OK — scanned ${String(files.length)} text file(s) of ${String(trackedCount)} tracked ` +
        `under ${SCOPE_ROOTS.join(', ')} (${String(trackedCount - files.length)} binary-skipped); ` +
        'no disallowed control characters.'
    );
    return true;
  }

  if (result.reason === 'no-files-discovered') {
    console.error(
      `FAIL — \`git ls-files\` found 0 tracked files under ${SCOPE_ROOTS.join(', ')}. Either a ` +
        'root was renamed, or this ran outside a git checkout. Fix SCOPE_ROOTS or the ' +
        'environment — do not read an empty scan as a clean one.'
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
    `FAIL — ${String(total)} disallowed control character(s) across ${String(violations.length)} file(s):`
  );
  for (const { path, hits } of violations) {
    for (const hit of hits) {
      const hex = `0x${hit.byte.toString(16).padStart(2, '0')}`;
      console.error(`  ${path}:${String(hit.line)} — ${hex} at byte offset ${String(hit.offset)}`);
    }
  }
  console.error(
    '\nTab, newline and carriage return are the only control bytes accepted in committed text. ' +
      'Everything else in C0 (0x00–0x1F) plus DEL (0x7F) turns off `grep` and `git diff` (both ' +
      'reclassify the file as binary) and has never been an intentional choice in this repo — ' +
      'remove it. If this is a genuine binary asset, add its extension to BINARY_EXTENSIONS in ' +
      'scripts/ci/check-control-characters.mjs instead of editing the bytes.'
  );
  return false;
}

/**
 * Prove the guard reports rather than merely passes (ADR-045): the positive
 * case (a planted violation is caught), the character-class boundary (which
 * bytes are allowed and which are not), the file-type discrimination (a
 * binary path is skipped, and the skip is not vacuous — real binary magic
 * bytes really do trip the byte-level scanner when nothing exempts them), and
 * the degenerate cases (zero files discovered, and a read failure) each
 * produce a deterministic failure rather than silence or a crash.
 *
 * @returns {boolean}
 */
function selfTest() {
  /** @type {Record<string, boolean>} */
  const checks = {};

  checks['NUL is caught'] = findControlCharacters(Buffer.from([0x00])).length === 1;
  checks['other C0 controls are caught (0x01, 0x1f ESC-adjacent)'] =
    findControlCharacters(Buffer.from([0x01, 0x1f])).length === 2;
  checks['DEL (0x7f) is caught'] = findControlCharacters(Buffer.from([0x7f])).length === 1;
  checks['tab, LF, CR are allowed'] =
    findControlCharacters(Buffer.from([0x09, 0x0a, 0x0d])).length === 0;

  const multiByteText = Buffer.from(
    'café 日本語 🎉 — plain text with a tab\tand a newline\n',
    'utf8'
  );
  checks['ordinary multi-byte UTF-8 text produces no false positives'] =
    findControlCharacters(multiByteText).length === 0;

  const twoLines = Buffer.from('line one\nline tw\x00o\n', 'utf8');
  const twoLineHits = findControlCharacters(twoLines);
  checks['violation line number is computed from preceding newlines'] =
    twoLineHits.length === 1 && twoLineHits[0].line === 2;

  checks['.png is a binary extension'] = isBinaryAsset('pillars/shell/e2e/fixtures/photo.png');
  checks['.woff2 is a binary extension'] = isBinaryAsset('libs/ui/src/fonts/sans.woff2');
  checks['.ts source is not a binary extension'] = !isBinaryAsset('pillars/finance/src/index.ts');
  checks['an extensionless file (Dockerfile) is not a binary extension'] = !isBinaryAsset(
    'pillars/finance/Dockerfile'
  );

  checks['filterScannableFiles drops binary paths and keeps the rest'] = (() => {
    const kept = filterScannableFiles(['a.ts', 'b.png', 'c.woff2', 'Dockerfile', 'd.md']);
    return kept.length === 3 && kept.includes('a.ts') && kept.includes('Dockerfile');
  })();

  // The binary skip has to be proven non-vacuous: it only means something if
  // real binary content WOULD have tripped the scanner had nothing exempted
  // it. The PNG file signature is a stable, well-known 8-byte constant.
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  checks['PNG magic bytes contain a disallowed byte (0x1a) — the skip is load-bearing'] =
    findControlCharacters(pngMagic).length > 0;

  checks['zero discovered files fails rather than passing vacuously'] =
    evaluate({ trackedCount: 0, files: [], readFailures: [] }).reason === 'no-files-discovered';

  checks['a read failure surfaces rather than being treated as "no violations"'] =
    evaluate({
      trackedCount: 1,
      files: [],
      readFailures: ['ghost.ts: ENOENT'],
    }).reason === 'read-failure';

  checks['a planted violation reaches evaluate() as a failure'] =
    evaluate({
      trackedCount: 1,
      files: [{ path: 'ghost.ts', bytes: Buffer.from('const x = 1;\x00\n') }],
      readFailures: [],
    }).reason === 'violations';

  checks['a clean tree reaches evaluate() as ok'] = evaluate({
    trackedCount: 1,
    files: [{ path: 'ghost.ts', bytes: Buffer.from('const x = 1;\n') }],
    readFailures: [],
  }).ok;

  // Discovery has to still see the real tree, or every check above is proving
  // a mechanism that no longer runs against anything.
  const realTracked = listTrackedFiles(repoRoot, SCOPE_ROOTS);
  checks[`real \`git ls-files\` under ${SCOPE_ROOTS.join(', ')} finds files`] =
    realTracked.length > 0;

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
      'Usage: node scripts/ci/check-control-characters.mjs [--self-test]\n' +
        'Fails on any disallowed control character (outside tab/LF/CR) in tracked text under ' +
        `${SCOPE_ROOTS.join(', ')}.`
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  process.exit(run() ? 0 : 1);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
