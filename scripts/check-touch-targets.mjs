#!/usr/bin/env node
/**
 * Touch-target ratchet for consumer-side interactive elements.
 *
 * The primitive system (Button, Checkbox, RadioGroupItem, Switch, TabsTrigger,
 * Dialog close, PageHeader back button) enforces the WCAG 2.5.5 / platform HIG
 * 44x44px minimum tap target for every component it wraps. It does NOT reach
 * a raw `<button>` or `<a>` written directly in a pillar app or the shell —
 * and there are, at the time this gate was written, well over a hundred of
 * those outside the primitive system. Fixing all of them is real work tracked
 * in Huly, not a one-time pass this script can do for you.
 *
 * What this script CAN do is stop the count from growing, exactly like the
 * escape-hatch ratchet (scripts/check-escape-hatches.mjs): a committed
 * baseline records today's count of raw `<button>`/`<a>` elements per file
 * that this scanner cannot prove meet the 44px minimum, and a PR may only
 * ever hold that number flat or shrink it. A brand-new raw element with no
 * touch-target sizing evidence fails here; so does deleting the sizing
 * classes off one that used to carry them (its file's count grows by one).
 *
 * DETECTION IS A HEURISTIC, not a JSX parser. For each `<button` / `<a`
 * opening tag, the scanner reads a bounded window of source starting at that
 * line and looks for evidence the tappable area reaches 44px: a Tailwind
 * sizing utility (`h-`/`w-`/`size-`/`min-h-`/`min-w-`) at spacing-scale step
 * 11 or higher (11 * 4px = 44px), the same properties carrying an arbitrary
 * pixel value >= 44px, or the `before:-inset-*` invisible-hit-area pattern
 * the primitives already use.
 * Classes built up through a variable (`cn(baseClasses)`) are invisible to a
 * text scan and are reported as violations — false positives lean toward
 * "flag it", which a baseline absorbs for existing code and a human resolves
 * for new code by either inlining a visible class or using Button.
 *
 * Scope: `pillars/*\/app/src` and `pillars/shell/src` — the consumer surfaces
 * named in the ticket. `libs/ui` is deliberately NOT scanned: that is where
 * the primitives live, Chip's remove button included, and it already carries
 * its own dedicated touch-target tests.
 *
 * Usage:
 *   node scripts/check-touch-targets.mjs              check the real tree
 *   node scripts/check-touch-targets.mjs --write       regenerate the baseline
 *   node scripts/check-touch-targets.mjs --self-test    prove the gate reports
 *
 * Exit 0 = no growth vs baseline. Exit 1 = growth, a failed self-test, or a
 * discovery result too small to be believable. Exit 2 = usage error.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const BASELINE_PATH = join(repoRoot, '.touch-target-baseline.json');

/** Directory names never walked. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'storybook-static']);

/** Files whose markup is fixture content, not shipped UI. */
const EXEMPT_FILE_RE = /\.stories\.tsx?$|\.test\.tsx?$|\.spec\.tsx?$/;

/** Path fragments exempt wholesale, as POSIX-ish substrings. */
const EXEMPT_PATH_FRAGMENTS = ['/__tests__/', '/__mocks__/', '/e2e/'];

/** Generated client trees: `src/<pillar>-api/…` — nobody hand-edits these. */
const GENERATED_CLIENT_RE = /\/src\/[a-z-]+-api\//;

/**
 * A raw native `<button` or `<a` opening tag. The lookahead requires a
 * boundary character next (whitespace, `/`, or `>`), which is what tells
 * `<a` apart from `<article`/`<audio>` and `<button` apart from a component
 * like `<ButtonPrimitive` (case-sensitive: JSX components are PascalCase).
 */
const RAW_ELEMENT_RE = /<(button|a)(?=[\s/>])/g;

/** How many source lines after the opening tag we search for sizing evidence. */
const WINDOW_LINES = 12;

/**
 * Evidence the element's tappable area reaches 44px, on a property that
 * actually sizes the box: `h`, `w`, `size` or their `min-` forms, carrying
 * either a Tailwind spacing-scale step of 11+ (11 * 4px = 44px) or an
 * arbitrary pixel value of 44 or more. Plus the `before:-inset-*` expansion
 * pattern the primitives use for compact controls.
 *
 * The leading `(?<![\w-])` is what keeps the property honest: without it,
 * `max-w-24` reads as `w-24` and a width CAP passes as a size. The trailing
 * `(?![\d/])` rejects the fraction forms (`w-11/12`), which are a proportion
 * of the parent, not 44px. And the arbitrary-value branch is anchored to the
 * same properties, so an unrelated `mt-[80px]` or `top-[44px]` no longer
 * launders a 24px button into compliance.
 */
