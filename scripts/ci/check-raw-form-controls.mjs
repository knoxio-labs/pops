#!/usr/bin/env node
/**
 * Raw-form-control gate (POPS-3187, closed out by POPS-3276; epic POPS-3168
 * "every form control is a kit component").
 *
 * Nothing enforced the convention that pillar UI composes `@pops/ui` form
 * primitives instead of the raw DOM elements they wrap. Two artifacts already
 * in this repo are the evidence: `lists`' `ShoppingSortDropdown` carried a
 * comment justifying a raw `<select>` on a belief about the kit that was
 * never true, and a second `ListKindChip` grew from a policy whose source
 * file had since been deleted. Convention alone did not hold it.
 *
 * This gate reads pillar frontend source for a raw `<select>`, `<input>`, or
 * `<textarea>` JSX element and holds EVERY PILLAR AT ZERO, except for the
 * paths named in `ALLOWLIST` below.
 *
 * Why by name rather than by count. POPS-3187 shipped this as a per-pillar
 * count ratcheted against `.raw-form-control-baseline.json`, which was the
 * right shape while the number was 90, then 54, and obviously in flux. It is
 * the wrong shape for an end state, because a number cannot say WHICH
 * controls are allowed: a pillar sitting exactly on its floor could delete an
 * allowlisted control and add a brand-new raw one somewhere else and still
 * match, since the two net to zero. POPS-3260 audited all 54 remaining
 * controls — 47 migrated onto kit components that already existed, 1 needed a
 * kit colour input (POPS-3275), and 6 are genuine exceptions — so the count
 * stopped being a work-in-progress figure and became a resting state. The
 * hole was tolerable in the first role and not in the second.
 *
 * Three ways to fail, all stated over paths: a raw control at a path nobody
 * justified, an allowlisted path holding MORE controls than it declares, and
 * an allowlisted path holding FEWER — a stale exemption, which fails for the
 * same reason POPS-3187 refused a hand-inflated baseline. An exemption nobody
 * needs any more is a licence sitting in the tree waiting to be spent.
 *
 * This also removes the reason POPS-3236 existed. That ticket made the
 * baseline an upper bound so that six concurrent migration PRs would stop
 * conflicting pairwise on the same one-line JSON file, and closed the
 * resulting inflation hole from the diff via `--base`. With no counts left,
 * there is no shared file for migrations to conflict on and nothing to
 * inflate, so `--base`, `--write` and the baseline file are all gone. The CI
 * job no longer needs `fetch-depth: 0` either.
 *
 * Scope: `pillars/**` only — `libs/ui/src/**` is the kit itself, which
 * legitimately wraps these native elements, and a guard that fired on the
 * library implementing the invariant would get itself disabled (POPS-3168).
 * `libs` is not in `SCAN_ROOTS` at all, so no exemption entry is needed to
 * keep it out.
 *
 * The reasoning behind the invariant — why a local workaround is ruled out
 * rather than tolerated, the kit extensions this epic produced as worked
 * examples, and the justification for each allowlisted path — is recorded in
 * docs/architecture/adr-051-form-controls-from-the-kit.md, not here. This
 * file only enforces the mechanical shape, and its ALLOWLIST must agree with
 * that ADR's "Deliberate exceptions" table.
 *
 * Known legitimate exception, unrelated to the allowlist: a native
 * `<input type="file">`. A file picker has no non-native form — `@pops/ui`'s
 * own `FileUpload` wraps one for the same reason — so a statically-literal
 * `type="file"` is never counted, in any pillar. Every other raw control,
 * including a *dynamic* `type` on `<input>` (this guard cannot prove it
 * resolves to `"file"`, and ADR-045 says an unresolved shape is a violation,
 * not a pass), counts.
 *
 * Usage:
 *   node scripts/ci/check-raw-form-controls.mjs              check the real tree
 *   node scripts/ci/check-raw-form-controls.mjs --self-test  prove the gate reports
 *
 * Exit 0 = the tree matches the allowlist exactly. Exit 1 = an unexpected,
 * grown or stale path, or a self-test failure. Exit 2 = usage error.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * @typedef {object} Exemption
 * @property {string} path Repo-relative path, exactly as the scanner reports it.
 * @property {number} controls How many raw controls this file is allowed to hold.
 * @property {string} ticket The ticket that argued the case.
 * @property {string} reason Why the kit component does not fit HERE.
 */

