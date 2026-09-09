#!/usr/bin/env node
/**
 * Raw-form-control ratchet (POPS-3187, epic POPS-3168 "every form control is
 * a kit component").
 *
 * Nothing enforced the convention that pillar UI composes `@pops/ui` form
 * primitives instead of the raw DOM elements they wrap. Two artifacts already
 * in this repo are the evidence: `lists`' `ShoppingSortDropdown` carries a
 * comment justifying a raw `<select>` on a belief about the kit that was
 * never true, and a second `ListKindChip` grew from a policy whose source
 * file has since been deleted. Convention alone did not hold it.
 *
 * This gate reads pillar frontend source for a raw `<select>`, `<input>`, or
 * `<textarea>` JSX element and, per pillar, ratchets the count against a
 * committed baseline (`.raw-form-control-baseline.json`) — modelled on the
 * escape-hatch gate (`scripts/check-escape-hatches.mjs`, POPS-3151-adjacent).
 *
 * The baseline is an UPPER BOUND: a pillar that has grown past its entry
 * fails, a pillar that has fallen below it passes. POPS-3187 shipped this
 * held to EQUALITY instead, so that a baseline hand-edited above the real
 * count could not pass unnoticed. Under concurrent work that cost more than
 * it bought: every migration ticket in POPS-3168 lowers some pillar's count,
 * so every one of them had to edit this same one-line JSON file, and each
 * merge invalidated every other open PR — a purely mechanical conflict
 * resolved four times on one branch and twice on another, O(n²) in the
 * number of PRs in flight (POPS-3236).
 *
 * The inflation hole that opens up is closed from the diff instead, and this
 * is the property that replaces the downward check: NO CHANGE MAY RAISE A
 * PILLAR'S BASELINE ENTRY ABOVE THAT PILLAR'S REAL COUNT. Given `--base
 * <commit>`, the gate reads the baseline as it stood at that commit and
 * fails any pillar whose entry this change raised while the tree sits below
 * the raised number. Inflation is reachable only by editing this file, so
 * comparing the file against its own base is a tighter test than comparing
 * it against the tree: it still catches the hand-edit, and it stops firing
 * on the honest staleness that equality could not tell apart from it.
 *
 * That is deliberately NOT "does the diff touch that pillar's source", the
 * shape POPS-3236 sketched. That rule cannot survive its own success: once
 * one migration lands without a baseline edit, `main` itself sits below its
 * baseline, and the next PR — which touches some other pillar entirely —
 * fails on a decrease it did not cause.
 *
 * Without `--base` (a local run, or a CI checkout with no usable merge base)
 * only the growth half runs, and the gate says so on a line that is not its
 * success line. That is a tolerated degradation, not a silent one: the
 * inflation rule is a statement about a diff, and a run with no base has no
 * diff to judge. `.github/workflows/quality.yml` always supplies one.
 *
 * Scope: `pillars/**` only — `libs/ui/src/**` is the kit itself, which
 * legitimately wraps these native elements, and a guard that fires on the
 * library implementing the invariant would get itself disabled (POPS-3168).
 * `libs` is not in `ROOTS` at all, so no exemption list is needed to keep it
 * out.
 *
 * The reasoning behind the invariant this gate enforces — why a local
 * workaround is ruled out rather than tolerated, the kit extensions this
 * epic produced as worked examples, and the standing exceptions (shell's
 * settings renderer, `libs/navigation`'s global search, and others) — is
 * recorded in docs/architecture/adr-051-form-controls-from-the-kit.md, not
 * here. This file only enforces the mechanical shape.
 *
 * What the baseline is NOT: a target. POPS-3187 shipped this gate with a
 * baseline of 90 and an aspiration of zero; the epic closed at 54 because
 * its tickets were scoped by control class, not by "drive the count down."
 * POPS-3260 audited all 54 and decided the end state is zero per pillar
 * plus a by-name allowlist — 47 migrate onto kit components that already
 * exist, 6 are genuine exceptions, 1 needs a kit colour input. Until those
 * migrations land the number here is work in progress, not the floor. Do
 * not read a passing run as "this pillar is done."
 *
 * Known legitimate exception: a native `<input type="file">`. A file picker
 * has no non-native form — `@pops/ui`'s own `FileUpload` (libs/ui) wraps one
 * for the same reason — so a statically-literal `type="file"` is never
 * counted, in any pillar. Every other raw control, including a *dynamic*
 * `type` on `<input>` (this guard cannot prove it resolves to `"file"`, and
 * ADR-045 says an unresolved shape is a violation, not a pass), counts.
 *
 * Usage:
 *   node scripts/ci/check-raw-form-controls.mjs                  check the real tree
 *   node scripts/ci/check-raw-form-controls.mjs --base <commit>  …and check the baseline
 *                                                                was not raised since <commit>
 *   node scripts/ci/check-raw-form-controls.mjs --write          regenerate the baseline
 *   node scripts/ci/check-raw-form-controls.mjs --self-test      prove the gate reports
 *
 * Exit 0 = no pillar exceeds its baseline and no entry was raised above the
 * tree. Exit 1 = growth, an inflated entry, or a self-test failure. Exit 2 =
 * usage error, an unreadable baseline, or a `--base` that does not resolve.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gitEnv } from './resolve-report-base.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const BASELINE_REL = '.raw-form-control-baseline.json';
const BASELINE_PATH = join(repoRoot, BASELINE_REL);

/** Only `pillars/**` — never `libs/**`, so the kit itself is structurally out of scope. */
const SCAN_ROOTS = ['pillars'];

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  'storybook-static',
  'playwright-report',
  'test-results',
]);