const COMPLIANT_RE =
  /(?<![\w-])(?:min-)?(?:h|w|size)-(?:(?:1[1-9]|[2-9]\d|\d{3,})(?![\d/])|\[(?:4[4-9]|[5-9]\d|\d{3,})px\])|before:-inset-/;

/**
 * @typedef {object} Violation
 * @property {string} file
 * @property {number} line
 * @property {'button' | 'a'} tag
 */

/**
 * Should this path be scanned at all? Takes a repo-relative POSIX-style path.
 * @param {string} relPath
 * @returns {boolean}
 */
export function isScannable(relPath) {
  const path = `/${relPath}`;
  // JSX can only appear in .tsx — a plain .ts file matching RAW_ELEMENT_RE is
  // always a false positive (a docstring mentioning `<a>`, not a real tag).
  if (!/\.tsx$/.test(relPath)) return false;
  if (EXEMPT_FILE_RE.test(relPath)) return false;
  if (GENERATED_CLIENT_RE.test(path)) return false;
  return !EXEMPT_PATH_FRAGMENTS.some((fragment) => path.includes(fragment));
}

/**
 * Pure core: find every raw `<button>`/`<a>` in one file's source with no
 * touch-target sizing evidence in its opening-tag window.
 * @param {string} relPath
 * @param {string} source
 * @returns {Violation[]}
 */
export function findViolations(relPath, source) {
  /** @type {Violation[]} */
  const violations = [];
  const lines = source.split('\n');

  // Matched against the WHOLE source, not line-by-line: the lookahead in
  // RAW_ELEMENT_RE needs to see the character after `<button`/`<a`, and in
  // this codebase's formatting that is almost always a newline before the
  // first attribute — invisible to a per-line match, present here.
  for (const match of source.matchAll(RAW_ELEMENT_RE)) {
    const index = match.index ?? 0;
    const lineNo = source.slice(0, index).split('\n').length - 1;
    const ownLine = lines[lineNo]?.trim() ?? '';
    // A docstring/comment mentioning `<button>`/`<a>` prose is not a real
    // element — `RecipeStepBody.tsx`-adjacent `.ts` helpers do this often.
    if (ownLine.startsWith('//') || ownLine.startsWith('*') || ownLine.startsWith('/*')) continue;
    const window = lines.slice(lineNo, lineNo + WINDOW_LINES).join('\n');
    if (!COMPLIANT_RE.test(window)) {
      violations.push({
        file: relPath,
        line: lineNo + 1,
        tag: /** @type {'button' | 'a'} */ (match[1]),
      });
    }
  }
  return violations;
}

/**
 * Per-file violation counts for one file's source.
 * @param {string} relPath
 * @param {string} source
 * @returns {Record<string, number>}
 */
function countViolations(relPath, source) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const v of findViolations(relPath, source)) {
    counts[v.tag] = (counts[v.tag] ?? 0) + 1;
  }
  return counts;
}