/**
 * The complete set of raw form controls allowed to exist in `pillars/**`.
 * Every pillar is otherwise held at zero; there is no per-pillar arithmetic
 * anywhere in this gate.
 *
 * Each row must agree with a row in ADR-051's "Deliberate exceptions" table.
 * Adding one is the last resort, after extending the kit has been ruled out
 * — POPS-3275 added `ColourInput` rather than take a row here.
 *
 * @type {readonly Exemption[]}
 */
export const ALLOWLIST = [
  {
    path: 'pillars/design/src/comments/Composer.tsx',
    controls: 1,
    ticket: 'POPS-3260',
    reason:
      'Review overlay chrome, not product UI. Kit styling would make the commenting ' +
      'furniture read as part of the design being reviewed.',
  },
  {
    path: 'pillars/design/src/comments/Thread.tsx',
    controls: 2,
    ticket: 'POPS-3260',
    reason: 'Same overlay as Composer.tsx — a reply field and a status select.',
  },
  {
    path: 'pillars/design/src/screens/finance/import-tag-rule-dialog.tsx',
    controls: 1,
    ticket: 'POPS-3260',
    reason: 'A `disabled` static mockup of a screen, not a working control.',
  },
  {
    path: 'pillars/food/app/src/pages/plan/SlotRow.tsx',
    controls: 1,
    ticket: 'POPS-3260',
    reason:
      "A ~28px plan slot row. The kit TextInput's smallest container is h-9 (36px) and " +
      'would grow the row.',
  },
  {
    path: 'pillars/inventory/app/src/pages/location-tree-page/sections/location-node/InlineInput.tsx',
    controls: 1,
    ticket: 'POPS-3201',
    reason:
      'A compact tree row (px-0.5 py-0, ~20px line height). Same h-9 constraint as ' +
      'SlotRow, measured rather than assumed.',
  },
];

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
 * Scan the real tree. Returns every violation and the file count the scan is
 * derived from — no per-pillar totals, because a total is exactly the shape
 * POPS-3276 removed: it cannot say WHICH controls are allowed.
 *
 * @returns {{ scanned: number, violations: Violation[] }}
 */
export function scanRawFormControls() {
  const files = discoverFiles();
  /** @type {Violation[]} */
  const violations = [];
  for (const file of files) {
    violations.push(...findViolations(file, readFileSync(join(repoRoot, file), 'utf8')));
  }
  return { scanned: files.length, violations };
}

/**
 * @typedef {object} Finding
 * @property {'unexpected' | 'grew' | 'stale'} kind
 * @property {string} path
 * @property {number} allowed
 * @property {number} now
 */

/**
 * Compare the scanned violations against ALLOWLIST.
 *
 * Three ways to fail, and the first is the one a per-pillar count could not
 * see at all:
 *
 * - `unexpected` — a raw control at a path nobody justified. Under the count
 *   baseline this was invisible whenever the same pillar had simultaneously
 *   paid one down: the two netted to zero and the pillar matched its number
 *   exactly.
 * - `grew` — an allowlisted file that now holds MORE raw controls than its
 *   entry claims. The exemption is for the controls that were argued for,
 *   not for the file forever.
 * - `stale` — an allowlisted file that holds FEWER (usually zero, because it
 *   was migrated or deleted). Same reasoning POPS-3187 applied to a
 *   hand-inflated baseline: an exemption nobody needs any more is a licence
 *   sitting in the tree waiting to be spent, and it rots exactly the way
 *   `ListKindChip`'s justifying comment did once its source was deleted.
 *
 * @param {Violation[]} violations
 * @returns {Finding[]}
 */