/** JSX only lives in these. */
const SOURCE_EXT_RE = /\.tsx$|\.jsx$/;

/** Test / story / fixture files — a raw control there is a mock, not shipped UI. */
const EXEMPT_FILE_RE = /\.stories\.|\.test\.|\.spec\.|[/\\]__tests__[/\\]|[/\\]e2e[/\\]/;

/** Generated API client trees: `src/<pillar>-api/…`. */
const GENERATED_CLIENT_RE = /\/src\/[a-z-]+-api\//;

/** The three native elements the kit exists to replace. */
const TAG_RE = /<(select|input|textarea)\b/g;

/**
 * Blank out comment lines, keeping the line count so reported positions stay
 * honest. Without this a JSDoc line that mentions the literal tag —
 * `` * Native `<select>` for the sort mode `` is real, pre-existing prose in
 * this repo — reads as code and inflates the count on text nobody shipped.
 * Same heuristic as `scripts/check-escape-hatches.mjs`, plus the JSX
 * comment (`{/* ... *\/}`) shape that guard doesn't need to know about.
 *
 * @param {string} text
 */
function stripCommentLines(text) {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('*') ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('{/*')
        ? ''
        : line;
    })
    .join('\n');
}

/**
 * Extract one JSX opening tag starting at `start` (the index of `<`).
 * Balances `{}` and tracks quote/template state so a `>` inside an attribute
 * expression (a generic, a comparison, an arrow function) does not end the
 * tag early.
 *
 * @param {string} source
 * @param {number} start
 * @returns {string}
 */
