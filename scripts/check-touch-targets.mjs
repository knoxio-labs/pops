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
 * opening tag, the scanner reads ONLY that element's own opening tag —
 * bracket/quote-aware, so it spans as many lines as the tag's attributes
 * actually do — and looks for evidence the tappable area reaches 44px on
 * BOTH axes: a Tailwind sizing utility (`h-`/`w-`/`size-`/`min-h-`/`min-w-`)
 * at spacing-scale step 11 or higher (11 * 4px = 44px), the same properties
 * carrying an arbitrary pixel or rem value >= 44px, or the `before:-inset-*`
 * invisible-hit-area pattern the primitives already use, sized against the
 * element's OWN h/w evidence (box + 2 * inset >= 44 on each axis). Evidence
 * from a neighbouring element — a sibling, a parent, anything outside this
 * tag's own attribute list — never counts.
 *
 * A utility gated behind a bare `sm:`/`md:`/`lg:`/`xl:`/`2xl:` (or
 * `min-[…]:`, or an arbitrary `[@media(min-width:…)]:`) variant does NOT
 * count on its own: Tailwind's named breakpoints are min-width, so that
 * utility applies only ABOVE the given width — exactly the opposite of the
 * phone-width viewport this gate exists to protect first.
 *
 * A `max-sm:`/`max-md:`/… (or `max-[…]:`, or `[@media(max-width:…)]:`)
 * variant does NOT count either, even though it looks like the mirror case.
 * It applies only BELOW the given width — but this gate has to protect every
 * width a touch device can render, not only the narrowest one: an iPad in
 * portrait is 768 CSS px, landscape 1024, a touch laptop wider still, and
 * `max-sm:` (or any `max-*`) is absent at every one of those widths. A base
 * with no unprefixed sizing evidence is exactly as unsized at 768px as it is
 * at 375px, whatever a `max-*` variant does below 640px.
 *
 * The rule this gate actually enforces: evidence must hold at EVERY
 * viewport, which in practice means an unprefixed utility, or one gated
 * behind a variant that has nothing to do with viewport width (`hover:`,
 * `dark:`, `print:`, `data-[…]:`, …). A viewport-width variant — `sm:` or
 * `max-sm:`, named or arbitrary, either direction — may only ever ADD to an
 * already-sufficient unprefixed base (grow it further on large screens via
 * `sm:`, or further still on small ones via `max-sm:`); it can never
 * substitute for the base itself. Note this scanner does not model CSS
 * cascade order: it cannot tell whether a `max-*` variant shrinks an
 * already-sufficient base below 44px at the widths where that variant
 * applies (`h-11 max-sm:h-6`) — that risk exists whenever `max-*` is used
 * at all, sized-looking or not, and is out of scope for a text-pattern
 * heuristic the same way a class built through a variable is.
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

/**
 * Build a regex that matches one Tailwind sizing property (`h`, `w`, or
 * `size`, optionally `min-`-prefixed) carrying either a bare spacing-scale
 * step (`h-6`, `min-w-2.5`) or an arbitrary `[Npx]`/`[Nrem]` value, and
 * captures the numeric magnitude and, for the arbitrary form, its unit.
 *
 * The leading `(?<![\w-])` is what keeps the property honest: without it,
 * `max-w-24` reads as `w-24` and a width CAP passes as a size — this also
 * rejects `aspect-*` and any other unrelated `-h`/`-w`/`-size` suffix. The
 * trailing `(?![\d./])` on the bare form rejects fraction (`w-11/12`) and
 * malformed decimal continuations, which are not an absolute px value.
 * @param {'h' | 'w' | 'size'} prop
 * @returns {RegExp}
 */
function dimensionRe(prop) {
  return new RegExp(
    `(?<![\\w-])(?:min-)?${prop}-(?:(\\d+(?:\\.\\d+)?)(?![\\d./])|\\[(\\d+(?:\\.\\d+)?)(px|rem)\\])`,
    'g'
  );
}

/**
 * The `before:-inset-*` invisible-hit-area expansion pattern the primitives
 * use for compact controls: a negative inset on the `::before` pseudo-element
 * pushes its hit area outward by the given amount on every side. Accepts the
 * same bare-step / arbitrary-value shapes as {@link dimensionRe}.
 */
