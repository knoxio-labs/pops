#!/usr/bin/env node
/**
 * Design-token guard for the frontend.
 *
 * AGENTS.md "Styling" says colours reference design tokens and nothing else:
 * `text-destructive`, not `text-red-500`; `bg-app-accent`, not `bg-indigo-600`;
 * no hardcoded hex/rgb/oklch in a component. Nothing enforced that. A cleanup
 * with no ratchet grows back — every raw palette utility that got fixed came
 * back the next time somebody needed "just an amber warning", because the
 * shortest path to a colour is still the palette name and no gate objected.
 *
 * This guard is that gate. It reads frontend source and reports two things:
 *
 *   1. RAW PALETTE UTILITIES — a Tailwind colour utility whose colour is one of
 *      Tailwind's built-in palette names with a numeric shade (`bg-amber-500`,
 *      `dark:text-emerald-400`, `[&>div]:bg-red-600`, `divide-slate-100`). The
 *      utility may carry any variant chain and any opacity modifier; the guard
 *      looks at the colour, not the decoration around it.
 *   2. RAW COLOUR LITERALS IN CLASS STRINGS — an arbitrary value whose content
 *      is a literal colour: `from-[oklch(0.7_0.2_150)]`, `text-[#ff0000]`,
 *      `bg-[rgb(0,0,0)]`. `w-[var(--radix-*)]` and other non-colour arbitrary
 *      values are none of this guard's business and are not reported.
 *
 * What it deliberately does NOT report:
 *   - `.stories.tsx` and test files. Storybook demo content is a showcase of
 *     fixture data rather than shipped UI, and this guard's job is the app.
 *   - Generated API clients (`src/*-api/`), which nobody hand-edits.
 *   - `libs/ui/src/theme/**`, which is where the tokens are DEFINED. A `:root`
 *     declaration is the one place a raw colour belongs.
 *   - Canvas/chart JS colour constants (plain hex in a `.ts` object, no class
 *     string around it). Canvas 2D cannot resolve CSS custom properties at
 *     paint time; `libs/ui/src/theme/graph-colors.ts` exists for exactly that
 *     and is the sanctioned home for those values.
 *
 * Usage:
 *   node scripts/ci/check-design-tokens.mjs              check the real tree
 *   node scripts/ci/check-design-tokens.mjs --self-test  prove the guard reports
 *
 * Exit 0 when every scanned file is token-clean; non-zero on any violation, a
 * failed self-test, or a discovery result too small to be believable.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/**
 * Tailwind's built-in colour palette names. A utility ending in one of these
 * plus a numeric shade is a raw palette reference by construction — the token
 * layer never mints a `-500`.
 */
const PALETTE_HUES = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];

/** Utility prefixes that take a colour. */
const COLOR_PROPERTIES = [
  'bg',
  'text',
  'border',
  'ring',
  'outline',
  'divide',
  'from',
  'via',
  'to',
  'fill',
  'stroke',
  'shadow',
  'accent',
  'caret',
  'decoration',
  'placeholder',
];

/**
 * Zero or more Tailwind variants preceding a utility: `dark:`, `hover:`,
 * `md:dark:`, `[&>div]:`, `group-data-[state=open]:`. Each ends in `:` and
 * abuts the next with no whitespace, which is what separates a real variant
 * chain from an object key that merely happens to end in a colon.
 */
const VARIANT_CHAIN = String.raw`(?:[A-Za-z0-9_\-[\]&>~+*.=#(),/]+:)*`;

/**
 * A raw palette utility anywhere in a line, reported with its variant chain
 * and opacity modifier so the message quotes what the author actually wrote.
 * The leading boundary rejects mid-identifier matches — `--stat-orange-500`
 * is a token name, not a utility.
 */
const PALETTE_UTILITY_RE = new RegExp(
  String.raw`(?<![\w-])${VARIANT_CHAIN}(?:${COLOR_PROPERTIES.join('|')})-(?:${PALETTE_HUES.join('|')})-\d{2,3}(?:\/\d{1,3})?\b`,
  'g'
);

/**
 * An arbitrary value holding a literal colour: `-[#abc]`, `-[oklch(...)]`,
 * `-[rgb(...)]`, `-[hsl(...)]`. Tailwind writes spaces as `_` inside these, so
 * the body is matched loosely and only the leading token decides.
 */
