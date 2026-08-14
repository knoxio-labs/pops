#!/usr/bin/env node
/**
 * Icon-only-button accessibility guard.
 *
 * libs/ui/README.md "Action Icon Standards": a compact action is icon-only
 * and MUST carry an `aria-label` (not just `title`) — AGENTS.md restates the
 * same rule under "Component library". Nothing enforced it; a `size="icon"`
 * `Button`/`ButtonPrimitive` with no `aria-label` renders as an unlabelled
 * control to a screen reader, and the miss is easy to make since the button
 * still looks right sighted.
 *
 * This guard reads frontend source and reports any `Button` or
 * `ButtonPrimitive` JSX element whose `size` prop is an icon size
 * (`icon`, `icon-xs`, `icon-sm`, `icon-lg`) and whose opening tag carries no
 * `aria-label` attribute. A `size` value that isn't a string literal (a
 * variable, a ternary) is not statically decidable and is skipped rather than
 * guessed at — false negatives here are safer than false positives on a
 * required check.
 *
 * Usage:
 *   node scripts/ci/check-icon-only-buttons.mjs              check the real tree
 *   node scripts/ci/check-icon-only-buttons.mjs --self-test  prove the guard reports
 *
 * Exit 0 when every icon-only Button/ButtonPrimitive carries an aria-label;
 * non-zero on any violation, a failed self-test, or a discovery result too
 * small to be believable.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** JSX component names this guard treats as icon-capable buttons. */
const BUTTON_COMPONENTS = ['Button', 'ButtonPrimitive'];

/** Roots scanned: every frontend source tree in the workspace. */
const SCAN_ROOTS = ['pillars', 'libs'];

/** Directory names never walked. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'storybook-static']);

/** Files whose buttons are fixture content, not shipped UI. */
const EXEMPT_FILE_RE = /\.stories\.tsx?$|\.test\.tsx?$|\.spec\.tsx?$/;

/** Path fragments exempt wholesale, as POSIX-ish substrings. */
const EXEMPT_PATH_FRAGMENTS = ['/__tests__/', '/__mocks__/', '/.storybook/', '/e2e/'];

/** Generated client trees: `src/<pillar>-api/…`. */
const GENERATED_CLIENT_RE = /\/src\/[a-z-]+-api\//;

/** An icon-only `size` value: `icon`, `icon-xs`, `icon-sm`, `icon-lg`. */
const ICON_SIZE_RE = /^icon(?:-(?:xs|sm|lg))?$/;

/**
 * @typedef {object} Violation
 * @property {string} file    Repo-relative path.
 * @property {number} line    1-indexed line the opening tag starts on.
 * @property {string} component `Button` or `ButtonPrimitive`.
 * @property {string} size    The icon size value found.
 */

/**
 * Should this path be scanned at all? Takes a repo-relative POSIX-style path.
 *
 * @param {string} relPath
 * @returns {boolean}
 */
export function isScannable(relPath) {
  const path = `/${relPath}`;
  if (!/\.tsx$/.test(relPath)) return false;
  if (EXEMPT_FILE_RE.test(relPath)) return false;
  if (GENERATED_CLIENT_RE.test(path)) return false;
  return !EXEMPT_PATH_FRAGMENTS.some((fragment) => path.includes(fragment));
}

/**
 * Extract one JSX opening tag starting at `start` (the index of `<`). Tracks
 * `{}` depth and quote state so a `>` inside an attribute expression (a
 * generic, a comparison, an arrow function) does not end the tag early. Ends
 * at the first `>` seen at brace depth 0 outside a string/template literal.
 *
 * @param {string} source
 * @param {number} start
 * @returns {string} the opening tag, including its `<` and terminating `>`.
 */