function extractOpeningTag(source, start) {
  let depth = 0;
  /** @type {"'" | '"' | '`' | null} */
  let quote = null;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (ch === '>' && depth === 0) {
      return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

/**
 * One attribute's raw value text (`"file"`, `{'file'}`, `{dynamicVar}`), or
 * `null` if `attrName` isn't present. Only the first occurrence matters here
 * — a well-formed tag never repeats an attribute.
 *
 * @param {string} tag
 * @param {string} attrName
 * @returns {string | null}
 */
function attrValue(tag, attrName) {
  const prefix = new RegExp(`(?<![\\w-])${attrName}\\s*=\\s*`);
  const match = prefix.exec(tag);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length;
  const opener = tag[start];
  if (opener !== '"' && opener !== "'" && opener !== '{') return null;
  /** @type {Array<'"' | "'" | '`' | '}'>} */
  const stack = [opener === '{' ? '}' : opener];
  let i = start + 1;
  while (i < tag.length && stack.length > 0) {
    const ch = tag[i];
    const top = stack[stack.length - 1];
    if (top === '"' || top === "'" || top === '`') {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === top) {
        stack.pop();
        i += 1;
        continue;
      }
    } else if (ch === '"' || ch === "'" || ch === '`') {
      stack.push(ch);
    } else if (ch === '{') {
      stack.push('}');
    } else if (ch === '}') {
      stack.pop();
    }
    i += 1;
  }
  return tag.slice(start, i);
}

/**
 * Resolve a captured attribute value to a statically-known string, or `null`
 * when it isn't one (a variable, a template with interpolation, a ternary —
 * anything this guard can't evaluate).
 *
 * @param {string} raw
 * @returns {string | null}
 */
function resolveStaticValue(raw) {
  const trimmed = raw.trim();
  const source = trimmed.startsWith('{') && trimmed.endsWith('}') ? trimmed.slice(1, -1) : trimmed;
  const literal = /^(["'`])([^"'`]*)\1$/.exec(source.trim());
  return literal ? (literal[2] ?? null) : null;
}

/**
 * Is this `<input>` opening tag a native file picker? Only a statically
 * literal `type="file"` (or `type={'file'}`) counts — a dynamic `type` this
 * guard cannot resolve is treated as a violation, not guessed at (ADR-045).
 *
 * @param {string} tag
 * @returns {boolean}
 */
function isFileInput(tag) {
  const raw = attrValue(tag, 'type');
  if (raw === null) return false;
  return resolveStaticValue(raw) === 'file';
}

/**
 * @typedef {object} Violation
 * @property {string} file Repo-relative path.
 * @property {number} line 1-indexed line the opening tag starts on.
 * @property {string} tag  `select`, `input`, or `textarea`.
 */

/**
 * Pure core: find every raw form-control element in one file's source. No
 * I/O, so the self-test and unit tests drive it over synthetic strings.
 *
 * @param {string} relPath
 * @param {string} source
 * @returns {Violation[]}
 */
export function findViolations(relPath, source) {
  const code = stripCommentLines(source);
  /** @type {Violation[]} */
  const violations = [];
  for (const match of code.matchAll(TAG_RE)) {
    const tagName = match[1];
    if (tagName === undefined || match.index === undefined) continue;
    const tag = extractOpeningTag(code, match.index);
    if (tagName === 'input' && isFileInput(tag)) continue;
    violations.push({
      file: relPath,
      line: code.slice(0, match.index).split('\n').length,
      tag: tagName,
    });
  }
  return violations;
}

/**
 * Should this path be scanned at all? Takes a repo-relative POSIX-style path.
 *
 * @param {string} relPath
 * @returns {boolean}
 */
export function isScannable(relPath) {
  const path = `/${relPath}`;
  if (!SOURCE_EXT_RE.test(relPath)) return false;
  if (EXEMPT_FILE_RE.test(path)) return false;
  return !GENERATED_CLIENT_RE.test(path);
}

/**
 * The pillar a repo-relative path belongs to — the path segment right after
 * `pillars/` — or `null` for a path this guard should never be asked about.
 *
 * @param {string} relPath
 * @returns {string | null}
 */
export function pillarOf(relPath) {
  const match = /^pillars\/([^/]+)\//.exec(relPath);
  return match ? (match[1] ?? null) : null;
}

/**
 * A floor on discovery. This repo has well over a thousand `.tsx` files
 * across its pillar app trees; a number near zero means the walk broke, not
 * that every pillar shipped nothing but generated clients.
 */
const MIN_DISCOVERED_FILES = 500;

/**
 * Every scannable file under `pillars/`, repo-relative and POSIX-style.
 *
 * @returns {string[]}
 */
function discoverFiles() {
  /** @type {string[]} */
  const found = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = relative(repoRoot, abs).split(sep).join('/');
      if (isScannable(rel)) found.push(rel);
    }
  };
  for (const root of SCAN_ROOTS) {
    const abs = join(repoRoot, root);
    if (existsSync(abs) && statSync(abs).isDirectory()) walk(abs);
  }
  return found.toSorted((a, b) => a.localeCompare(b));
}

/**
 * Scan the real tree and return per-pillar violation counts (pillars with
 * zero violations are omitted) plus the file count the scan is derived from.
 *
 * @returns {{ counts: Record<string, number>, scanned: number, violations: Violation[] }}
 */
export function scanRawFormControls() {
  const files = discoverFiles();
  /** @type {Violation[]} */
  const violations = [];
  for (const file of files) {
    violations.push(...findViolations(file, readFileSync(join(repoRoot, file), 'utf8')));
  }
  /** @type {Record<string, number>} */
  const counts = {};
  for (const v of violations) {
    const pillar = pillarOf(v.file);
    if (pillar === null) continue;
    counts[pillar] = (counts[pillar] ?? 0) + 1;
  }
  return { counts: sortKeys(counts), scanned: files.length, violations };
}

/**
 * @param {Record<string, number>} obj
 * @returns {Record<string, number>}
 */
function sortKeys(obj) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const key of Object.keys(obj).toSorted()) {
    const value = obj[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Parse a baseline document, rejecting any shape that is not a flat map of
 * pillar id to non-negative integer. `JSON.parse` hands back `any`, and a
 * baseline whose values are strings would otherwise compare with `>` under
 * JavaScript's coercion rules rather than being reported.
 *
 * @param {string} text
 * @param {string} source Where the text came from, for the error message.
 * @returns {Record<string, number>}
 */
export function parseBaseline(text, source) {
  /** @type {unknown} */
  const parsed = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${source} is not a JSON object of pillar → count`);
  }
  /** @type {Record<string, number>} */
  const counts = {};
  for (const [pillar, value] of Object.entries(parsed)) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(`${source}: pillar "${pillar}" is not a non-negative integer count`);
    }
    counts[pillar] = value;
  }
  return counts;
}

/** @returns {Record<string, number>} */
function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `✗ raw-form-control gate: baseline ${relative(repoRoot, BASELINE_PATH)} missing. ` +
        'Run `pnpm check:raw-form-controls:baseline` to create it.'
    );
    process.exit(2);
  }
  try {
    return parseBaseline(readFileSync(BASELINE_PATH, 'utf8'), BASELINE_REL);
  } catch (e) {
    console.error(
      `✗ raw-form-control gate: baseline is not valid (${e instanceof Error ? e.message : String(e)})`
    );
    process.exit(2);
  }
}

/**
 * The baseline document as it stood at `commit`, or `null` when `commit`
 * itself does not resolve in this checkout (a shallow clone, a ref that was
 * never fetched). A commit that resolves but predates the baseline file
 * yields `{}` — an absent file genuinely means "every entry is new", and
 * collapsing that into `null` would hand a change the un-checked path just
 * for deleting the file first.
 *
 * @param {string} commit
 * @param {string} [cwd]
 * @returns {Record<string, number> | null}
 */
export function readBaselineAt(commit, cwd = repoRoot) {
  /** @param {readonly string[]} args @returns {string | null} */
  const git = (args) => {
    try {
      return execFileSync('git', [...args], {
        cwd,
        encoding: 'utf8',
        stdio: 'pipe',
        env: gitEnv(),
      });
    } catch {
      return null;
    }
  };
  if (git(['rev-parse', '--verify', '--quiet', `${commit}^{commit}`]) === null) return null;
  const text = git(['show', `${commit}:${BASELINE_REL}`]);
  if (text === null) return {};
  return parseBaseline(text, `${BASELINE_REL} at ${commit}`);
}

/**
 * @typedef {object} Mismatch
 * @property {string} pillar
 * @property {number} was
 * @property {number} now
 * @property {'grew' | 'inflated'} kind `grew`: the tree now exceeds the
 *   committed baseline — a new raw control. `inflated`: this change raised
 *   the committed entry above the tree, which is the only way a ratchet on
 *   an upper bound can be loosened.
 */

/**
 * Compare current per-pillar counts against the committed baseline, and —
 * when `baselineBefore` is supplied — against the baseline as it stood at
 * the change's base commit.
 *
 * The committed baseline is an upper bound: a count below it is a paid-down
 * pillar and passes, so concurrent migration PRs never have to edit this
 * file in lockstep. What replaces the old equality rule is `baselineBefore`:
 * an entry this change RAISED above the real count is reported as
 * `inflated`. Pass `null` when there is no base to compare against — the
 * growth half still runs, and the caller must say that the other half did
 * not (see the file header).
 *
 * @param {Record<string, number>} current
 * @param {Record<string, number>} baseline
 * @param {Record<string, number> | null} [baselineBefore]
 * @returns {Mismatch[]}
 */
export function diffAgainstBaseline(current, baseline, baselineBefore = null) {
  /** @type {Mismatch[]} */
  const mismatches = [];
  const pillars = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  for (const pillar of pillars) {
    const now = current[pillar] ?? 0;
    const was = baseline[pillar] ?? 0;
    const before = baselineBefore?.[pillar] ?? 0;
    if (now > was) mismatches.push({ pillar, was, now, kind: 'grew' });
    else if (now < was && baselineBefore !== null && was > before) {
      mismatches.push({ pillar, was, now, kind: 'inflated' });
    }
  }
  return mismatches.toSorted((a, b) => a.pillar.localeCompare(b.pillar));
}

/**
 * @param {string[]} argv
 * @returns {string | null}
 */
function baseFlag(argv) {
  const index = argv.indexOf('--base');
  if (index === -1) return null;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--') || value.trim().length === 0) {
    console.error('usage: check-raw-form-controls.mjs --base <commit>');
    process.exit(2);
  }
  return value;
}

/**
 * @param {string[]} argv
 */
function runCheck(argv) {
  const { counts, scanned } = scanRawFormControls();

  // A ratchet that reads no files has stopped looking, not been satisfied
  // (ADR-045) — do NOT let `--write` below erase it.
  if (scanned < MIN_DISCOVERED_FILES) {
    console.error(
      `✗ raw-form-control gate: the scanner read only ${scanned} file(s), below the floor of ` +
        `${MIN_DISCOVERED_FILES}. Check SCAN_ROOTS and isScannable — do NOT rebaseline, ` +
        '`--write` here would erase the ratchet.'
    );
    process.exit(1);
  }

  const baseline = loadBaseline();
  const base = baseFlag(argv);
  /** @type {Record<string, number> | null} */
  let baselineBefore = null;
  if (base === null) {
    console.log(
      '· raw-form-control gate: no --base given, so only the growth half ran — nothing checked ' +
        'whether this change raised a baseline entry above its pillar. CI always passes one.'
    );
  } else {
    try {
      baselineBefore = readBaselineAt(base);
    } catch (e) {
      console.error(
        `✗ raw-form-control gate: the baseline at ${base} is not valid ` +
          `(${e instanceof Error ? e.message : String(e)})`
      );
      process.exit(2);
    }
    if (baselineBefore === null) {
      console.error(
        `✗ raw-form-control gate: --base ${base} does not resolve to a commit in this checkout. ` +
          'Fetch it (the CI job checks out with `fetch-depth: 0`) — running without the base ' +
          'would silently drop the inflated-baseline half of this gate.'
      );
      process.exit(2);
    }
  }

  const mismatches = diffAgainstBaseline(counts, baseline, baselineBefore);

  if (mismatches.length === 0) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(
      `✔ raw-form-control gate: ${total} raw form control(s) across ${Object.keys(counts).length} ` +
        `pillar(s), none above the committed baseline (${scanned} file(s) scanned).`
    );
    return;
  }

  console.error(`✗ raw-form-control gate: ${mismatches.length} pillar(s) out of sync:\n`);
  for (const m of mismatches) {
    if (m.kind === 'grew') {
      console.error(`    ${m.pillar}: baseline ${m.was} → now ${m.now} — NEW raw form control(s)`);
    } else {
      console.error(
        `    ${m.pillar}: this change raised the baseline to ${m.was}, but the tree holds only ` +
          `${m.now} — a baseline above reality is how this ratchet gets loosened. Run ` +
          '`pnpm check:raw-form-controls:baseline` instead of editing the number by hand'
      );
    }
  }
  console.error(
    '\n  No raw <select>, <input> (other than a literal type="file"), or <textarea> may be\n' +
      '  added to pillar UI — use the @pops/ui kit primitive instead. A pillar whose count\n' +
      '  has FALLEN below its baseline is fine and needs no edit here: the baseline is an\n' +
      '  upper bound, so concurrent migrations never have to rewrite it in lockstep\n' +
      '  (POPS-3236). Growth should not happen at all outside a scoped exception.\n' +
      '\n  Why this rule exists, what "extend the kit instead" looks like in practice, and the\n' +
      '  standing exceptions: docs/architecture/adr-051-form-controls-from-the-kit.md'
  );
  process.exit(1);
}

function runWrite() {
  const { counts, scanned } = scanRawFormControls();
  if (scanned < MIN_DISCOVERED_FILES) {
    console.error(
      `✗ raw-form-control gate: refusing to write a baseline from only ${scanned} scanned ` +
        `file(s) (floor ${MIN_DISCOVERED_FILES}). Fix discovery first.`
    );
    process.exit(1);
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(counts, null, 2)}\n`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(
    `✔ wrote ${relative(repoRoot, BASELINE_PATH)}: ${total} raw form control(s) across ` +
      `${Object.keys(counts).length} pillar(s).`
  );
}

/**
 * Prove the gate catches a new violation, a grown pillar count, and a
 * baseline this change raised above the real count — and that it stays quiet
 * on an exempt file, a `type="file"` input, text that merely mentions a tag
 * in a comment, and the paid-down pillar POPS-3236 deliberately stopped
 * failing. Per ADR-045/POPS-2110, this exercises the REPORTING path, not
 * only the passing one: every positive case below asserts the guard actually
 * flags the planted violation, not merely that a clean run exits 0. The
 * cases over `readBaselineAt` are here for the same reason — the inflation
 * half depends on git answering, so a base it cannot read must report, not
 * quietly reduce the gate to its growth half.
 */
function runSelfTest() {
  const { scanned } = scanRawFormControls();
  if (scanned < MIN_DISCOVERED_FILES) {
    console.error(
      `✗ self-test: the scanner read only ${scanned} file(s) — below the floor of ` +
        `${MIN_DISCOVERED_FILES}. It has stopped seeing the tree.`
    );
    process.exit(1);
  }

  /** @type {Array<[label: string, source: string, expectedTags: string[]]>} */
  const dirtyCases = [
    [
      'a raw select',
      '<select value={x} onChange={f}><option value="a">A</option></select>',
      ['select'],
    ],
    ['a raw input with no type', '<input value={x} onChange={f} />', ['input']],
    ['a raw input with a text type', '<input type="text" value={x} onChange={f} />', ['input']],
    [
      'a raw input with a dynamic type — not provably file, so it counts',
      '<input type={kind} value={x} onChange={f} />',
      ['input'],
    ],
    ['a raw textarea', '<textarea value={x} onChange={f} />', ['textarea']],
    [
      'a `>` inside an attribute expression does not desync the tag',
      '<input\n  value={x}\n  onChange={() => setOpen(a > b)}\n/>',
      ['input'],
    ],
    [
      'each raw control on its own line, not just the first',
      '<input value={a} />\n<select value={b}><option value="x" /></select>',
      ['input', 'select'],
    ],
  ];
  for (const [label, source, expectedTags] of dirtyCases) {
    const hits = findViolations('pillars/demo/app/src/Fixture.tsx', source);
    const gotTags = hits.map((h) => h.tag);
    if (JSON.stringify(gotTags) !== JSON.stringify(expectedTags)) {
      console.error(
        `✗ self-test: "${label}" — expected tags ${JSON.stringify(expectedTags)}, got ` +
          `${JSON.stringify(gotTags)}. The gate no longer reports this shape.`
      );
      process.exit(1);
    }
  }

  /** @type {Array<[label: string, source: string]>} */
  const cleanCases = [
    ['a kit Select component (uppercase, not native)', '<Select value={x} onChange={f} />'],
    ['a kit Input component (uppercase, not native)', '<Input value={x} onChange={f} />'],
    ['a kit TextArea component (uppercase, not native)', '<TextArea value={x} onChange={f} />'],
    [
      'a literal type="file" input — the FileUpload exception',
      '<input type="file" onChange={f} />',
    ],
    ["a brace-wrapped literal type={'file'} input", "<input type={'file'} onChange={f} />"],
    [
      'a JSDoc line mentioning `<select>` in prose, not code',
      ' * Native `<select>` for the sort mode. Native is deliberate.',
    ],
    [
      'a `//` line comment mentioning `<input>`',
      '// TODO: replace this with <input type="text" /> once the kit ships one',
    ],
    ['a JSX comment mentioning `<textarea>`', '{/* was <textarea /> before the kit migration */}'],
  ];
  for (const [label, source] of cleanCases) {
    const hits = findViolations('pillars/demo/app/src/Fixture.tsx', source);
    if (hits.length > 0) {
      console.error(
        `✗ self-test: false positive on "${label}" — ${JSON.stringify(hits)}. A guard people ` +
          'learn to ignore is worse than none.'
      );
      process.exit(1);
    }
  }

  // Discovery/exemption plumbing, independent of the matcher above.
  /** @type {Record<string, boolean>} */
  const scanChecks = {
    'a pillar app .tsx file is scannable': isScannable('pillars/food/app/src/pages/X.tsx'),
    'a .jsx file is scannable': isScannable('pillars/food/app/src/pages/X.jsx'),
    'a story is exempt': !isScannable('pillars/lists/app/src/Foo.stories.tsx'),
    'a test is exempt': !isScannable('pillars/lists/app/src/Foo.test.tsx'),
    'a __tests__ file is exempt': !isScannable('pillars/lists/app/src/__tests__/x.tsx'),
    'a generated client is exempt': !isScannable('pillars/food/app/src/lists-api/types.gen.tsx'),
    'a non-jsx file is not scanned': !isScannable('pillars/food/app/src/pages/X.ts'),
    // The whole point of ROOTS being ['pillars']: nothing under libs/ is ever
    // even discovered, so no exemption entry can accidentally be dropped.
    'libs/ui is never a scannable pillar path':
      pillarOf('libs/ui/src/components/Select.tsx') === null,
    "a pillar path resolves to its pillar's id":
      pillarOf('pillars/lists/app/src/X.tsx') === 'lists',
  };

  const ratchetChecks = {
    'an unrecorded new violation is flagged as grown': diffAgainstBaseline(
      { demo: 3 },
      { demo: 2 }
    ).some((m) => m.pillar === 'demo' && m.kind === 'grew' && m.was === 2 && m.now === 3),
    'a brand-new pillar with a violation and no baseline entry is flagged': diffAgainstBaseline(
      { demo: 1 },
      {}
    ).some((m) => m.pillar === 'demo' && m.kind === 'grew'),
    // The property that replaces POPS-3187's downward check (POPS-3236): a
    // baseline RAISED above the real count by this very change must fail.
    'a baseline this change raised above the real count is flagged as inflated':
      diffAgainstBaseline({ demo: 2 }, { demo: 100 }, { demo: 2 }).some(
        (m) => m.pillar === 'demo' && m.kind === 'inflated' && m.was === 100 && m.now === 2
      ),
    'a brand-new baseline entry invented above the real count is flagged as inflated':
      diffAgainstBaseline({ demo: 2 }, { demo: 9 }, {}).some(
        (m) => m.pillar === 'demo' && m.kind === 'inflated'
      ),
    // The whole point of the change: a migration lowers its pillar and does
    // NOT have to touch this file, so it cannot conflict with a sibling PR.
    'a paid-down pillar whose baseline this change left alone passes':
      diffAgainstBaseline({ demo: 0 }, { demo: 5 }, { demo: 5 }).length === 0,
    'a pillar already below its baseline on main does not fail an unrelated change':
      diffAgainstBaseline({ demo: 2, other: 1 }, { demo: 5, other: 1 }, { demo: 5, other: 1 })
        .length === 0,
    'growth is still caught even when the change also lowers the baseline entry':
      diffAgainstBaseline({ demo: 7 }, { demo: 6 }, { demo: 9 }).some((m) => m.kind === 'grew'),
    // Without a base there is no diff to judge, so the inflation half cannot
    // run — runCheck says so on a line that is not its success line.
    'with no base commit a decrease is not reported at all':
      diffAgainstBaseline({ demo: 2 }, { demo: 100 }).length === 0,
    'an exact match across several pillars is clean':
      diffAgainstBaseline({ alpha: 3, beta: 0 }, { alpha: 3, beta: 0 }, { alpha: 3 }).length === 0,
    'a pillar absent from both current and baseline is not a phantom mismatch':
      diffAgainstBaseline({ alpha: 1 }, { alpha: 1, gamma: 0 }, { alpha: 1 }).length === 0,
  };

  const baselineParseChecks = {
    'a baseline whose counts are strings is rejected, not compared by coercion': (() => {
      try {
        parseBaseline('{"demo":"100"}', 'fixture');
        return false;
      } catch {
        return true;
      }
    })(),
    'a baseline that is a JSON array is rejected': (() => {
      try {
        parseBaseline('[]', 'fixture');
        return false;
      } catch {
        return true;
      }
    })(),
    'a well-formed baseline parses': parseBaseline('{"demo":3}', 'fixture').demo === 3,
    // ADR-045: the base half must report that it cannot see, never pass
    // quietly. A ref that resolves to nothing yields null, and runCheck
    // turns that into exit 2 rather than skipping the inflation check.
    'a --base that does not resolve reads as null, not as an empty baseline':
      readBaselineAt('0000000000000000000000000000000000000000') === null,
    // Not compared against the working tree's copy: a developer who has run
    // `--write` but not committed would fail that, and this is a check on
    // whether `git show` still reaches the file, not on staging state.
    "the repo's own HEAD carries a readable baseline with at least one pillar":
      Object.keys(readBaselineAt('HEAD') ?? {}).length > 0,
  };

  const checks = { ...scanChecks, ...ratchetChecks, ...baselineParseChecks };
  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      `✔ self-test: scanner read ${scanned} file(s); reports every raw form-control shape ` +
        `(${dirtyCases.length} cases), stays silent on ${cleanCases.length} legitimate/decoy ` +
        'shapes, flags growth, lets a paid-down pillar through without a baseline edit, and ' +
        'flags a baseline this change raised above the tree — including when the base commit ' +
        'cannot be read at all.'
    );
  } else {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    for (const [label, passed] of Object.entries(checks)) {
      console.error(`  ${passed ? 'OK' : 'XX'}  ${label}`);
    }
    process.exit(1);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  if (mode === '--write') {
    runWrite();
    return;
  }
  if (mode === '--self-test') {
    runSelfTest();
    return;
  }
  if (mode !== undefined && mode !== '--base') {
    console.error('usage: check-raw-form-controls.mjs [--write|--self-test|--base <commit>]');
    process.exit(2);
  }
  runCheck(argv);
}

if (import.meta.main) {
  main();
}