export function checkAllowlist(violations) {
  /** @type {Map<string, number>} */
  const actual = new Map();
  for (const v of violations) actual.set(v.file, (actual.get(v.file) ?? 0) + 1);

  /** @type {Finding[]} */
  const findings = [];

  for (const entry of ALLOWLIST) {
    const now = actual.get(entry.path) ?? 0;
    if (now > entry.controls) {
      findings.push({ kind: 'grew', path: entry.path, allowed: entry.controls, now });
    } else if (now < entry.controls) {
      findings.push({ kind: 'stale', path: entry.path, allowed: entry.controls, now });
    }
  }

  const allowed = new Set(ALLOWLIST.map((e) => e.path));
  for (const [path, now] of actual) {
    if (!allowed.has(path)) findings.push({ kind: 'unexpected', path, allowed: 0, now });
  }

  return findings.toSorted((a, b) => a.path.localeCompare(b.path));
}

function runCheck() {
  const { scanned, violations } = scanRawFormControls();

  // A gate that reads no files has stopped looking, not been satisfied
  // (ADR-045). Without this floor an allowlist of six would read as six
  // stale entries — which fails, but for the wrong reason and with a
  // message that would send the reader to the wrong place.
  if (scanned < MIN_DISCOVERED_FILES) {
    console.error(
      `✗ raw-form-control gate: the scanner read only ${scanned} file(s), below the floor of ` +
        `${MIN_DISCOVERED_FILES}. Check SCAN_ROOTS and isScannable — the allowlist is not the ` +
        'problem.'
    );
    process.exit(1);
  }

  const findings = checkAllowlist(violations);

  if (findings.length === 0) {
    console.log(
      `✔ raw-form-control gate: every pillar at zero raw form controls except the ` +
        `${ALLOWLIST.length} allowlisted path(s), each holding exactly what it declares ` +
        `(${scanned} file(s) scanned).`
    );
    return;
  }

  console.error(`✗ raw-form-control gate: ${findings.length} problem(s):\n`);
  for (const f of findings) {
    if (f.kind === 'unexpected') {
      console.error(
        `    ${f.path}: ${f.now} raw form control(s) at a path that is not allowlisted`
      );
    } else if (f.kind === 'grew') {
      console.error(
        `    ${f.path}: allowlisted for ${f.allowed}, now holds ${f.now} — the exemption covers ` +
          'the controls that were argued for, not the file'
      );
    } else {
      console.error(
        `    ${f.path}: allowlisted for ${f.allowed}, now holds ${f.now} — the exemption is ` +
          'STALE. Delete the entry (and its row in ADR-051) in this same change'
      );
    }
  }
  console.error(
    '\n  Every pillar is held at ZERO raw <select>, <input> (other than a literal type="file"),\n' +
      '  or <textarea>. Use the @pops/ui kit primitive. If a control genuinely cannot come from\n' +
      '  the kit, the answer is normally to EXTEND the kit — POPS-3275 added ColourInput for\n' +
      '  exactly that reason. Adding a row to ALLOWLIST is the last resort, and it needs a\n' +
      "  ticket arguing the case and a matching row in the ADR's Deliberate exceptions table.\n" +
      '\n  docs/architecture/adr-051-form-controls-from-the-kit.md'
  );
  process.exit(1);
}