function extractOpeningTag(source, start) {
  let depth = 0;
  /** @type {"'" | '"' | '`' | null} */
  let quote = null;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
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
 * Pure core: find every icon-only Button/ButtonPrimitive missing an
 * `aria-label` in one file's source. No I/O, so the self-test and unit tests
 * drive it over synthetic strings.
 *
 * @param {string} relPath
 * @param {string} source
 * @returns {Violation[]}
 */
export function findViolations(relPath, source) {
  /** @type {Violation[]} */
  const violations = [];
  const tagStartRe = new RegExp(`<(${BUTTON_COMPONENTS.join('|')})\\b`, 'g');
  for (const match of source.matchAll(tagStartRe)) {
    const tag = extractOpeningTag(source, match.index);
    const sizeMatch = /\bsize\s*=\s*["']([\w-]+)["']/.exec(tag);
    if (!sizeMatch || !ICON_SIZE_RE.test(sizeMatch[1])) continue;
    if (/\baria-label\s*=/.test(tag)) continue;
    violations.push({
      file: relPath,
      line: source.slice(0, match.index).split('\n').length,
      component: match[1],
      size: sizeMatch[1],
    });
  }
  return violations;
}

/**
 * Every scannable file under the scan roots, repo-relative and POSIX-style.
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
 * A floor on discovery. A guard that finds nothing reports nothing and exits
 * 0 — this repo has hundreds of `.tsx` frontend source files, so a number
 * near zero means the walk broke, not that the tree is clean.
 */
const MIN_DISCOVERED_FILES = 200;

/**
 * Drive the guard against the real tree.
 *
 * @returns {boolean}
 */
function run() {
  const files = discoverFiles();
  if (files.length < MIN_DISCOVERED_FILES) {
    console.error(
      `Discovery found only ${files.length} scannable .tsx file(s), below the floor of ` +
        `${MIN_DISCOVERED_FILES}. The walk is broken — this is not a clean tree.`
    );
    return false;
  }

  /** @type {Violation[]} */
  const violations = [];
  for (const file of files) {
    violations.push(...findViolations(file, readFileSync(join(repoRoot, file), 'utf8')));
  }

  console.log(`Scanned ${files.length} .tsx file(s) for icon-only buttons.`);
  if (violations.length === 0) {
    console.log('OK — every icon-only Button/ButtonPrimitive carries an aria-label.');
    return true;
  }

  console.error(`FAIL — ${violations.length} icon-only button(s) with no aria-label:`);
  for (const v of violations) {
    console.error(
      `  XX  ${v.file}:${v.line}  <${v.component} size="${v.size}"> with no aria-label`
    );
  }
  console.error(
    '  libs/ui/README.md "Action Icon Standards": a compact (icon-only) action must carry ' +
      'an aria-label, not just a title. Add aria-label="<verb> <object>" to the button.'
  );
  return false;
}

/**
 * Synthetic fixtures proving the guard reports an icon-only Button with no
 * aria-label (default, primitive, and each icon size), stays silent when one
 * is present, stays silent on a non-icon size or a title-only button, and
 * does not desync on a `>` inside an attribute expression.
 *
 * @returns {boolean}
 */
function selfTest() {
  const dirty = [
    '<Button size="icon"><Trash2 /></Button>',
    '<ButtonPrimitive size="icon-sm"><X /></ButtonPrimitive>',
    '<Button size="icon-lg" title="Delete"><Trash2 /></Button>',
    '<Button\n  size="icon-xs"\n  onClick={() => setOpen(x > y)}\n>\n  <Pencil />\n</Button>',
  ].join('\n');
  const clean = [
    '<Button size="icon" aria-label="Delete item"><Trash2 /></Button>',
    '<ButtonPrimitive size="icon-sm" aria-label="Close"><X /></ButtonPrimitive>',
    '<Button>Add Item</Button>',
    '<Button size="sm">Save</Button>',
    '<Button size={dynamicSize}><Trash2 /></Button>',
  ].join('\n');

  const dirtyHits = findViolations('pillars/x/app/src/A.tsx', dirty);
  const cleanHits = findViolations('pillars/x/app/src/B.tsx', clean);

  const checks = {
    'reports a default-composite icon size': dirtyHits.some(
      (v) => v.component === 'Button' && v.size === 'icon'
    ),
    'reports a primitive icon size': dirtyHits.some(
      (v) => v.component === 'ButtonPrimitive' && v.size === 'icon-sm'
    ),
    'reports title-only as still missing aria-label': dirtyHits.some((v) => v.size === 'icon-lg'),
    'does not desync on a `>` inside an attribute expression': dirtyHits.some(
      (v) => v.size === 'icon-xs'
    ),
    'reports every dirty line, not just the first':
      new Set(dirtyHits.map((v) => v.line)).size === 4,
    'an icon button WITH aria-label is not a violation': !cleanHits.some(
      (v) => v.size === 'icon' && v.component === 'Button'
    ),
    'a primitive icon button WITH aria-label is not a violation': !cleanHits.some(
      (v) => v.component === 'ButtonPrimitive'
    ),
    'a prominent icon+text button is not a violation': cleanHits.every((v) => v.size !== undefined),
    'a non-icon size is not a violation': !cleanHits.some((v) => v.size === 'sm'),
    'a dynamic size expression is not guessed at': !cleanHits.some((v) => v.size === 'dynamicSize'),
    'a .tsx under an app src is scannable': isScannable('pillars/food/app/src/pages/X.tsx'),
    'a story is exempt': !isScannable('libs/ui/src/primitives/Badge.stories.tsx'),
    'a test is exempt': !isScannable('pillars/food/app/src/pages/X.test.tsx'),
    'a __tests__ file is exempt': !isScannable('libs/ui/src/__tests__/x.tsx'),
    'a generated client is exempt': !isScannable('pillars/food/app/src/lists-api/types.gen.tsx'),
    'a non-tsx file is not scanned': !isScannable('pillars/food/app/src/pages/X.ts'),
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      'self-test OK — guard reports icon-only Button/ButtonPrimitive elements missing ' +
        'aria-label across every icon size, and honours its exemptions.'
    );
  } else {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
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
      'Usage: node scripts/ci/check-icon-only-buttons.mjs [--self-test]\n' +
        'Asserts every icon-only Button/ButtonPrimitive (size="icon"/"icon-xs"/"icon-sm"/\n' +
        '"icon-lg") carries an aria-label.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  process.exit(run() ? 0 : 1);
}

if (import.meta.main) {
  main();
}