/** Every pillar app's `src`, plus the shell's, that exists on disk. */
function scanRoots() {
  /** @type {string[]} */
  const roots = [];
  const pillarsDir = join(repoRoot, 'pillars');
  if (!existsSync(pillarsDir)) return roots;
  for (const entry of readdirSync(pillarsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const appSrc = join(pillarsDir, entry.name, 'app', 'src');
    if (existsSync(appSrc) && statSync(appSrc).isDirectory()) roots.push(appSrc);
  }
  const shellSrc = join(pillarsDir, 'shell', 'src');
  if (existsSync(shellSrc) && statSync(shellSrc).isDirectory()) roots.push(shellSrc);
  return roots;
}

/**
 * Every scannable file under the scan roots, repo-relative and POSIX-style.
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
  for (const root of scanRoots()) walk(root);
  return found.toSorted((a, b) => a.localeCompare(b));
}

/**
 * A floor on discovery, proportionate to the ~15 pillar apps + shell this
 * scans. A number near zero means the walk broke, not that the tree got
 * clean of pages entirely.
 */
const MIN_DISCOVERED_FILES = 100;

/**
 * Current per-file, per-kind counts across the real tree.
 * @returns {{ counts: Record<string, Record<string, number>>, scanned: number }}
 */
function scanCurrent() {
  const files = discoverFiles();
  /** @type {Record<string, Record<string, number>>} */
  const counts = {};
  for (const file of files) {
    const c = countViolations(file, readFileSync(join(repoRoot, file), 'utf8'));
    if (Object.keys(c).length > 0) counts[file] = c;
  }
  return { counts: sortDeep(counts), scanned: files.length };
}

/** Stable, diff-friendly ordering for the committed baseline. */
function sortDeep(obj) {
  /** @type {Record<string, Record<string, number>>} */
  const out = {};
  for (const file of Object.keys(obj).toSorted()) {
    /** @type {Record<string, number>} */
    const kinds = {};
    for (const kind of Object.keys(obj[file]).toSorted()) kinds[kind] = obj[file][kind];
    out[file] = kinds;
  }
  return out;
}

/**
 * Compare current counts against a baseline. Returns the list of growths
 * (new files, new kinds, or higher counts). An empty list means clean.
 * @param {Record<string, Record<string, number>>} current
 * @param {Record<string, Record<string, number>>} baseline
 * @returns {Array<{ file: string, kind: string, was: number, now: number }>}
 */
export function diffAgainstBaseline(current, baseline) {
  const growths = [];
  for (const [file, kinds] of Object.entries(current)) {
    for (const [kind, now] of Object.entries(kinds)) {
      const was = baseline[file]?.[kind] ?? 0;
      if (now > was) growths.push({ file, kind, was, now });
    }
  }
  return growths;
}

/** @param {Record<string, Record<string, number>>} counts */
function total(counts) {
  let n = 0;
  for (const kinds of Object.values(counts)) for (const c of Object.values(kinds)) n += c;
  return n;
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) {
    console.error(
      `✗ touch-target gate: baseline ${relative(repoRoot, BASELINE_PATH)} missing. ` +
        'Run `pnpm check:touch-targets:baseline` to create it.'
    );
    process.exit(2);
  }
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch (e) {
    console.error(`✗ touch-target gate: baseline is not valid JSON (${e.message})`);
    process.exit(2);
  }
}

function runCheck() {
  const { counts: current, scanned } = scanCurrent();
  const baseline = loadBaseline();

  if (scanned < MIN_DISCOVERED_FILES) {
    console.error(
      `✗ touch-target gate: the scanner read only ${scanned} file(s), below the floor of ` +
        `${MIN_DISCOVERED_FILES}. The walk is broken — check scanRoots()/isScannable, do NOT ` +
        're-baseline.'
    );
    process.exit(1);
  }

  const growths = diffAgainstBaseline(current, baseline);
  const currentTotal = total(current);
  const baselineTotal = total(baseline);

  if (growths.length > 0) {
    console.error(
      `✗ touch-target gate: ${growths.length} new raw interactive element(s) without ` +
        'proven 44px sizing evidence:\n'
    );
    for (const g of growths) {
      console.error(`    ${g.file} — <${g.kind}> ${g.was} → ${g.now}`);
    }
    console.error(
      '\n  A raw `<button>`/`<a>` must carry a Tailwind h-/w-/size-/min-h-/min-w- utility at ' +
        'spacing step 11+ (44px) or a `before:-inset-*` expansion, OR route through the Button ' +
        'primitive instead. If the element genuinely already meets 44px and the scanner missed ' +
        'the evidence (e.g. a class built through a variable), run ' +
        '`pnpm check:touch-targets:baseline` and say why in review.'
    );
    process.exit(1);
  }

  const delta = baselineTotal - currentTotal;
  const trend =
    delta > 0
      ? ` (shrank by ${delta} — run \`pnpm check:touch-targets:baseline\` to lock in the win)`
      : ' (unchanged)';
  console.log(
    `✔ touch-target gate: ${currentTotal} raw element(s) without proven sizing, baseline ` +
      `${baselineTotal}${trend}.`
  );
}