const INSET_RE =
  /(?<![\w-])before:-inset-(?:(\d+(?:\.\d+)?)(?![\d./])|\[(\d+(?:\.\d+)?)(px|rem)?\])/g;

/** Tailwind's spacing scale is linear: step N = N * 4px, fractional steps included. */
const PX_PER_STEP = 4;
const REM_PX = 16;

/** Tailwind's default breakpoint names — used by both `<name>:` (min-width) and `max-<name>:` (max-width) variants. */
const BREAKPOINT_NAMES = new Set(['sm', 'md', 'lg', 'xl', '2xl']);

/**
 * Does this variant segment — one colon-delimited piece of a class token's
 * prefix, with any `:` inside `[…]` already protected from the split — gate
 * its utility to only PART of the viewport-width range? Covers a bare named
 * breakpoint (`sm`), its max-width mirror (`max-sm`), an arbitrary bound in
 * either direction (`min-[640px]`, `max-[640px]`), the long-hand arbitrary
 * media form (`[@media(min-width:640px)]`, `[@media(max-width:640px)]`), and
 * the `@`-prefixed container-query lookalikes (`@sm`, `@min-[400px]`) — which
 * are not viewport-width variants at all, but this gate treats them the same
 * as their un-`@`-prefixed form on the theory that a false negative here
 * (missing real evidence) is cheaper than a false positive (accepting a
 * container query as proof of viewport-width sizing).
 * @param {string} segment
 * @returns {boolean}
 */