/**
 * Prove the gate reports. Per ADR-045 and POPS-2110 — seven POPS guards were
 * found holed in one week, every one of them passing its own self-test — the
 * cases below assert the guard FLAGS a planted problem, not merely that a
 * clean tree exits 0.
 *
 * The first allowlist case is the reason this ticket exists: under the
 * per-pillar count baseline POPS-3276 replaced, removing an allowlisted
 * control and adding a raw one elsewhere in the same pillar netted to zero
 * and passed. It must now fail.
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
    // The whole point of SCAN_ROOTS being ['pillars']: nothing under libs/ is
    // ever discovered, so no exemption entry can accidentally be dropped.
    'libs/ui is never a scannable pillar path':
      pillarOf('libs/ui/src/components/Select.tsx') === null,
    "a pillar path resolves to its pillar's id":
      pillarOf('pillars/lists/app/src/X.tsx') === 'lists',
  };

  const only = ALLOWLIST[0];
  if (only === undefined) {
    console.error('✗ self-test: ALLOWLIST is empty — nothing to prove the by-name rule against.');
    process.exit(1);
  }
  /** @param {string} file @param {number} n @returns {Violation[]} */
  const raws = (file, n) =>
    Array.from({ length: n }, (_, i) => ({ file, line: i + 1, tag: 'input' }));

  const allowlistChecks = {
    // THE case the per-pillar count baseline could not catch (POPS-3276): an
    // allowlisted control removed AND a new raw control added elsewhere in
    // the same pillar. The old rule netted these to zero and passed.
    'an allowlisted control removed while a new raw one appears elsewhere is flagged twice':
      (() => {
        const f = checkAllowlist(raws('pillars/design/src/screens/Other.tsx', 1));
        return (
          f.some((x) => x.kind === 'unexpected' && x.path.endsWith('Other.tsx')) &&
          f.some((x) => x.kind === 'stale' && x.path === only.path)
        );
      })(),
    'a raw control at a non-exempt path is flagged': checkAllowlist([
      ...ALLOWLIST.flatMap((e) => raws(e.path, e.controls)),
      ...raws('pillars/food/app/src/pages/New.tsx', 1),
    ]).some((f) => f.kind === 'unexpected' && f.path.endsWith('New.tsx')),
    'a raw control at a non-exempt path is flagged in EVERY pillar, not just one': [
      'pillars/lists/app/src/A.tsx',
      'pillars/finance/app/src/B.tsx',
      'pillars/cerebrum/app/src/C.tsx',
      'pillars/inventory/app/src/D.tsx',
      'pillars/media/app/src/E.tsx',
    ].every((p) =>
      checkAllowlist([...ALLOWLIST.flatMap((e) => raws(e.path, e.controls)), ...raws(p, 1)]).some(
        (f) => f.kind === 'unexpected' && f.path === p
      )
    ),
    'the exact declared allowlist passes':
      checkAllowlist(ALLOWLIST.flatMap((e) => raws(e.path, e.controls))).length === 0,
    'an allowlisted path that grew beyond its declared count is flagged': checkAllowlist([
      ...ALLOWLIST.flatMap((e) => raws(e.path, e.controls)),
      ...raws(only.path, 1),
    ]).some((f) => f.kind === 'grew' && f.path === only.path),
    'an allowlisted path with no raw control left is flagged as stale': checkAllowlist(
      ALLOWLIST.filter((e) => e.path !== only.path).flatMap((e) => raws(e.path, e.controls))
    ).some((f) => f.kind === 'stale' && f.path === only.path && f.now === 0),
    // The file exemption is unrelated to the allowlist and must survive it.
    'a type="file" input still passes at a non-allowlisted path':
      findViolations('pillars/food/app/src/pages/New.tsx', '<input type="file" onChange={f} />')
        .length === 0,
    // The allowlist describes reality, not aspiration: every declared path
    // must exist, or the entry is unfalsifiable.
    'every allowlisted path exists on disk': ALLOWLIST.every((e) =>
      existsSync(join(repoRoot, e.path))
    ),
    'every allowlist entry carries a justifying ticket': ALLOWLIST.every((e) =>
      /^POPS-\d+$/.test(e.ticket)
    ),
    'the real tree matches the allowlist exactly':
      checkAllowlist(scanRawFormControls().violations).length === 0,
  };

  const checks = { ...scanChecks, ...allowlistChecks };
  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      `✔ self-test: scanner read ${scanned} file(s); reports every raw form-control shape ` +
        `(${dirtyCases.length} cases), stays silent on ${cleanCases.length} legitimate/decoy ` +
        `shapes, and holds ${ALLOWLIST.length} allowlisted path(s) to an exact count — flagging ` +
        'an unexpected path in every pillar, a grown entry, and a stale one, including the ' +
        'swap the old per-pillar count could not see.'
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
  if (mode === '--self-test') {
    runSelfTest();
    return;
  }
  if (mode !== undefined) {
    console.error('usage: check-raw-form-controls.mjs [--self-test]');
    process.exit(2);
  }
  runCheck();
}

if (import.meta.main) {
  main();
}