function runWrite() {
  const { counts: current, scanned } = scanCurrent();
  if (scanned < MIN_DISCOVERED_FILES) {
    console.error(
      `✗ refusing to write a baseline from only ${scanned} scanned file(s) (floor ` +
        `${MIN_DISCOVERED_FILES}) — that would erase the ratchet instead of updating it.`
    );
    process.exit(1);
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
  console.log(
    `✔ wrote ${relative(repoRoot, BASELINE_PATH)}: ${total(current)} element(s) across ` +
      `${Object.keys(current).length} file(s).`
  );
}

/**
 * Synthetic fixtures proving the guard reports an unsized raw `<button>`, an
 * unsized raw `<a>`, stays silent on ones carrying sizing evidence (a direct
 * utility, an arbitrary pixel value, or the before:-inset pattern), and
 * honours its exemptions — plus that the ratchet flags growth and passes an
 * unchanged or shrunk tree.
 * @returns {boolean}
 */
function selfTest() {
  const dirty = [
    '<button type="button" onClick={onClick}>',
    '  <XIcon />',
    '</button>',
    '<a href="/x" className="text-sm underline">link</a>',
  ].join('\n');
  const clean = [
    '<button className="size-11" onClick={onClick}><XIcon /></button>',
    '<button className="min-h-11 px-3" onClick={onClick}>Row</button>',
    '<a href="/x" className="min-w-[44px] min-h-[44px] flex items-center">link</a>',
    '<button className="relative before:absolute before:-inset-2.5 before:content-[\'\']">x</button>',
  ].join('\n');

  const dirtyHits = findViolations('pillars/x/app/src/A.tsx', dirty);
  const cleanHits = findViolations('pillars/x/app/src/B.tsx', clean);

  const baseline = { 'pillars/x/app/src/A.tsx': { button: 1 } };
  const grown = { 'pillars/x/app/src/A.tsx': { button: 2 } };
  const newFile = { ...baseline, 'pillars/x/app/src/C.tsx': { a: 1 } };
  const shrunk = { 'pillars/x/app/src/A.tsx': { button: 0 } };

  const checks = {
    'reports an unsized raw button': dirtyHits.some((v) => v.tag === 'button'),
    'reports an unsized raw anchor': dirtyHits.some((v) => v.tag === 'a'),
    'stays silent on a button sized via size-11': cleanHits.every(
      (v) => v.line !== 1 // line 1 of `clean` carries size-11
    ),
    'stays silent on min-h-11': !cleanHits.some((v) => v.line === 2),
    'stays silent on arbitrary min-w-[44px]': !cleanHits.some((v) => v.line === 3),
    'stays silent on before:-inset expansion': !cleanHits.some((v) => v.line === 4),
    'a story is exempt': !isScannable('pillars/food/app/src/pages/X.stories.tsx'),
    'a test is exempt': !isScannable('pillars/food/app/src/pages/X.test.tsx'),
    'a __tests__ file is exempt': !isScannable('pillars/food/app/src/__tests__/x.tsx'),
    'a generated client is exempt': !isScannable('pillars/food/app/src/lists-api/types.gen.ts'),
    'a non-source file is not scanned': !isScannable('pillars/food/README.md'),
    'a pillar app page is scannable': isScannable('pillars/food/app/src/pages/X.tsx'),
    'the shell is scannable': isScannable('pillars/shell/src/App.tsx'),
    'flags growth in an already-baselined file': diffAgainstBaseline(grown, baseline).some(
      (g) => g.file === 'pillars/x/app/src/A.tsx' && g.was === 1 && g.now === 2
    ),
    'flags a brand-new file': diffAgainstBaseline(newFile, baseline).some(
      (g) => g.file === 'pillars/x/app/src/C.tsx'
    ),
    'passes an unchanged tree': diffAgainstBaseline(baseline, baseline).length === 0,
    'passes a shrunk tree': diffAgainstBaseline(shrunk, baseline).length === 0,
  };

  const roots = scanRoots();
  if (roots.length === 0) {
    console.error('✗ self-test: scanRoots() found no pillar app or shell src directories.');
    return false;
  }

  const ok = Object.values(checks).every(Boolean);
  if (ok) {
    console.log(
      `self-test OK — guard reports unsized raw elements, stays silent on sized ones, honours ` +
        `its exemptions, and the ratchet flags growth (found ${roots.length} scan root(s)).`
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
      'Usage: node scripts/check-touch-targets.mjs [--write|--self-test]\n' +
        'Ratchets raw <button>/<a> elements in pillar apps + shell without proven 44px sizing\n' +
        'evidence against a committed baseline — the count may only hold or shrink.'
    );
    process.exit(2);
  }
  if (args.includes('--write')) {
    runWrite();
    return;
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  runCheck();
}

if (import.meta.main) {
  main();
}