function isViewportWidthScopedVariant(segment) {
  const bare = segment.startsWith('@') ? segment.slice(1) : segment;
  if (BREAKPOINT_NAMES.has(bare)) return true;
  if (/^(?:min|max)-\[/.test(bare)) return true;
  for (const name of BREAKPOINT_NAMES) {
    if (bare === `max-${name}`) return true;
  }
  return /^\[@media\((?:min|max)-width:/.test(segment);
}

/**
 * Split a class token's variant prefix — everything before the utility
 * itself, ending in the `:` that introduces it — into its colon-delimited
 * variant segments. A colon inside `[…]` is treated as part of an arbitrary
 * value, not a variant separator, so `[@media(min-width:640px)]:h-11` yields
 * the single segment `[@media(min-width:640px)]`, not a fragment truncated
 * at the first colon it happens to contain.
 * @param {string} prefix
 * @returns {string[]}
 */
function splitVariantSegments(prefix) {
  /** @type {string[]} */
  const segments = [];
  let depth = 0;
  let segStart = 0;
  for (let i = 0; i < prefix.length; i++) {
    const ch = prefix[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ':' && depth === 0) {
      segments.push(prefix.slice(segStart, i));
      segStart = i + 1;
    }
  }
  return segments.filter(Boolean);
}

/**
 * Does the class token this match sits in carry a variant that gates it to
 * only PART of the viewport-width range — a bare, `max-`, or arbitrary
 * breakpoint variant in either direction? Such a match proves nothing about
 * a width this gate has to protect: `sm:`/`min-[…]:` skip the phone-width
 * base entirely, and `max-sm:`/`max-[…]:` skip every width at and above the
 * breakpoint — tablets and touch laptops included. Only an unprefixed
 * utility, or one gated behind a variant unrelated to viewport width
 * (`hover:`, `dark:`, `print:`, `data-[…]:`, …), proves the every-width
 * cascade this gate exists to check.
 *
 * The token-start walk tracks `[`/`]` depth so it does not stop on a `(`, a
 * `:`, or any other character that is only "special" outside an arbitrary
 * value — `[@media(min-width:640px)]:h-11` needs its full bracketed prefix
 * to be seen, not truncated at the first non-word character it contains.
 * @param {string} tagText
 * @param {number} matchIndex
 * @returns {boolean}
 */
function hasViewportWidthScopedPrefix(tagText, matchIndex) {
  let start = matchIndex;
  let depth = 0;
  while (start > 0) {
    const ch = tagText[start - 1];
    if (ch === ']') {
      depth++;
      start--;
      continue;
    }
    if (ch === '[') {
      depth = Math.max(0, depth - 1);
      start--;
      continue;
    }
    if (depth === 0 && /[\s"'`{}]/.test(ch)) break;
    start--;
  }
  const prefix = tagText.slice(start, matchIndex);
  if (!prefix) return false;
  return splitVariantSegments(prefix).some(isViewportWidthScopedVariant);
}

/**
 * Every regex match against `tagText` that is not gated behind a
 * viewport-width-scoped variant — the only matches allowed to count as
 * every-width proof.
 * @param {string} tagText
 * @param {RegExp} re
 * @returns {RegExpMatchArray[]}
 */
function baseEvidence(tagText, re) {
  return [...tagText.matchAll(re)].filter(
    (m) => !hasViewportWidthScopedPrefix(tagText, m.index ?? 0)
  );
}

/**
 * The largest pixel magnitude a `dimensionRe`/`INSET_RE` match set proves,
 * or `null` if the tag carries no evidence for that property at all.
 * @param {RegExpMatchArray[]} matches
 * @returns {number | null}
 */
function maxPx(matches) {
  let best = null;
  for (const m of matches) {
    let px;
    if (m[1] !== undefined) {
      px = Number(m[1]) * PX_PER_STEP;
    } else if (m[3] === 'rem') {
      px = Number(m[2]) * REM_PX;
    } else {
      px = Number(m[2]);
    }
    if (best === null || px > best) best = px;
  }
  return best;
}

/**
 * `size-*` sets both axes at once: combine a `size` reading with a `h`/`w`
 * reading by taking whichever proves more, treating a missing reading as
 * "no evidence" rather than zero.
 * @param {number | null} axis
 * @param {number | null} size
 * @returns {number | null}
 */
function combineWithSize(axis, size) {
  if (axis === null) return size;
  if (size === null) return axis;
  return Math.max(axis, size);
}

/**
 * Does this element's OWN opening-tag text prove its tappable area reaches
 * 44px on both axes? `size-*` counts for both `h` and `w`. A `before:-inset-*`
 * expansion only counts once combined with the element's own base box on that
 * axis (`box + 2 * inset >= 44`) — an inset with no box evidence, or too small
 * an inset for the box it is paired with, proves nothing. A single axis of
 * evidence (only `w`, only `h`) is never sufficient on its own: a wide link
 * can still be a ~20px-tall line of text, and a tall control with no width
 * evidence can be a single narrow glyph.
 * @param {string} tagText
 * @returns {boolean}
 */
function isCompliant(tagText) {
  const size = maxPx(baseEvidence(tagText, dimensionRe('size')));
  const h = maxPx(baseEvidence(tagText, dimensionRe('h')));
  const w = maxPx(baseEvidence(tagText, dimensionRe('w')));
  const inset = maxPx(baseEvidence(tagText, INSET_RE));

  const hBase = combineWithSize(h, size);
  const wBase = combineWithSize(w, size);
  if (hBase === null || wBase === null) return false;

  const expansion = inset === null ? 0 : inset * 2;
  return hBase + expansion >= 44 && wBase + expansion >= 44;
}

/**
 * The text of one JSX opening tag starting at `startIndex` (which must point
 * at `<`), ending at the first top-level `>`. Tracks quote and `{}` nesting
 * so an attribute like `onClick={() => x > 5}` or `title={\`a > b\`}` doesn't
 * end the tag early — this is what scopes evidence to the element's OWN
 * attributes instead of bleeding into whatever markup follows it.
 * @param {string} source
 * @param {number} startIndex
 * @returns {string}
 */
function extractOpeningTag(source, startIndex) {
  let i = startIndex;
  let braceDepth = 0;
  /** @type {string | null} */
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    if (quote) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      i++;
      continue;
    }
    if (ch === '{') {
      braceDepth++;
      i++;
      continue;
    }
    if (ch === '}') {
      braceDepth--;
      i++;
      continue;
    }
    if (ch === '>' && braceDepth <= 0) return source.slice(startIndex, i + 1);
    i++;
  }
  return source.slice(startIndex);
}

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
 * touch-target sizing evidence in the element's own opening tag.
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
    const tagText = extractOpeningTag(source, index);
    if (!isCompliant(tagText)) {
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
    // A genuinely-sized sibling must not launder this undersized anchor.
    '<a className="block break-all text-sm text-primary underline">link</a>',
    '<iframe className="h-96 w-full" />',
    // A before:-inset-* too small for its own box must not launder this button.
    '<button className="h-6 w-6 before:-inset-0.5"><XIcon /></button>',
    // Width evidence alone must not stand in for height too.
    '<a href="/y" className="w-64 text-sm underline">link</a>',
    // A bare min-width breakpoint only sizes the box ABOVE that width — the
    // base/phone-width cascade this element actually renders is unsized.
    '<button className="sm:h-11 sm:w-11" onClick={onClick}>Row</button>',
    // An undersized base is not laundered clean by a max-sm: variant: at and
    // above 640px — every tablet and touch laptop width — this renders 36px.
    '<button className="h-9 w-9 max-sm:h-11 max-sm:w-11" onClick={onClick}>Row</button>',
    // max-sm: with no unprefixed h/w utility at all proves nothing above 640px.
    '<button className="max-sm:h-11 max-sm:w-11" onClick={onClick}>Row</button>',
    // The long-hand arbitrary media form is sm: written out — no unprefixed
    // evidence, so this is unsized below 640px exactly like sm: alone.
    '<button className="[@media(min-width:640px)]:h-11 [@media(min-width:640px)]:w-11" onClick={onClick}>Row</button>',
  ].join('\n');
  const clean = [
    '<button className="size-11" onClick={onClick}><XIcon /></button>',
    '<button className="min-h-11 min-w-11 px-3" onClick={onClick}>Row</button>',
    '<a href="/x" className="min-w-[44px] min-h-[44px] flex items-center">link</a>',
    '<button className="relative h-6 w-6 before:absolute before:-inset-2.5 before:content-[\'\']">x</button>',
    // An already-sufficient base may be grown further by a breakpoint variant.
    '<button className="h-11 w-11 sm:h-16 sm:w-16" onClick={onClick}>Row</button>',
    // max-* may still grow an already-sufficient unprefixed base further on
    // small screens — the mirror of sm: growing it further on large ones.
    // The unprefixed h-11/w-11 alone proves the 44px floor holds everywhere.
    '<button className="h-11 w-11 max-sm:h-16 max-sm:w-16" onClick={onClick}>Row</button>',
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
    'reports an anchor a genuinely-sized sibling would have laundered': dirtyHits.some(
      (v) => v.line === 5 // the <a> immediately preceding the h-96 <iframe>
    ),
    'reports a before:-inset-* too small for its own box': dirtyHits.some((v) => v.line === 7),
    'reports an anchor sized on only one axis (w-64, no height evidence)': dirtyHits.some(
      (v) => v.line === 8
    ),
    'reports a button sized only via a bare sm: breakpoint (unsized below 640px)': dirtyHits.some(
      (v) => v.line === 9
    ),
    'reports a button whose undersized base is laundered by max-sm: (36px at every width >= 640px)':
      dirtyHits.some((v) => v.line === 10),
    'reports a button sized only via max-sm: with no unprefixed h/w at all': dirtyHits.some(
      (v) => v.line === 11
    ),
    'reports a button gated only by an arbitrary [@media(min-width:...)] variant': dirtyHits.some(
      (v) => v.line === 12
    ),
    'stays silent on a button sized via size-11': cleanHits.every(
      (v) => v.line !== 1 // line 1 of `clean` carries size-11
    ),
    'stays silent on min-h-11 min-w-11': !cleanHits.some((v) => v.line === 2),
    'stays silent on arbitrary min-w-[44px]/min-h-[44px]': !cleanHits.some((v) => v.line === 3),
    'stays silent on before:-inset expansion sized against its own box': !cleanHits.some(
      (v) => v.line === 4
    ),
    'stays silent when a sufficient base is further grown by sm:': !cleanHits.some(
      (v) => v.line === 5
    ),
    'stays silent when a sufficient base is further grown by max-sm: (phone-only growth, never shrinks anything)':
      !cleanHits.some((v) => v.line === 6),
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