const COLOR_LITERAL_ARBITRARY_RE =
  /-\[(?:#[0-9a-fA-F]{3,8}|(?:ok)?(?:lch|lab)\(|rgba?\(|hsla?\()[^\]]*\]/g;

/** Roots scanned: every frontend source tree in the workspace. */
const SCAN_ROOTS = ['pillars', 'libs'];

/** Directory names never walked. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'storybook-static']);

/** Files whose colours are fixture content or generated, not shipped UI. */
const EXEMPT_FILE_RE = /\.stories\.tsx?$|\.test\.tsx?$|\.spec\.tsx?$/;

/** Path fragments exempt wholesale, as POSIX-ish substrings. */
const EXEMPT_PATH_FRAGMENTS = [
  '/__tests__/',
  '/__mocks__/',
  '/libs/ui/src/theme/',
  '/.storybook/',
  '/e2e/',
];

/** Generated client trees: `src/<pillar>-api/…`. */
const GENERATED_CLIENT_RE = /\/src\/[a-z-]+-api\//;

/**
 * Where a raw hue should usually go. Advisory only — the guard reports the
 * violation either way; this is the sentence that saves the reader a trip to
 * globals.css.
 */
const SUGGESTED_TOKEN = {
  red: 'destructive',
  rose: 'destructive (error) or stat-rose (a distinct category hue)',
  green: 'success',
  emerald: 'success',
  lime: 'success',
  teal: 'success',
  amber: 'warning',
  yellow: 'warning',
  orange: 'stat-orange',
  blue: 'info',
  sky: 'info',
  cyan: 'stat-sky',
  indigo: 'app-accent (per-app) or primary',
  violet: 'stat-violet',
  purple: 'stat-violet',
  fuchsia: 'stat-violet',
  pink: 'stat-rose',
  slate: 'muted / muted-foreground / border',
  gray: 'muted / muted-foreground / border',
  zinc: 'muted / muted-foreground / border',
  neutral: 'muted / muted-foreground / border',
  stone: 'muted / muted-foreground / border',
};

/**
 * @typedef {object} Violation
 * @property {string} file    Repo-relative path.
 * @property {number} line    1-indexed line number.
 * @property {'palette' | 'literal'} kind
 * @property {string} text    The offending utility, verbatim.
 * @property {string} [hint]  Suggested token, for palette violations.
 */

/**
 * Should this path be scanned at all? Takes a repo-relative POSIX-style path.
 *
 * @param {string} relPath
 * @returns {boolean}
 */
export function isScannable(relPath) {
  const path = `/${relPath}`;
  if (!/\.tsx?$|\.css$/.test(relPath)) return false;
  if (EXEMPT_FILE_RE.test(relPath)) return false;
  if (GENERATED_CLIENT_RE.test(path)) return false;
  return !EXEMPT_PATH_FRAGMENTS.some((fragment) => path.includes(fragment));
}

/**
 * Pure core: find every token violation in one file's source. No I/O, so the
 * self-test and the unit tests drive it over synthetic strings.
 *
 * @param {string} relPath
 * @param {string} source
 * @returns {Violation[]}
 */
export function findViolations(relPath, source) {
  /** @type {Violation[]} */
  const violations = [];
  const lines = source.split('\n');
  for (const [index, line] of lines.entries()) {
    for (const match of line.matchAll(PALETTE_UTILITY_RE)) {
      const hue = PALETTE_HUES.find((h) => match[0].includes(`-${h}-`));
      violations.push({
        file: relPath,
        line: index + 1,
        kind: 'palette',
        text: match[0],
        hint: hue === undefined ? undefined : SUGGESTED_TOKEN[hue],
      });
    }
    for (const match of line.matchAll(COLOR_LITERAL_ARBITRARY_RE)) {
      violations.push({ file: relPath, line: index + 1, kind: 'literal', text: match[0] });
    }
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
 * 0, which is the shape ADR-045 exists to end: this repo has hundreds of
 * frontend source files, so a number near zero means the walk broke, not that
 * the tree got clean.
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
      `Discovery found only ${files.length} scannable frontend file(s), below the floor of ` +
        `${MIN_DISCOVERED_FILES}. The walk is broken — this is not a clean tree.`
    );
    return false;
  }

  /** @type {Violation[]} */
  const violations = [];
  for (const file of files) {
    violations.push(...findViolations(file, readFileSync(join(repoRoot, file), 'utf8')));
  }

  console.log(`Scanned ${files.length} frontend source file(s) for raw colours.`);
  if (violations.length === 0) {
    console.log('OK — every colour in frontend source comes from a design token.');
    return true;
  }

  console.error(`FAIL — ${violations.length} raw colour(s) outside the token layer:`);
  for (const v of violations) {
    const suffix = v.kind === 'palette' && v.hint ? `  → use a \`${v.hint}\` token` : '';
    console.error(`  XX  ${v.file}:${v.line}  ${v.text}${suffix}`);
  }
  console.error(
    '  AGENTS.md "Styling": Tailwind only, design tokens only, no hardcoded hex/rgb/oklch. ' +
      'Map the colour onto a semantic token (destructive/success/warning/info), a stat-* ' +
      'category token, or app-accent. If none fits, add a token to @theme in ' +
      'libs/ui/src/theme/globals.css rather than reaching for the palette.'
  );
  return false;
}

/**
 * Synthetic fixtures proving the guard reports a raw palette utility (bare,
 * under a variant, with an opacity modifier, inside an arbitrary variant), a
 * literal colour in an arbitrary value, and the exemptions — and that it stays
 * silent on token-only source.
 *
 * @returns {boolean}
 */
function selfTest() {
  const dirty = [
    '<div className="bg-amber-500" />',
    '<div className="dark:text-emerald-400 border-rose-500/20" />',
    '<div className="[&>div]:bg-red-600" />',
    '<h1 className="from-[oklch(0.7_0.2_150)] to-[#ff0000]" />',
  ].join('\n');
  const clean = [
    '<div className="bg-warning text-warning-foreground" />',
    '<div className="dark:text-success/80 border-destructive/20" />',
    '<div className="w-[var(--radix-popover-trigger-width)] min-h-[44px]" />',
    'const token = "--stat-orange-foreground";',
  ].join('\n');

  const dirtyHits = findViolations('pillars/x/app/src/A.tsx', dirty);
  const cleanHits = findViolations('pillars/x/app/src/B.tsx', clean);
  const lines = new Set(dirtyHits.map((v) => v.line));

  const checks = {
    'reports a bare palette utility': dirtyHits.some((v) => v.text === 'bg-amber-500'),
    'reports one under a dark: variant': dirtyHits.some((v) => v.text === 'dark:text-emerald-400'),
    'reports one carrying an opacity modifier': dirtyHits.some(
      (v) => v.text === 'border-rose-500/20'
    ),
    'reports one inside an arbitrary variant': dirtyHits.some(
      (v) => v.text === '[&>div]:bg-red-600'
    ),
    'reports an oklch arbitrary value': dirtyHits.some((v) => v.text.includes('oklch(')),
    'reports a hex arbitrary value': dirtyHits.some((v) => v.text.includes('#ff0000')),
    'reports every dirty line, not just the first': lines.size === 4,
    'attaches a token suggestion to a palette hit':
      dirtyHits.find((v) => v.text === 'bg-amber-500')?.hint === 'warning',
    'stays silent on token-only source': cleanHits.length === 0,
    'a non-colour arbitrary value is not a violation': !cleanHits.some((v) =>
      v.text.includes('radix')
    ),
    'a token name containing a hue word is not a violation': !cleanHits.some((v) =>
      v.text.includes('stat-orange')
    ),
    'a .tsx under an app src is scannable': isScannable('pillars/food/app/src/pages/X.tsx'),
    'globals.css is scannable': isScannable('pillars/shell/src/index.css'),
    'a story is exempt': !isScannable('libs/ui/src/primitives/Badge.stories.tsx'),
    'a test is exempt': !isScannable('pillars/food/app/src/pages/X.test.tsx'),
    'a __tests__ file is exempt': !isScannable('libs/ui/src/__tests__/x.ts'),
    'the theme dir is exempt': !isScannable('libs/ui/src/theme/globals.css'),
    'a generated client is exempt': !isScannable('pillars/food/app/src/lists-api/types.gen.ts'),
    'a non-source file is not scanned': !isScannable('pillars/food/README.md'),
  };

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      'self-test OK — guard reports raw palette utilities under any variant, literal ' +
        'colours in arbitrary values, and honours its exemptions.'
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
      'Usage: node scripts/ci/check-design-tokens.mjs [--self-test]\n' +
        'Asserts frontend source references colours through design tokens only — no raw\n' +
        'Tailwind palette utilities and no hex/rgb/oklch literals in class strings.'
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
