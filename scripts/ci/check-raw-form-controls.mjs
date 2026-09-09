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
 * Unlike that gate, this one holds the baseline to the count EXACTLY, not as
 * an upper bound: a pillar whose real count has fallen below its baseline
 * fails too, not just one that has grown past it. A ratchet that only checks
 * `now <= was` cannot tell "somebody paid down three violations and forgot
 * to run `--write`" apart from "somebody hand-edited the baseline file to
 * a number nobody re-derived" — both leave the committed number wrong, and
 * the second is exactly how a ratchet gets silently loosened. Requiring
 * equality collapses the distinction: whichever caused it, the fix is the
 * same `--write`, run after the count it locks in is genuinely correct.
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
 * Known legitimate exception: a native `<input type="file">`. A file picker
 * has no non-native form — `@pops/ui`'s own `FileUpload` (libs/ui) wraps one
 * for the same reason — so a statically-literal `type="file"` is never
 * counted, in any pillar. Every other raw control, including a *dynamic*
 * `type` on `<input>` (this guard cannot prove it resolves to `"file"`, and
 * ADR-045 says an unresolved shape is a violation, not a pass), counts.
 *
 * Usage:
 *   node scripts/ci/check-raw-form-controls.mjs              check the real tree
 *   node scripts/ci/check-raw-form-controls.mjs --write       regenerate the baseline
 *   node scripts/ci/check-raw-form-controls.mjs --self-test   prove the gate reports
 *
 * Exit 0 = every pillar's count matches its baseline exactly. Exit 1 = a
 * mismatch (growth, or a stale/inflated baseline) or a self-test failure.
 * Exit 2 = usage error.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const BASELINE_PATH = join(repoRoot, '.raw-form-control-baseline.json');

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
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (e) {
    console.error(
      `✗ raw-form-control gate: baseline is not valid JSON (${e instanceof Error ? e.message : String(e)})`
    );
    process.exit(2);
  }
}

/**
 * @typedef {object} Mismatch
 * @property {string} pillar
 * @property {number} was
 * @property {number} now
 * @property {'grew' | 'stale'} kind `grew`: now exceeds baseline — a new
 *   violation. `stale`: baseline exceeds now — either an un-recorded
 *   improvement or an inflated baseline; both need `--write`.
 */

/**
 * Compare current per-pillar counts against a baseline. The baseline is held
 * to equality, not just an upper bound — see the file header for why a
 * ratchet that only rejects growth cannot catch a baseline hand-inflated
 * above the real count.
 *
 * @param {Record<string, number>} current
 * @param {Record<string, number>} baseline
 * @returns {Mismatch[]}
 */
export function diffAgainstBaseline(current, baseline) {
  /** @type {Mismatch[]} */
  const mismatches = [];
  const pillars = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  for (const pillar of pillars) {
    const now = current[pillar] ?? 0;
    const was = baseline[pillar] ?? 0;
    if (now > was) mismatches.push({ pillar, was, now, kind: 'grew' });
    else if (now < was) mismatches.push({ pillar, was, now, kind: 'stale' });
  }
  return mismatches.toSorted((a, b) => a.pillar.localeCompare(b.pillar));
}

function runCheck() {
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
  const mismatches = diffAgainstBaseline(counts, baseline);

  if (mismatches.length === 0) {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(
      `✔ raw-form-control gate: ${total} raw form control(s) across ${Object.keys(counts).length} ` +
        `pillar(s), matching the committed baseline exactly (${scanned} file(s) scanned).`
    );
    return;
  }

  console.error(`✗ raw-form-control gate: ${mismatches.length} pillar(s) out of sync:\n`);
  for (const m of mismatches) {
    if (m.kind === 'grew') {
      console.error(`    ${m.pillar}: baseline ${m.was} → now ${m.now} — NEW raw form control(s)`);
    } else {
      console.error(
        `    ${m.pillar}: baseline ${m.was} → now ${m.now} — baseline is stale (higher than ` +
          'reality); either it was hand-edited above the real count, or a migration paid down ' +
          'violations here without locking the win in'
      );
    }
  }
  console.error(
    '\n  No raw <select>, <input> (other than a literal type="file"), or <textarea> may be\n' +
      '  added to pillar UI — use the @pops/ui kit primitive instead. If this pillar\n' +
      '  genuinely changed (a migration ticket paid violations down, or you added one you\n' +
      '  should not have), run `pnpm check:raw-form-controls:baseline` and, for growth,\n' +
      '  justify it in review — growth should not happen at all outside a scoped exception.\n' +
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
 * baseline hand-inflated above reality — and that it still stays quiet on an
 * exempt file, a `type="file"` input, and text that merely mentions a tag in
 * a comment. Per ADR-045/POPS-2110, this exercises the REPORTING path, not
 * only the passing one: every positive case below asserts the guard actually
 * flags the planted violation, not merely that a clean run exits 0.
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
    // This is the case POPS-3187 explicitly calls out: a baseline hand-set
    // above the real count must fail, not silently read as "shrank".
    'a baseline inflated above the real count is flagged as stale': diffAgainstBaseline(
      { demo: 2 },
      { demo: 100 }
    ).some((m) => m.pillar === 'demo' && m.kind === 'stale' && m.was === 100 && m.now === 2),
    'a genuinely paid-down pillar not yet re-baselined is flagged as stale, not silently passed':
      diffAgainstBaseline({ demo: 0 }, { demo: 5 }).some(
        (m) => m.pillar === 'demo' && m.kind === 'stale'
      ),
    'an exact match across several pillars is clean':
      diffAgainstBaseline({ alpha: 3, beta: 0 }, { alpha: 3, beta: 0 }).length === 0,
    'a pillar absent from both current and baseline is not a phantom mismatch':
      diffAgainstBaseline({ alpha: 1 }, { alpha: 1, gamma: 0 }).length === 0,
  };

  const checks = { ...scanChecks, ...ratchetChecks };
  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      `✔ self-test: scanner read ${scanned} file(s); reports every raw form-control shape ` +
        `(${dirtyCases.length} cases), stays silent on ${cleanCases.length} legitimate/decoy ` +
        'shapes, and the per-pillar ratchet flags growth, an un-baselined improvement, and a ' +
        'hand-inflated baseline alike.'
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
  const mode = process.argv[2];
  if (mode !== '--write' && mode !== '--self-test' && mode !== undefined) {
    console.error('usage: check-raw-form-controls.mjs [--write|--self-test]');
    process.exit(2);
  }
  if (mode === '--write') runWrite();
  else if (mode === '--self-test') runSelfTest();
  else runCheck();
}

if (import.meta.main) {
  main();
}
