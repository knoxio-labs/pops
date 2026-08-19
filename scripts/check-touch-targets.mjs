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
 * cascade order in general — it cannot tell whether a scoped variant applies
 * a class through cn() or another indirection the way a base evidence class
 * built through a variable can hide from it. It DOES catch the cascade facts
 * cheap enough to check without simulating specificity in general: for EACH
 * viewport-width regime a tag mentions (the unprefixed base, plus one regime
 * per distinct `sm:`/`max-sm:`/`[@media…]:` segment it carries scoped
 * `h`/`w`/`size`/inset evidence for — see {@link isCompliantAtRegime}), the
 * box and the `before:-inset-*` expansion that regime ITSELF renders must
 * independently clear 44px — BUT viewport-width regimes are not partitions.
 * At 800px, `sm:`, `md:` and the unprefixed base are all live at once; below
 * 640px, `max-md:` and `max-sm:` both are. A property one regime doesn't set
 * is therefore resolved from the NEAREST regime that DOES — not the
 * unprefixed base outright, and not a mix of an arbitrary pair of regimes
 * either. {@link resolveWithCascade} walks every OTHER viewport-width regime
 * the tag mentions: a same-direction, same-FAMILY sibling (`min` vs `min`,
 * `max` vs `max`, compared via {@link regimeOrdering}'s pixel threshold, and
 * classified into a spelling family by {@link regimeFamily}) whose domain is a
 * proven SUPERSET of the regime being evaluated is a valid source — mirroring
 * how Tailwind's own compiled stylesheet orders same-direction breakpoints
 * WITHIN a family, and for the `named` family within one declared UNIT
 * (`min-` ascending, `max-` descending — confirmed against the pinned
 * `tailwindcss@4.3.3`), so the nearest such superset is the real cascade
 * winner. That threshold ordering does NOT hold ACROSS families, nor across
 * units within the `named` family: arbitrary `min-[…]`/`max-[…]` sort ahead
 * of every named breakpoint regardless of threshold, and `[@media…]` sorts
 * after all of them (POPS-2274) — `min-[700px]:h-6` is emitted, and therefore
 * wins, ahead of `sm:h-6` even though 700 > 640, the opposite of what a
 * single px-axis comparison would conclude. Named breakpoints in different
 * units are bucketed alphabetically by unit STRING ahead of being ordered by
 * threshold at all (`ch` < `em` < `px` < `rem` < `vw`, confirmed empirically
 * against the pinned `tailwindcss@4.3.3`), so a `900ch` breakpoint emits
 * ahead of a `300px` one regardless of 900 > 300 (POPS-2280). A same-direction
 * sibling from a DIFFERENT family, OR a different unit within the `named`
 * family, is therefore never treated as a provable superset, no matter how
 * its threshold compares.
 * A sibling that sets the property but ISN'T a provable same-direction,
 * same-family superset — different direction, a different spelling family, an
 * unresolved custom breakpoint, or a two-sided
 * `[@media(400px<=width<=700px)]` range — cannot be safely ignored either:
 * `sm:h-6 sm:w-6 sm:before:-inset-9
 * md:before:-inset-0` fails not because `md` "falls back to base" (that would
 * wrongly pass at 44px) but because `md`'s own 0px inset combines with `sm`'s
 * still-live 24px box — a real 24px control. Only when NO other live regime
 * could plausibly be supplying a property does falling through to the
 * unprefixed base become the proven-safe answer; POPS-2263 is the fix for
 * getting this wrong.
 * `h-6 w-6 before:-inset-9 sm:h-11 sm:w-11 sm:before:-inset-0` passes: below
 * 640px the base regime is a 24px box with a 36px expansion (96px), and at
 * 640px+ the `sm` regime is a real 44px box with no expansion needed (its OWN
 * `-inset-0`, not the unprefixed `-inset-9`, is what applies there). The
 * `max-sm:` mirror of that idiom passes for the same reason. Conversely
 * `h-6 w-6 before:-inset-9 max-sm:before:-inset-0` still fails: the `max-sm`
 * regime sets no box of its own, and no OTHER viewport-width regime does
 * either, so it correctly falls back to the unprefixed 24px box, combined
 * with `max-sm`'s OWN 0px expansion (its own inset, not the unprefixed one)
 * — 24px below 640px, not the 96px the unprefixed pairing alone would
 * suggest. A regime whose own box/inset only grows what it falls back to
 * (`max-sm:h-16` added to an `h-11` base) is untouched: growth can never
 * bring an axis under the floor.
 * A `before:-inset-x-*`/`before:-inset-y-*` per-axis form is recognised
 * alongside the all-sides `before:-inset-*`: `-inset-x` feeds only the WIDTH
 * axis (`inset-inline`), `-inset-y` only the HEIGHT axis (`inset-block`), and
 * — confirmed against the pinned `tailwindcss@4.3.3` — an axis form overrides
 * only its own axis of an all-sides value at the same scope, not both; see
 * {@link ownInsetReading}. A scoped axis inset therefore shrinks only the
 * axis it names, exactly as real as an all-sides scoped shrink.
 * A `max-h`/`max-w`/`max-size` ceiling is read as a real shrink at the base
 * (POPS-2265) AND within a scoped regime (POPS-2275), the same way in both
 * places: `h-11 w-11 max-h-6 max-w-6` fails, the base box is `min(h/size
 * evidence, max-* ceiling)`; see {@link baseBoxCeiling}. `sm:h-11 sm:max-h-6`
 * fails identically at `sm:` — the `sm` regime's own box is `min(sm's h/size
 * evidence, sm's own max-* ceiling)`, never an alternative reading the
 * larger bare value beats; see {@link scopedBoxCeiling}.
 * The scoped-shrink check — the `h`/`w`/`size` form and both inset forms — is
 * also narrow to a NUMERIC magnitude — a bare spacing step or an arbitrary
 * `px`/`rem` value. A scoped utility whose value is not a pixel-comparable
 * number (`sm:h-auto`, `sm:h-px`, `sm:h-1/2`, `sm:h-[calc(100%-40px)]`,
 * `sm:before:-inset-px`) fails open: it proves nothing, in either direction,
 * so it is silently treated as "not a shrink" rather than flagged. That is a
 * stated limit, not an oversight — `auto`/a percentage/a `calc()` expression
 * is genuinely undecidable against a fixed 44px floor without a layout
 * engine, and this scanner is deliberately a text-only heuristic. It is the
 * same fail-open direction the base-evidence check already takes for
 * `w-11/12` and other non-absolute values, so an author relying on one of
 * these to shrink a control below 44px gets no warning here.
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
 * The mirror of {@link dimensionRe}, for the SHRINK direction only: does
 * `tagText` carry a `max-h`/`max-w`/`max-size` (a ceiling — the primitive
 * that actually shrinks a rendered box) or a bare `h`/`w`/`size` utility?
 * `min-h`/`min-w`/`min-size` are deliberately excluded here even though
 * {@link dimensionRe} accepts them: a `min-` value is a floor, which can
 * never shrink anything, so `sm:min-w-0` must never read as a scoped shrink
 * to 0px — it is a no-op relative to whatever the base box already is.
 * Captures line up with {@link pxOf}/{@link dimensionRe} so both can share
 * the same magnitude helpers.
 * @param {'h' | 'w' | 'size'} prop
 * @returns {RegExp}
 */
function shrinkDimensionRe(prop) {
  return new RegExp(
    `(?<![\\w-])(?:max-)?${prop}-(?:(\\d+(?:\\.\\d+)?)(?![\\d./])|\\[(\\d+(?:\\.\\d+)?)(px|rem)\\])`,
    'g'
  );
}

/**
 * A `max-h`/`max-w`/`max-size` ceiling ONLY — unlike {@link
 * shrinkDimensionRe}, this never matches the bare form, because it exists to
 * be combined (via `Math.min`) with a SEPARATE real box reading, not to
 * stand in as one on its own (POPS-2265: an unprefixed `max-h-6` paired with
 * `h-11` really does cap the rendered box at 24px, but `max-h-6` alone proves
 * nothing to cap). Captures line up with {@link pxOf} the same way {@link
 * dimensionRe}/{@link shrinkDimensionRe} do.
 * @param {'h' | 'w' | 'size'} prop
 * @returns {RegExp}
 */
function ceilingRe(prop) {
  return new RegExp(
    `(?<![\\w-])max-${prop}-(?:(\\d+(?:\\.\\d+)?)(?![\\d./])|\\[(\\d+(?:\\.\\d+)?)(px|rem)\\])`,
    'g'
  );
}

/**
 * The BARE form ONLY — unlike {@link dimensionRe}, this never matches the
 * `min-` form. Used for a SCOPED regime's own reading ({@link
 * scopedBoxReading}), where a `min-` value must be read as a floor via
 * {@link floorDimensionRe}/{@link scopedBoxFloor} instead of as an
 * alternative reading (POPS-2282) — mirroring why {@link ceilingRe} excludes
 * the bare form for the opposite reason. The BASE reading ({@link
 * baseBoxReading}) keeps using {@link dimensionRe} (bare + `min-`) directly:
 * there is no cascade at the base for a `min-` reading to wrongly
 * short-circuit. Captures line up with {@link pxOf} the same way
 * {@link dimensionRe} does.
 * @param {'h' | 'w' | 'size'} prop
 * @returns {RegExp}
 */
function bareDimensionRe(prop) {
  return new RegExp(
    `(?<![\\w-])${prop}-(?:(\\d+(?:\\.\\d+)?)(?![\\d./])|\\[(\\d+(?:\\.\\d+)?)(px|rem)\\])`,
    'g'
  );
}

/**
 * A `min-h`/`min-w`/`min-size` FLOOR ONLY — the mirror of {@link ceilingRe}
 * for the floor direction (POPS-2282): unlike {@link dimensionRe}, this never
 * matches the bare form, because it exists to be combined (via `Math.max`)
 * with a SEPARATE resolved box reading, not to stand in as one on its own —
 * a scoped `min-w-0` with no other width evidence anywhere still proves
 * nothing on its own; it only ever raises whatever the cascade otherwise
 * resolves. Captures line up with {@link pxOf} the same way {@link
 * dimensionRe}/{@link ceilingRe} do.
 * @param {'h' | 'w' | 'size'} prop
 * @returns {RegExp}
 */
function floorDimensionRe(prop) {
  return new RegExp(
    `(?<![\\w-])min-${prop}-(?:(\\d+(?:\\.\\d+)?)(?![\\d./])|\\[(\\d+(?:\\.\\d+)?)(px|rem)\\])`,
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

/**
 * The per-axis mirrors of {@link INSET_RE}: `before:-inset-x-*` sets
 * `inset-inline` (left + right, the WIDTH-axis expansion) and
 * `before:-inset-y-*` sets `inset-block` (top + bottom, the HEIGHT-axis
 * expansion) instead of all four sides. Compiled with the pinned
 * `tailwindcss@4.3.3`, an axis form emitted after an all-sides `-inset-*` at
 * equal specificity overrides only that one axis — `before:-inset-9
 * before:-inset-x-0` renders a 0px horizontal expansion and a 36px vertical
 * one, not 36px on both. {@link effectiveInsetPx} models that override.
 * @param {'x' | 'y'} axis
 * @returns {RegExp}
 */
function insetAxisRe(axis) {
  return new RegExp(
    `(?<![\\w-])before:-inset-${axis}-(?:(\\d+(?:\\.\\d+)?)(?![\\d./])|\\[(\\d+(?:\\.\\d+)?)(px|rem)?\\])`,
    'g'
  );
}
const INSET_X_RE = insetAxisRe('x');
const INSET_Y_RE = insetAxisRe('y');

/** Tailwind's spacing scale is linear: step N = N * 4px, fractional steps included. */
const PX_PER_STEP = 4;
const REM_PX = 16;

/** Where the repo's actual breakpoint names are defined — the single source of truth this gate must not drift from. */
const GLOBALS_CSS_PATH = join(repoRoot, 'libs/ui/src/theme/globals.css');

/**
 * Tailwind v4's built-in breakpoint names, honoured whether or not
 * {@link GLOBALS_CSS_PATH} redeclares them: `@theme` in Tailwind v4 is
 * ADDITIVE over the default theme, not a replacement for it, so `sm:`/`2xl:`
 * compile to real viewport media queries even if `globals.css` never
 * mentions `--breakpoint-sm`/`--breakpoint-2xl` at all. Verified against the
 * pinned `tailwindcss@4.3.3`: with only a custom `--breakpoint-phone`
 * declared, `sm:h-11`/`2xl:w-11` still emit `@media (width >= 40rem)` /
 * `@media (width >= 96rem)` alongside the custom one.
 */
const TAILWIND_DEFAULT_BREAKPOINTS = new Set(['sm', 'md', 'lg', 'xl', '2xl']);

/**
 * Tailwind v4's default pixel threshold for each of
 * {@link TAILWIND_DEFAULT_BREAKPOINTS}, honoured whether or not
 * {@link GLOBALS_CSS_PATH} redeclares it — same additive-default reasoning as
 * {@link TAILWIND_DEFAULT_BREAKPOINTS} itself. Used only to ORDER two
 * viewport-width regimes against each other (see {@link regimeOrdering}); a
 * name absent here and unresolved from `globals.css` simply cannot be
 * ordered, which is a correctness-safe (fail-closed) degradation, not a
 * crash.
 */
const TAILWIND_DEFAULT_BREAKPOINT_PX = new Map([
  ['sm', 640],
  ['md', 768],
  ['lg', 1024],
  ['xl', 1280],
  ['2xl', 1536],
]);

/**
 * The UNIT each of {@link TAILWIND_DEFAULT_BREAKPOINTS} is declared in by
 * Tailwind v4's shipped default theme — `rem` (`40rem`/`48rem`/`64rem`/
 * `80rem`/`96rem`), never `px`, even though {@link TAILWIND_DEFAULT_BREAKPOINT_PX}
 * records their px-equivalent threshold for ordering. {@link regimeFamily}
 * needs this alongside the px threshold: Tailwind's compiled stylesheet
 * buckets same-direction breakpoints by declared unit STRING, alphabetically
 * (`ch` < `em` < `px` < `rem` < `vw`, confirmed against the pinned
 * `tailwindcss@4.3.3` across five units), not by resolved px — see
 * {@link regimeFamily}'s docstring for why that makes two same-px-equivalent
 * breakpoints in different units NOT interchangeable cascade sources
 * (POPS-2280). A name whose default `rem` declaration is left alone (not
 * redeclared in `globals.css`) keeps the `rem` bucket, the same
 * additive-default reasoning {@link TAILWIND_DEFAULT_BREAKPOINT_PX} already
 * uses for its threshold.
 */
const TAILWIND_DEFAULT_BREAKPOINT_UNIT = new Map(
  [...TAILWIND_DEFAULT_BREAKPOINT_PX.keys()].map((name) => [name, 'rem'])
);

/**
 * Breakpoint names (usable by both `<name>:` (min-width) and `max-<name>:`
 * (max-width) variants) and their pixel thresholds, read from
 * {@link GLOBALS_CSS_PATH}. The name capture accepts the full charset a
 * Tailwind v4 `--breakpoint-*` custom property name allows — letters, digits,
 * AND hyphens — so a multi-word breakpoint like `--breakpoint-tablet-lg` is
 * captured whole rather than truncated at its first hyphen (a truncated
 * capture never matches the `:` that follows it, so the declaration
 * previously contributed nothing to the set at all — the exact failure class
 * POPS-2174 / POPS-2204 / POPS-2253 were filed for, reopened for hyphenated
 * names as POPS-2264). The value capture is a best-effort — a name whose
 * declared value isn't a plain `<number>(px|rem)?` (e.g. a `theme()`
 * reference) still contributes its NAME to {@link BREAKPOINT_NAMES}, just
 * with no pixel entry, which {@link regimeOrdering} treats as unorderable
 * rather than throwing.
 *
 * Names are unioned with {@link TAILWIND_DEFAULT_BREAKPOINTS} (which Tailwind
 * honours unconditionally) so the derived set can only grow, never shrink
 * below what Tailwind honours by default, even if a "redundant" default
 * redeclaration is deleted from `globals.css`. Pixel thresholds start from
 * {@link TAILWIND_DEFAULT_BREAKPOINT_PX} and are OVERRIDDEN by any matching
 * `globals.css` declaration, so a redeclared default's custom value is
 * honoured rather than silently ignored. The declared UNIT is tracked
 * alongside the threshold, seeded from {@link TAILWIND_DEFAULT_BREAKPOINT_UNIT}
 * and overridden the same way — {@link regimeFamily} needs it to keep two
 * same-named-family breakpoints in DIFFERENT units from being compared by
 * threshold (POPS-2280): Tailwind's compiled stylesheet orders same-direction
 * breakpoints by threshold only WITHIN one declared unit, never across units.
 * @returns {{ names: Set<string>, px: Map<string, number>, unit: Map<string, string> }}
 */
function loadBreakpoints() {
  const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');
  const names = new Set();
  const px = new Map(TAILWIND_DEFAULT_BREAKPOINT_PX);
  const unit = new Map(TAILWIND_DEFAULT_BREAKPOINT_UNIT);
  for (const m of css.matchAll(
    /--breakpoint-([a-z0-9][a-z0-9-]*)\s*:\s*(\d+(?:\.\d+)?)?([a-z%]*)/g
  )) {
    const [, name, num, rawUnit] = m;
    names.add(name);
    if (num === undefined) continue;
    // `em` is resolved to the same PX THRESHOLD as `rem` for ordering
    // purposes — a media-query length is relative to the root font-size
    // (16px), so `48em` and `48rem` are equivalent bounds — confirmed
    // against the pinned tailwindcss@4.3.3, which compiles
    // `--breakpoint-tablet: 48em` to `@media (width >= 48em)`, the same
    // 768px-equivalent threshold as a `rem` declaration. That equivalence is
    // ONLY about the threshold, not the unit BUCKET: `em` and `rem` are
    // still different entries in {@link TAILWIND_DEFAULT_BREAKPOINT_UNIT}'s
    // alphabetical ordering (`ch` < `em` < `px` < `rem` < `vw`), so an
    // `em`-declared name and a `rem`-declared name at the identical
    // px-equivalent threshold are still NOT a provable cascade superset of
    // each other (POPS-2280) — {@link regimeFamily} is what enforces that.
    // Any OTHER unit (`vw`, `%`, …) or a non-literal value (`theme()`,
    // `calc()`) records no px/unit entry at all — {@link regimeOrdering}
    // already treats a name with no px entry as unorderable, which is the
    // correct fail-closed behaviour rather than silently misreading the unit
    // as px.
    if (rawUnit === 'rem' || rawUnit === 'em') {
      px.set(name, Number(num) * REM_PX);
      unit.set(name, rawUnit);
    } else if (rawUnit === 'px' || rawUnit === '') {
      px.set(name, Number(num));
      unit.set(name, 'px');
    }
  }
  if (names.size === 0) {
    throw new Error(`no --breakpoint-* custom properties found in ${GLOBALS_CSS_PATH}`);
  }
  for (const name of TAILWIND_DEFAULT_BREAKPOINTS) names.add(name);
  return { names, px, unit };
}

const { names: BREAKPOINT_NAMES, px: BREAKPOINT_PX, unit: BREAKPOINT_UNIT } = loadBreakpoints();

/**
 * Does this variant segment — one colon-delimited piece of a class token's
 * prefix, with any `:` inside `[…]` already protected from the split — gate
 * its utility to only PART of the viewport-width range? Covers a bare named
 * breakpoint (`sm`), its max-width mirror (`max-sm`), an arbitrary bound in
 * either direction (`min-[640px]`, `max-[640px]`), any long-hand arbitrary
 * `[@media(...)]` variant that constrains `width` — the named-direction form
 * (`[@media(min-width:640px)]`, `[@media(max-width:640px)]`), CSS range
 * syntax (`[@media(width<=640px)]`, `[@media(width>=640px)]`,
 * `[@media(400px<=width<=700px)]`), and the underscore-for-space spelling
 * Tailwind accepts in arbitrary values (`[@media_(min-width:640px)]`) — and
 * the `@`-prefixed container-query lookalikes (`@sm`, `@min-[400px]`) — which
 * are not viewport-width variants at all, but this gate treats them the same
 * as their un-`@`-prefixed form on the theory that a false negative here
 * (missing real evidence) is cheaper than a false positive (accepting a
 * container query as proof of viewport-width sizing).
 *
 * The `[@media…]` arm recognises ANY arbitrary variant that starts with
 * `[@media` and mentions `width`, regardless of what comes between —
 * `[@media(min-width:640px)]`, `[@media_screen_and_(min-width:640px)]`,
 * `[@media_only_screen_and_(min-width:640px)]`, `[@media_all_and_(...)]`, a
 * media TYPE (`screen`/`print`/`all`) named ahead of the feature list
 * included. It deliberately does NOT require `(` to follow `@media`
 * immediately — an earlier anchor that did (`/^\[@media[_ ]?\(/`) let any
 * spelling naming a media type before the feature fall through to
 * {@link baseEvidence} and read as unprefixed, every-width proof, which is
 * the exact failure this gate exists to prevent (POPS-2174, POPS-2204,
 * POPS-2253) — confirmed against the pinned `tailwindcss@4.3.3`, which
 * compiles `[@media_screen_and_(min-width:640px)]:h-11` to a real
 * `@media screen and (min-width:640px)` viewport query. Rather than
 * enumerate every media-type spelling Tailwind/CSS allows, the anchor only
 * requires the `[@media` prefix and leaves the rest to the `width` check
 * below it: an arbitrary media variant this gate still fails to recognise
 * (one that never mentions `width` at all, e.g. a bare `prefers-color-scheme`
 * query) falls through to {@link baseEvidence}. Erring toward "this IS
 * viewport-scoped" for a `[@media…]` variant that does mention `width` costs,
 * at worst, a false positive a baseline absorbs; erring the other way ships
 * an unsized control.
 *
 * Two more arms recognise the remaining Tailwind v4 viewport-width spellings
 * (POPS-2273, the fourth recurrence of POPS-2174/2204/2253 through spellings
 * nobody had enumerated): `min-<name>` (`min-sm`) is identical in effect to a
 * bare named breakpoint, and `not-…` NEGATES whatever variant follows it —
 * `not-sm`/`not-max-sm`/`not-min-[640px]` are all still viewport-width
 * variants, just the opposite domain of the variant they wrap. Rather than
 * enumerate `not-`-wrapped spellings as their own arms (the mistake that
 * created this gap in the first place), `not-` is stripped and the REST of
 * the segment is checked recursively against this same function: whatever
 * this function already recognises as viewport-width-scoped, `not-` of it
 * still is. Confirmed against the pinned `tailwindcss@4.3.3`: `not-sm:h-11`
 * compiles to `@media not (width >= 40rem)`, `not-max-sm:h-11` to `@media not
 * (width < 40rem)`, `not-min-[640px]:h-11` to `@media not (width >= 640px)`,
 * and `min-sm:h-11` to `@media (width >= 40rem)` — all real viewport queries,
 * none of which the enumeration-based arms above matched.
 * @param {string} segment
 * @returns {boolean}
 */
function isViewportWidthScopedVariant(segment) {
  if (segment.startsWith('not-')) return isViewportWidthScopedVariant(segment.slice(4));
  const bare = segment.startsWith('@') ? segment.slice(1) : segment;
  if (BREAKPOINT_NAMES.has(bare)) return true;
  if (/^(?:min|max)-\[/.test(bare)) return true;
  for (const name of BREAKPOINT_NAMES) {
    if (bare === `max-${name}` || bare === `min-${name}`) return true;
  }
  return /^\[@media/.test(segment) && /\bwidth\b/i.test(segment);
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
 * @returns {string[]}
 */
function variantSegmentsFor(tagText, matchIndex) {
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
  if (!prefix) return [];
  return splitVariantSegments(prefix);
}

/**
 * Does the class token this match sits in carry a variant that gates it to
 * only PART of the viewport-width range? See {@link variantSegmentsFor} for
 * why the walk tracks `[`/`]` depth.
 * @param {string} tagText
 * @param {number} matchIndex
 * @returns {boolean}
 */
function hasViewportWidthScopedPrefix(tagText, matchIndex) {
  return variantSegmentsFor(tagText, matchIndex).some(isViewportWidthScopedVariant);
}

/**
 * Joins the viewport-width-scoped segments of a BANDED regime key (see
 * {@link viewportVariantFor}) — a two-colon run {@link splitVariantSegments}
 * can never produce from real class text (it would require an EMPTY segment
 * between two colons, which {@link splitVariantSegments} already filters
 * out), so a banded key can never collide with, or be mistaken for, a
 * single-segment regime name.
 */
const REGIME_BAND_JOIN = '::';

/**
 * Does `regime` carry MORE THAN ONE viewport-width segment — a banded token
 * like `sm:max-md:h-11`, whose real domain is the INTERSECTION of both
 * segments (`[640px, 768px)`), not the wider single-sided domain either
 * segment alone would have (POPS-2281)? Such a regime has no cheap `{kind,
 * px}` ordering — a two-sided domain is not a one-sided bound — so
 * {@link regimeOrdering} fails closed on it the same way it already does for
 * a two-sided `[@media(400px<=width<=700px)]` range.
 * @param {string} regime
 * @returns {boolean}
 */
function isBandedRegime(regime) {
  return regime.includes(REGIME_BAND_JOIN);
}

/**
 * The viewport-width-scoped variant segment(s) (`sm`, `max-sm`,
 * `[@media(min-width:640px)]`, …) gating this match, or `null` if the match
 * carries none — i.e. it is base evidence, per {@link hasViewportWidthScopedPrefix}.
 * Used to group a scoped `h`/`w`/`size`/inset match with the OTHER scoped
 * matches on the same tag that render at the same width regime, rather than
 * combining it with the unprefixed base regardless of whether that same
 * regime also resizes the box (POPS-2255).
 *
 * A token may carry MORE than one viewport-width segment — `sm:max-md:h-11`
 * is a valid Tailwind v4 band whose real domain is the INTERSECTION
 * `[640px, 768px)`, narrower than either segment's own domain
 * (POPS-2281). Keeping only the FIRST segment (an earlier version of this
 * function used `.find()`) filed the utility under `sm`'s full
 * `[640px, ∞)` domain and proved it compliant at widths — 768px and up —
 * where the band's `max-md` half makes the utility absent. ALL
 * viewport-width segments the token carries are therefore joined (via
 * {@link REGIME_BAND_JOIN}) into one regime key distinct from any of its
 * segments alone, so `sm:max-md:h-11` is evaluated as its OWN regime, never
 * conflated with a plain `sm:h-11` — see {@link isBandedRegime} for how
 * {@link regimeOrdering} refuses to treat that key as a orderable one-sided
 * domain.
 * @param {string} tagText
 * @param {number} matchIndex
 * @returns {string | null}
 */
function viewportVariantFor(tagText, matchIndex) {
  const segments = variantSegmentsFor(tagText, matchIndex).filter(isViewportWidthScopedVariant);
  return segments.length === 0 ? null : segments.join(REGIME_BAND_JOIN);
}

/**
 * @typedef {{ kind: 'min' | 'max', px: number }} RegimeOrdering
 */

/**
 * Parse a `[@media…]` viewport-width segment's numeric bound, in either
 * spelling direction (`min-width:`/`max-width:`, or CSS range syntax with the
 * bound written before or after `width`). Returns `null` for a two-sided
 * range (`400px<=width<=700px`) — its domain is bounded on BOTH ends, so it
 * cannot be compared against a one-sided `min-`/`max-` regime by a cheap
 * threshold check, and {@link regimeOrdering} treats that the same as any
 * other unorderable pair (see {@link resolveWithCascade}'s `interference`).
 * @param {string} segment
 * @returns {RegimeOrdering | null}
 */
function parseMediaRegimeOrdering(segment) {
  const numUnit = '(\\d+(?:\\.\\d+)?)(px|rem)?';
  const before = new RegExp(`${numUnit}\\s*(<=|<|>=|>)\\s*width`, 'i').exec(segment);
  const after = new RegExp(`width\\s*(<=|<|>=|>)\\s*${numUnit}`, 'i').exec(segment);
  if (before && after) return null;
  const toPx = (num, unit) => (unit === 'rem' ? Number(num) * REM_PX : Number(num));
  if (before) {
    const [, num, unit, op] = before;
    // `N <= width` / `N < width` means width is ABOVE N: a min-width bound.
    // `N >= width` / `N > width` means width is BELOW N: a max-width bound.
    return { kind: op === '<=' || op === '<' ? 'min' : 'max', px: toPx(num, unit) };
  }
  if (after) {
    const [, op, num, unit] = after;
    // `width <= N` / `width < N` is a max-width bound; `width >= N` / `> N` is min-width.
    return { kind: op === '<=' || op === '<' ? 'max' : 'min', px: toPx(num, unit) };
  }
  const longhand = new RegExp(`(min|max)-width:\\s*${numUnit}`, 'i').exec(segment);
  if (!longhand) return null;
  const [, dir, num, unit] = longhand;
  return { kind: /** @type {'min' | 'max'} */ (dir), px: toPx(num, unit) };
}

/**
 * Does this viewport-width-scoped regime have a cheaply comparable direction
 * (`min`/`max`) and pixel threshold — the minimum needed to tell whether
 * ANOTHER regime's domain is a superset of its own? Named breakpoints
 * (including the `min-<name>` spelling) and their `max-` mirrors resolve via
 * {@link BREAKPOINT_PX}; arbitrary `min-[…]`/`max-[…]` and `[@media…]` forms
 * (any spelling recognised by {@link isViewportWidthScopedVariant}, including
 * a media TYPE ahead of the feature list or the underscore-for-space
 * spelling) resolve via {@link parseMediaRegimeOrdering}. A leading `not-` is
 * stripped and the ordering of what remains is FLIPPED (`min` <-> `max`, same
 * px) — negating a one-sided viewport bound negates its direction, not its
 * threshold: `not-sm` (`@media not (width >= 40rem)`) is `max`-shaped at 640,
 * `not-max-sm` (`@media not (width < 40rem)`) is `min`-shaped at 640, both
 * confirmed against the pinned `tailwindcss@4.3.3` (POPS-2273). Returns
 * `null` when no cheap comparison is possible — an unresolved custom
 * breakpoint name, a two-sided `[@media(400px<=width<=700px)]` range, or a
 * BANDED regime carrying more than one viewport-width segment (`sm:max-md`,
 * see {@link isBandedRegime}) — a two-sided intersection is not a one-sided
 * bound any more than an explicit range is (POPS-2281) — which
 * {@link resolveWithCascade} treats as unorderable against every other
 * regime, itself included.
 * @param {string} regime
 * @returns {RegimeOrdering | null}
 */
function regimeOrdering(regime) {
  if (isBandedRegime(regime)) return null;
  if (regime.startsWith('not-')) {
    const inner = regimeOrdering(regime.slice(4));
    return inner === null ? null : { kind: inner.kind === 'min' ? 'max' : 'min', px: inner.px };
  }
  const bare = regime.startsWith('@') ? regime.slice(1) : regime;
  if (BREAKPOINT_NAMES.has(bare)) {
    const px = BREAKPOINT_PX.get(bare);
    return px === undefined ? null : { kind: 'min', px };
  }
  for (const name of BREAKPOINT_NAMES) {
    if (bare === `max-${name}`) {
      const px = BREAKPOINT_PX.get(name);
      return px === undefined ? null : { kind: 'max', px };
    }
    if (bare === `min-${name}`) {
      const px = BREAKPOINT_PX.get(name);
      return px === undefined ? null : { kind: 'min', px };
    }
  }
  const arbitrary = /^(min|max)-\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(bare);
  if (arbitrary) {
    const [, dir, num, unit] = arbitrary;
    return {
      kind: /** @type {'min' | 'max'} */ (dir),
      px: unit === 'rem' ? Number(num) * REM_PX : Number(num),
    };
  }
  if (!/^\[@media/.test(regime)) return null;
  return parseMediaRegimeOrdering(regime);
}

/**
 * @typedef {string} RegimeFamily
 * A `'named:<unit>'` family (e.g. `'named:px'`, `'named:rem'`, `'named:em'`)
 * for a named breakpoint, `'arbitrary'` for `min-[…]`/`max-[…]`, `'media'` for
 * `[@media…]`, `'unknown'` for anything unresolvable, or any of those
 * `not-`-prefixed.
 */

/**
 * Which Tailwind spelling FAMILY a viewport-width-scoped regime belongs to —
 * the classification {@link resolveWithCascade} needs on top of
 * {@link regimeOrdering}'s `{kind, px}` pair (POPS-2274). `regimeOrdering`
 * reduces every regime to one px axis, but Tailwind's compiled stylesheet
 * does NOT emit same-direction regimes on that one axis: confirmed against
 * the pinned `tailwindcss@4.3.3`, `min-width` emission order is arbitrary
 * `min-[…]` FIRST (regardless of threshold), then named breakpoints ascending
 * by threshold WITHIN ONE DECLARED UNIT, then `[@media…]` LAST — `max-width`
 * mirrors it (arbitrary `max-[…]` first, named descending within one unit,
 * `[@media…]` last). Named breakpoints across DIFFERENT units are not
 * ordered by threshold at all: Tailwind buckets same-direction breakpoints
 * alphabetically by declared unit STRING first (`ch` < `em` < `px` < `rem` <
 * `vw`, confirmed empirically against the pinned `tailwindcss@4.3.3` across
 * five units scrambled in magnitude) and only orders by threshold within a
 * bucket — so a `900ch` breakpoint sorts ahead of a `300px` one regardless of
 * 900 > 300, and a `100em` breakpoint sorts ahead of a `20rem` one even
 * though 100em (1600px) is a much larger threshold than 20rem (320px)
 * (POPS-2280). A same-direction threshold comparison is therefore only
 * PROVEN safe between two regimes of the same family AND, for the `named`
 * family, the same declared unit — see {@link TAILWIND_DEFAULT_BREAKPOINT_UNIT}
 * / {@link loadBreakpoints}'s `unit` map. Two regimes of different families,
 * or two named regimes in different units, are always treated as unorderable
 * (`interference`) here, never compared by threshold, even when both resolve
 * a `{kind, px}` pair — fail-closed, the same direction as an unresolved
 * custom breakpoint or a two-sided range.
 * @param {string} regime
 * @returns {RegimeFamily}
 */
function regimeFamily(regime) {
  if (regime.startsWith('not-')) {
    const inner = regimeFamily(regime.slice(4));
    return inner === 'unknown' ? 'unknown' : `not-${inner}`;
  }
  const bare = regime.startsWith('@') ? regime.slice(1) : regime;
  if (BREAKPOINT_NAMES.has(bare)) return namedRegimeFamily(bare);
  for (const name of BREAKPOINT_NAMES) {
    if (bare === `max-${name}` || bare === `min-${name}`) return namedRegimeFamily(name);
  }
  if (/^(?:min|max)-\[/.test(bare)) return 'arbitrary';
  if (/^\[@media/.test(regime)) return 'media';
  return 'unknown';
}

/**
 * The `named` family for one breakpoint NAME, sub-divided by
 * {@link BREAKPOINT_UNIT}'s declared unit (POPS-2280) — `'named:unknown'`
 * when the name has no resolved unit (an unrecognised `--breakpoint-*` unit),
 * which never equals any other family and so always falls to `interference`
 * in {@link resolveWithCascade}, the same fail-closed direction
 * {@link regimeOrdering} already takes for a name with no px entry.
 * @param {string} name
 * @returns {RegimeFamily}
 */
function namedRegimeFamily(name) {
  const unit = BREAKPOINT_UNIT.get(name);
  return unit === undefined ? 'named:unknown' : `named:${unit}`;
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
 * Every regex match against `tagText` that IS gated behind a viewport-width-
 * scoped variant — the mirror of {@link baseEvidence}, used to check whether
 * one of those variants sets a magnitude the floor at the width it governs.
 * @param {string} tagText
 * @param {RegExp} re
 * @returns {RegExpMatchArray[]}
 */
function scopedEvidence(tagText, re) {
  return [...tagText.matchAll(re)].filter((m) =>
    hasViewportWidthScopedPrefix(tagText, m.index ?? 0)
  );
}

/**
 * The pixel magnitude one `dimensionRe`/`INSET_RE` match proves.
 * @param {RegExpMatchArray} m
 * @returns {number}
 */
function pxOf(m) {
  if (m[1] !== undefined) return Number(m[1]) * PX_PER_STEP;
  if (m[3] === 'rem') return Number(m[2]) * REM_PX;
  return Number(m[2]);
}

/**
 * The largest pixel magnitude a match set proves, or `null` if the tag
 * carries no evidence for that property at all.
 * @param {RegExpMatchArray[]} matches
 * @returns {number | null}
 */
function maxPx(matches) {
  let best = null;
  for (const m of matches) {
    const px = pxOf(m);
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
 * Every match of `re` against `tagText` that is scoped to exactly `regime` —
 * the one viewport-width-scoped variant segment string (`sm`, `max-sm`,
 * `[@media(min-width:640px)]`, …) all of a width regime's own evidence must
 * share for {@link boxPxForRegime}/{@link insetPxForRegime} to treat it as
 * "this regime's own reading" rather than falling back to the base.
 * @param {string} tagText
 * @param {RegExp} re
 * @param {string} regime
 * @returns {RegExpMatchArray[]}
 */
function matchesForRegime(tagText, re, regime) {
  return scopedEvidence(tagText, re).filter(
    (m) => viewportVariantFor(tagText, m.index ?? 0) === regime
  );
}

/**
 * Every distinct viewport-width regime this tag carries scoped `h`/`w`/
 * `size`/inset (all-sides or per-axis) evidence for — one "width the gate has
 * to prove compliance at" per regime, in addition to the unprefixed base.
 * @param {string} tagText
 * @returns {Set<string>}
 */
function scopedRegimes(tagText) {
  /** @type {Set<string>} */
  const regimes = new Set();
  const res = [
    shrinkDimensionRe('h'),
    shrinkDimensionRe('w'),
    shrinkDimensionRe('size'),
    INSET_RE,
    INSET_X_RE,
    INSET_Y_RE,
  ];
  for (const re of res) {
    for (const m of scopedEvidence(tagText, re)) {
      const regime = viewportVariantFor(tagText, m.index ?? 0);
      if (regime !== null) regimes.add(regime);
    }
  }
  return regimes;
}

/**
 * The unprefixed `max-h`/`max-w`/`max-size` ceiling for `prop` — a real base
 * shrink (POPS-2265), read separately from {@link dimensionRe}'s bare/`min-`
 * evidence because a ceiling caps a box rather than sizing one: `max-h-6`
 * alone, with no `h`/`size` evidence at all, proves nothing (there is nothing
 * to cap), so this is combined with a real reading via `Math.min`, never used
 * on its own. `size`'s own ceiling caps BOTH axes, same as `size-*` itself.
 * @param {string} tagText
 * @param {'h' | 'w'} prop
 * @returns {number | null}
 */
function baseBoxCeiling(tagText, prop) {
  const own = maxPx(baseEvidence(tagText, ceilingRe(prop)));
  const sizeCeiling = maxPx(baseEvidence(tagText, ceilingRe('size')));
  if (own === null) return sizeCeiling;
  if (sizeCeiling === null) return own;
  return Math.min(own, sizeCeiling);
}

/**
 * `prop`'s (`h`/`w`) OWN box reading at the unprefixed base: `h`/`size`
 * evidence combined via {@link combineWithSize}, capped by
 * {@link baseBoxCeiling} when a ceiling is present (POPS-2265). A ceiling
 * with no underlying reading proves nothing on its own — mirrors the base
 * evidence check's existing "a cap alone doesn't size anything" rule.
 * @param {string} tagText
 * @param {'h' | 'w'} prop
 * @returns {number | null}
 */
function baseBoxReading(tagText, prop) {
  const reading = combineWithSize(
    maxPx(baseEvidence(tagText, dimensionRe(prop))),
    maxPx(baseEvidence(tagText, dimensionRe('size')))
  );
  if (reading === null) return null;
  const ceiling = baseBoxCeiling(tagText, prop);
  return ceiling === null ? reading : Math.min(reading, ceiling);
}

/**
 * `regime`'s own `max-h`/`max-w`/`max-size` ceiling for `prop` — the scoped
 * mirror of {@link baseBoxCeiling} (POPS-2275). A scoped ceiling with no
 * reading anywhere to cap proves nothing on its own, same reasoning as the
 * base: this is only ever combined via `Math.min` with the CASCADED box
 * {@link resolveWithCascade} resolves for `regime` — see
 * {@link clampScopedBox} (POPS-2279) — never used by itself and never
 * combined with {@link scopedBoxReading}'s un-cascaded own-reading directly.
 * `size`'s own ceiling caps BOTH axes, same as `size-*` itself.
 * @param {string} tagText
 * @param {'h' | 'w'} prop
 * @param {string} regime
 * @returns {number | null}
 */
function scopedBoxCeiling(tagText, prop, regime) {
  const own = maxPx(matchesForRegime(tagText, ceilingRe(prop), regime));
  const sizeCeiling = maxPx(matchesForRegime(tagText, ceilingRe('size'), regime));
  if (own === null) return sizeCeiling;
  if (sizeCeiling === null) return own;
  return Math.min(own, sizeCeiling);
}

/**
 * `prop`'s (`h`/`w`) OWN box reading at `regime` — this regime's scoped bare
 * or arbitrary-pixel `h`/`size` reading, per {@link bareDimensionRe} —
 * deliberately NOT {@link dimensionRe} (whose `min-` arm is a FLOOR, not a
 * reading, see {@link scopedBoxFloor}) and NOT {@link shrinkDimensionRe}
 * (whose `max-` arm is a CEILING, see {@link scopedBoxCeiling}) — combined
 * via {@link combineWithSize}.
 *
 * A ceiling or a floor is deliberately NOT applied here (POPS-2279, reversing
 * PR #4166's POPS-2275 fix): this function is the value
 * {@link resolveWithCascade}'s step 2 short-circuits on — "if `regime` sets
 * the property itself, that wins" — so anything this function returns
 * BYPASSES the cascade entirely, including the fallback to the unprefixed
 * base or a wider same-family sibling. A `max-h`/`max-w`/`max-size` ceiling
 * caps whatever the cascade resolves the reading to; it is not an
 * alternative reading a regime can "set" on its own with no box evidence
 * behind it — `sm:max-h-96 sm:max-w-96` with only an unprefixed `h-6 w-6`
 * behind it renders the CASCADED 24px base box capped at 384px (still 24px,
 * still a failure), never 384px substituted in as `sm`'s own box: returning
 * the ceiling here (PR #4166's mistake) would have skipped the cascade
 * lookup that finds the real 24px reading, overstating the box. See
 * {@link isCompliantAtRegime}, which applies both {@link scopedBoxCeiling}
 * (via `Math.min`) and {@link scopedBoxFloor} (via `Math.max`) to the value
 * {@link resolveWithCascade} resolves for this function, not to this
 * function's own return value directly — a wider sibling's real reading, or
 * the unprefixed base's, must still be discoverable before either the
 * ceiling or the floor decorate it.
 * @param {string} tagText
 * @param {'h' | 'w'} prop
 * @param {string} regime
 * @returns {number | null}
 */
function scopedBoxReading(tagText, prop, regime) {
  return combineWithSize(
    maxPx(matchesForRegime(tagText, bareDimensionRe(prop), regime)),
    maxPx(matchesForRegime(tagText, bareDimensionRe('size'), regime))
  );
}

/**
 * `regime`'s own scoped `min-h`/`min-w`/`min-size` FLOOR for `prop`
 * (POPS-2282) — the scoped mirror of {@link scopedBoxCeiling}, read through
 * {@link floorDimensionRe} and combined via {@link combineWithSize} the same
 * way. Applied to the box {@link resolveWithCascade} resolves via
 * `Math.max`, never substituted as an alternative reading: a `min-` value is
 * a floor a box can never fall below, not a shrink, so `sm:min-w-0` must
 * never lower a 44px box the cascade otherwise resolves — the exact false
 * positive this fixes (a scoped `min-w-0` alongside `sm:h-16` used to read as
 * `sm`'s own 0px width via {@link dimensionRe}, short-circuiting
 * {@link resolveWithCascade} at a value `sm` never actually rendered). The
 * BASE reading intentionally keeps `min-` as ordinary evidence via
 * {@link dimensionRe} in {@link baseBoxReading} — there is no cascade at the
 * base to short-circuit, so a bare `min-h-11` really is the box the base
 * renders.
 * @param {string} tagText
 * @param {'h' | 'w'} prop
 * @param {string} regime
 * @returns {number | null}
 */
function scopedBoxFloor(tagText, prop, regime) {
  return combineWithSize(
    maxPx(matchesForRegime(tagText, floorDimensionRe(prop), regime)),
    maxPx(matchesForRegime(tagText, floorDimensionRe('size'), regime))
  );
}

/**
 * `axis`'s (`h`/`w`) OWN `before:-inset-*` reading at `regime` (or, for
 * `regime === null`, at the unprefixed base): this regime's per-axis reading
 * if it has one, else this regime's all-sides reading. No fallback beyond the
 * regime's own scope — the axis-before-all-sides order is the real cascade
 * confirmed against the pinned `tailwindcss@4.3.3`: an axis form emitted
 * after an all-sides one at equal specificity overrides only that axis, so
 * `before:-inset-9 before:-inset-x-0` renders 0px of horizontal expansion but
 * the unaltered 36px of vertical (POPS-2256).
 * @param {string} tagText
 * @param {'h' | 'w'} axis
 * @param {string | null} regime
 * @returns {number | null}
 */
function ownInsetReading(tagText, axis, regime) {
  const axisRe = axis === 'h' ? INSET_Y_RE : INSET_X_RE;
  if (regime === null) {
    return maxPx(baseEvidence(tagText, axisRe)) ?? maxPx(baseEvidence(tagText, INSET_RE));
  }
  return (
    maxPx(matchesForRegime(tagText, axisRe, regime)) ??
    maxPx(matchesForRegime(tagText, INSET_RE, regime))
  );
}

/**
 * Resolve one property's effective value for `regime`, cascading through
 * every OTHER live viewport-width regime on the same tag exactly the way
 * real overlapping CSS media queries do — this is the fix for POPS-2263.
 * Viewport-width regimes are not partitions: at 800px, `sm:`, `md:` and the
 * unprefixed base are all live simultaneously, and Tailwind's compiled
 * stylesheet orders same-direction breakpoints by threshold (`min-`
 * ascending, `max-` descending — confirmed against the pinned
 * `tailwindcss@4.3.3`) ONLY WITHIN a single spelling family (named, arbitrary
 * `min-[…]`/`max-[…]`, or `[@media…]`) — see {@link regimeFamily}. ACROSS
 * families that threshold claim is false (POPS-2274): arbitrary bracket
 * regimes emit ahead of every named one regardless of threshold, and
 * `[@media…]` regimes emit after all of them, so a cross-family pair cannot
 * be ordered by comparing pixel thresholds. Within a family, the WINNING
 * declaration for an unset property is the nearest WIDER regime of that same
 * family that still sets it, not the unprefixed base outright and not a
 * regime from a different family.
 *
 * `getOwn(regime)` reads one regime's OWN value with no fallback (see
 * {@link baseBoxReading}/{@link scopedBoxReading}/{@link ownInsetReading}).
 * The algorithm:
 *   1. `regime === null` (the base itself) has nothing wider to borrow from:
 *      return its own reading outright.
 *   2. If `regime` sets the property itself, that wins — nothing to resolve.
 *   3. Otherwise, walk every other regime this tag mentions. A same-KIND,
 *      same-FAMILY sibling (`min` vs `min`, `max` vs `max`, both resolvable
 *      via {@link regimeOrdering}, AND {@link regimeFamily} equal) whose
 *      threshold makes its domain a superset of `regime`'s (a
 *      smaller-or-equal min-width threshold, or a greater-or-equal max-width
 *      one) is a valid fallback source; among several, the NEAREST one
 *      (closest threshold) is the real cascade winner. A sibling that sets
 *      the property but is NOT a provable same-kind, same-family superset —
 *      a different kind (`min` vs `max`), a different spelling family (even
 *      at the same kind and a threshold that LOOKS like a superset), an
 *      unorderable arbitrary range, or an unresolved custom breakpoint name —
 *      is `interference`: its own domain overlaps `regime`'s in a way this
 *      cheap check cannot rule out, so borrowing the unprefixed base's value
 *      instead would be unproven. Per POPS-2263's/POPS-2274's "Done looks
 *      like": failing closed (returning `null`, which flags a box property
 *      immediately and contributes 0 expansion for an inset — never a false
 *      pass) is the correct direction here, not silently falling through to
 *      base or trusting a cross-family threshold comparison.
 *   4. If a same-kind, same-family superset resolved it, use that. Else, if
 *      there was no interference at all, fall through to the unprefixed
 *      base's own value — the ONLY case where jumping straight to base is
 *      actually proven correct. Else, return `null`.
 * @param {string | null} regime
 * @param {Set<string>} allRegimes every OTHER viewport-width regime this tag mentions
 * @param {(regime: string | null) => number | null} getOwn
 * @returns {number | null}
 */
function resolveWithCascade(regime, allRegimes, getOwn) {
  if (regime === null) return getOwn(null);
  const own = getOwn(regime);
  if (own !== null) return own;

  const ord = regimeOrdering(regime);
  /** @type {{ px: number, value: number } | null} */
  let bestSuperset = null;
  let interference = false;
  for (const other of allRegimes) {
    if (other === regime) continue;
    const otherValue = getOwn(other);
    if (otherValue === null) continue;
    const otherOrd = regimeOrdering(other);
    const sameFamily = regimeFamily(regime) === regimeFamily(other);
    if (ord && otherOrd && sameFamily && ord.kind === otherOrd.kind) {
      const isSuperset = ord.kind === 'min' ? otherOrd.px <= ord.px : otherOrd.px >= ord.px;
      if (isSuperset) {
        const nearer =
          bestSuperset === null ||
          (ord.kind === 'min' ? otherOrd.px > bestSuperset.px : otherOrd.px < bestSuperset.px);
        if (nearer) bestSuperset = { px: otherOrd.px, value: otherValue };
        continue;
      }
      continue; // other is a narrower subset of `regime` — evaluated on its own, not interference.
    }
    interference = true;
  }
  if (bestSuperset !== null) return bestSuperset.value;
  if (interference) return null;
  return getOwn(null);
}

/**
 * Apply `regime`'s own ceiling (via `Math.min`) and floor (via `Math.max`) to
 * a box value {@link resolveWithCascade} already resolved — the fix for
 * POPS-2279/POPS-2282: a ceiling or floor CAPS/RAISES whatever the cascade
 * resolves the reading to, it never substitutes for that reading, and it
 * never rescues a box that resolved to `null` (no reading exists anywhere for
 * the cascade to have found — a bare ceiling or floor proves nothing to
 * cap/raise on its own, mirroring {@link baseBoxReading}'s "a cap alone
 * proves nothing" rule). `regime === null` (the unprefixed base) is
 * untouched here: {@link baseBoxReading} already applies {@link
 * baseBoxCeiling} itself, and the base has no `min-` floor to apply since
 * {@link baseBoxReading} reads `min-` as ordinary evidence via
 * {@link dimensionRe} directly. Order matters when a ceiling and a floor both
 * apply and conflict (a floor above the ceiling): the ceiling is applied
 * first, the floor last, so the floor wins on conflict — the same
 * used-value order real CSS resolves `min-height`/`max-height` in.
 * @param {string} tagText
 * @param {'h' | 'w'} prop
 * @param {string | null} regime
 * @param {number | null} box
 * @returns {number | null}
 */
function clampScopedBox(tagText, prop, regime, box) {
  if (regime === null || box === null) return box;
  const ceiling = scopedBoxCeiling(tagText, prop, regime);
  const capped = ceiling === null ? box : Math.min(box, ceiling);
  const floor = scopedBoxFloor(tagText, prop, regime);
  return floor === null ? capped : Math.max(capped, floor);
}

/**
 * Does the box this element renders at `regime` (or, for `regime === null`,
 * at the unprefixed base) clear 44px on both axes, once `size-*` is combined
 * in and the `before:-inset-*` expansion is added? Both the box and the inset
 * are resolved through {@link resolveWithCascade} against `allRegimes` —
 * every viewport-width regime this tag mentions — so a property `regime`
 * doesn't set itself is filled from the nearest WIDER same-kind regime that
 * does, falling back to the unprefixed base only when no other live regime
 * could plausibly be supplying it instead (POPS-2263). This is the single
 * computation both the base-evidence check and every scoped regime run
 * through, which is what keeps a scoped `h`/`w`/`size` shrink and a scoped
 * inset shrink from being evaluated against two different boxes (POPS-2255):
 * `h-6 w-6 before:-inset-9 sm:h-11 sm:w-11 sm:before:-inset-0` evaluates the
 * `sm` regime's own `h-11`/`w-11` combined with `sm`'s own `-inset-0`, not
 * `sm`'s inset against the unprefixed `h-6`/`w-6`. `regime`'s own ceiling and
 * floor (see {@link clampScopedBox}) are applied to the CASCADED box, after
 * {@link resolveWithCascade} resolves it — never to a candidate reading
 * before the cascade sees it (POPS-2279/POPS-2282).
 * @param {string} tagText
 * @param {string | null} regime
 * @param {Set<string>} allRegimes
 * @returns {boolean}
 */
function isCompliantAtRegime(tagText, regime, allRegimes) {
  const hBox = clampScopedBox(
    tagText,
    'h',
    regime,
    resolveWithCascade(regime, allRegimes, (r) =>
      r === null ? baseBoxReading(tagText, 'h') : scopedBoxReading(tagText, 'h', r)
    )
  );
  const wBox = clampScopedBox(
    tagText,
    'w',
    regime,
    resolveWithCascade(regime, allRegimes, (r) =>
      r === null ? baseBoxReading(tagText, 'w') : scopedBoxReading(tagText, 'w', r)
    )
  );
  if (hBox === null || wBox === null) return false;

  const hInset = resolveWithCascade(regime, allRegimes, (r) => ownInsetReading(tagText, 'h', r));
  const wInset = resolveWithCascade(regime, allRegimes, (r) => ownInsetReading(tagText, 'w', r));
  const hExpansion = hInset === null ? 0 : hInset * 2;
  const wExpansion = wInset === null ? 0 : wInset * 2;

  return hBox + hExpansion >= 44 && wBox + wExpansion >= 44;
}

/**
 * Does this element's OWN opening-tag text prove its tappable area reaches
 * 44px on both axes at EVERY width — the unprefixed base, and every
 * viewport-width regime a scoped `h`/`w`/`size`/inset utility governs? A
 * single axis of evidence (only `w`, only `h`) is never sufficient on its
 * own: a wide link can still be a ~20px-tall line of text, and a tall
 * control with no width evidence can be a single narrow glyph. See
 * {@link isCompliantAtRegime} for how one width's box + inset expansion is
 * resolved across every regime this tag mentions at once, not just `regime`
 * paired with the unprefixed base.
 * @param {string} tagText
 * @returns {boolean}
 */
function isCompliant(tagText) {
  const allRegimes = scopedRegimes(tagText);
  if (!isCompliantAtRegime(tagText, null, allRegimes)) return false;
  for (const regime of allRegimes) {
    if (!isCompliantAtRegime(tagText, regime, allRegimes)) return false;
  }
  return true;
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
    // The gap this ticket closes: an otherwise-sufficient base shrunk below
    // 640px by a same-axis max-sm: variant — renders 24px at phone width.
    '<button className="h-11 w-11 max-sm:h-6 max-sm:w-6" onClick={onClick}>Row</button>',
    // The mirror: a sufficient base shrunk AT AND ABOVE 640px by sm: — a
    // touch laptop or landscape iPad renders 24px, not 44.
    '<button className="h-11 w-11 sm:h-6 sm:w-6" onClick={onClick}>Row</button>',
    // Arbitrary max-[…]: bound, same shrink shape.
    '<button className="h-11 w-11 max-[600px]:h-6 max-[600px]:w-6" onClick={onClick}>Row</button>',
    // Long-hand arbitrary max-width media form, same shrink shape.
    '<button className="h-11 w-11 [@media(max-width:600px)]:h-6 [@media(max-width:600px)]:w-6" onClick={onClick}>Row</button>',
    // Stacked variants: max-sm: composed with hover: still shrinks below 640px.
    '<button className="h-11 w-11 max-sm:hover:h-6 max-sm:hover:w-6" onClick={onClick}>Row</button>',
    // size-* shrink: one utility, both axes.
    '<button className="h-11 w-11 max-sm:size-6" onClick={onClick}>Row</button>',
    // CSS range media syntax with no unprefixed base — the sm:/max-sm: hole
    // reopened through a spelling isViewportWidthScopedVariant didn't know.
    '<button className="[@media(width<=640px)]:h-11 [@media(width<=640px)]:w-11" onClick={onClick}>Row</button>',
    // The underscore-for-space arbitrary spelling, same hole.
    '<button className="[@media_(min-width:640px)]:h-11 [@media_(min-width:640px)]:w-11" onClick={onClick}>Row</button>',
    // CSS range media syntax shrinking an otherwise-sufficient base.
    '<button className="h-11 w-11 [@media(width<=600px)]:h-6 [@media(width<=600px)]:w-6" onClick={onClick}>Row</button>',
    // A scoped max-h/max-w IS a real shrink — a ceiling caps the box below
    // its base size at the width the variant governs.
    '<button className="h-11 w-11 sm:max-h-6 sm:max-w-6" onClick={onClick}>Row</button>',
    // The gap POPS-2224 closes: an unprefixed before:-inset-* proves 96px
    // (24 + 2*36), but max-sm:before:-inset-0 renders 24px below 640px.
    '<button className="h-6 w-6 before:-inset-9 max-sm:before:-inset-0" onClick={onClick}><XIcon /></button>',
    // POPS-2256: the per-axis before:-inset-x-* collapses only the WIDTH
    // expansion below 640px — 24px wide, even though the height is still 96.
    '<button className="h-6 w-6 before:-inset-9 max-sm:before:-inset-x-0" onClick={onClick}><XIcon /></button>',
    // POPS-2256: the mirror, before:-inset-y-* collapsing only the HEIGHT.
    '<button className="h-6 w-6 before:-inset-9 max-sm:before:-inset-y-0" onClick={onClick}><XIcon /></button>',
    // POPS-2253: a media TYPE ahead of the feature list — no unprefixed base
    // at all, so this is unsized below 640px exactly like sm: alone.
    '<button className="[@media_screen_and_(min-width:640px)]:h-11 [@media_screen_and_(min-width:640px)]:w-11" onClick={onClick}>Row</button>',
    // POPS-2253: "only screen and", same hole.
    '<button className="[@media_only_screen_and_(min-width:640px)]:h-11 [@media_only_screen_and_(min-width:640px)]:w-11" onClick={onClick}>Row</button>',
    // POPS-2253: a sufficient base shrunk by a media-type-prefixed max-width query.
    '<button className="h-11 w-11 [@media_screen_and_(max-width:600px)]:h-6 [@media_screen_and_(max-width:600px)]:w-6" onClick={onClick}>Row</button>',
    // POPS-2263: TWO min-width regimes at once — sm supplies the box, md
    // supplies only the inset. md's own inset (0) must combine with sm's
    // box (24, the nearest WIDER same-kind regime), not the unprefixed
    // base's 44 — the exact mix the restructure's docstring claims it stops.
    '<button className="h-11 w-11 sm:h-6 sm:w-6 sm:before:-inset-9 md:before:-inset-0" onClick={onClick}>Row</button>',
    // POPS-2263: the inset side of the same hole — md supplies its OWN box
    // (24) but no inset of its own, so its inset must come from sm (the
    // nearest wider regime, 0), not the unprefixed before:-inset-9.
    '<button className="h-6 w-6 before:-inset-9 sm:h-11 sm:w-11 sm:before:-inset-0 md:h-6 md:w-6" onClick={onClick}>Row</button>',
    // POPS-2263: the max-width mirror — max-sm supplies only the inset,
    // max-md (the nearest WIDER max-width regime) must supply the box.
    '<button className="h-11 w-11 max-md:h-6 max-md:w-6 max-md:before:-inset-9 max-sm:before:-inset-0" onClick={onClick}>Row</button>',
    // POPS-2263: an unorderable two-sided arbitrary range overlapping a
    // named min-width regime — the range's own box is unresolved and sm is
    // not a provable same-kind superset, so this must fail closed (flag)
    // rather than silently trusting the unprefixed base.
    '<button className="h-11 w-11 sm:h-6 sm:w-6 sm:before:-inset-9 [@media(400px<=width<=700px)]:before:-inset-0" onClick={onClick}>Row</button>',
    // POPS-2273: not-sm: with no unprefixed base at all — unsized at every
    // width >= 640px, the fourth recurrence of the enumeration gap.
    '<button className="not-sm:h-11 not-sm:w-11" onClick={onClick}>Row</button>',
    // POPS-2273: not-max-sm: with no unprefixed base at all.
    '<button className="not-max-sm:h-11 not-max-sm:w-11" onClick={onClick}>Row</button>',
    // POPS-2273: not-min-[…]: with no unprefixed base at all.
    '<button className="not-min-[640px]:h-11 not-min-[640px]:w-11" onClick={onClick}>Row</button>',
    // POPS-2273: min-sm: with no unprefixed base at all — identical in effect
    // to bare sm:, unsized below 640px.
    '<button className="min-sm:h-11 min-sm:w-11" onClick={onClick}>Row</button>',
    // POPS-2273: a sufficient base shrunk by not-sm: (live below 640px).
    '<button className="h-11 w-11 not-sm:h-6 not-sm:w-6" onClick={onClick}>Row</button>',
    // POPS-2273: a sufficient base shrunk by not-max-sm: (live at/above 640px).
    '<button className="h-11 w-11 not-max-sm:h-6 not-max-sm:w-6" onClick={onClick}>Row</button>',
    // POPS-2273: a sufficient base shrunk by min-sm:.
    '<button className="h-11 w-11 min-sm:h-6 min-sm:w-6" onClick={onClick}>Row</button>',
    // POPS-2273: a sufficient before:-inset-* expansion collapsed by not-sm:.
    '<button className="h-6 w-6 before:-inset-9 not-sm:before:-inset-0" onClick={onClick}><XIcon /></button>',
    // POPS-2273: the same, collapsed by min-sm:.
    '<button className="h-6 w-6 before:-inset-9 min-sm:before:-inset-0" onClick={onClick}><XIcon /></button>',
    // POPS-2274: an arbitrary min-[…] regime sorts AHEAD of a named min-width
    // regime in the compiled sheet regardless of threshold — min-[700px]
    // must never be treated as a narrower subset of sm just because 700 > 640.
    '<button className="h-11 w-11 min-[700px]:h-6 min-[700px]:w-6 min-[700px]:before:-inset-9 sm:before:-inset-0" onClick={onClick}>Row</button>',
    // POPS-2274: a [@media…] regime sorts AFTER every named regime — md must
    // never be treated as a narrower subset of [@media(min-width:720px)].
    '<button className="h-11 w-11 md:h-6 md:w-6 md:before:-inset-9 [@media(min-width:720px)]:before:-inset-0" onClick={onClick}>Row</button>',
    // POPS-2274: the max-width mirror — an arbitrary max-[…] regime sorts
    // ahead of a named max-width regime regardless of threshold.
    '<button className="h-11 w-11 max-[600px]:h-6 max-[600px]:w-6 max-[600px]:before:-inset-9 max-sm:before:-inset-0" onClick={onClick}>Row</button>',
    // POPS-2275: a scoped bare reading capped by a scoped ceiling in the SAME
    // regime — a ceiling is a cap, not a competing alternative reading.
    '<button className="h-11 w-11 sm:h-11 sm:w-11 sm:max-h-6 sm:max-w-6" onClick={onClick}>Row</button>',
    // POPS-2275: a scoped size-* reading capped by a scoped max-h/max-w ceiling.
    '<button className="h-11 w-11 sm:size-11 sm:max-h-8 sm:max-w-8" onClick={onClick}>Row</button>',
    // POPS-2275: the max-sm: (phone-width) mirror of the same shape.
    '<button className="h-11 w-11 max-sm:size-11 max-sm:max-h-6 max-sm:max-w-6" onClick={onClick}>Row</button>',
    // POPS-2279: a scoped ceiling with no reading of its own must CAP the
    // cascaded 24px base box, not substitute a 384px reading in its place —
    // renders 24x24 at every width >= 640px.
    '<button className="h-6 w-6 before:-inset-9 sm:max-h-96 sm:max-w-96 sm:before:-inset-0" onClick={onClick}><XIcon /></button>',
    // POPS-2279: the max-sm: (phone-width) mirror of the same ceiling-vs-cap bug.
    '<button className="h-6 w-6 before:-inset-9 max-sm:max-h-96 max-sm:max-w-96 max-sm:before:-inset-0" onClick={onClick}><XIcon /></button>',
    // POPS-2279: an arbitrary pixel ceiling reproduces the same bug.
    '<button className="h-6 w-6 before:-inset-9 sm:max-h-[48px] sm:max-w-[48px] sm:before:-inset-0" onClick={onClick}><XIcon /></button>',
    // POPS-2279: a per-axis inset collapse alongside a ceiling on only ONE axis.
    '<button className="h-6 w-6 before:-inset-9 sm:max-w-96 sm:before:-inset-x-0" onClick={onClick}><XIcon /></button>',
    // POPS-2281: a banded sm:max-md: token's real domain is the intersection
    // [640px, 768px) — at and above 768px it is absent, so the box falls
    // back to the unprefixed 24px base while sm:before:-inset-0 still zeroes
    // the expansion. Filing this under sm's full [640px, infinity) domain
    // (an earlier `.find()`-based implementation's bug) wrongly proved it
    // compliant at 768px+.
    '<button className="h-6 w-6 before:-inset-9 sm:max-md:h-11 sm:max-md:w-11 sm:before:-inset-0" onClick={onClick}><XIcon /></button>',
    // POPS-2281: the reversed segment order of the same band.
    '<button className="h-6 w-6 before:-inset-9 max-md:sm:h-11 max-md:sm:w-11 sm:before:-inset-0" onClick={onClick}><XIcon /></button>',
    // POPS-2281: a not-*-wrapped band is still a two-sided-equivalent domain
    // this scanner cannot cheaply order — must fail closed the same way.
    '<button className="h-6 w-6 before:-inset-9 not-sm:max-md:h-11 not-sm:max-md:w-11 sm:before:-inset-0" onClick={onClick}><XIcon /></button>',
    // POPS-2282 (regression control): a scoped min- utility must still be
    // read as a floor, not a competing reading, once the SAME regime also
    // carries a real bare reading that would otherwise be shrunk if min-
    // were misread as 0 and combined the wrong way — an unrelated axis
    // shrunk by a real max-sm: utility must still be caught.
    '<button className="h-11 w-11 max-sm:h-6 max-sm:w-6 max-sm:min-w-0" onClick={onClick}>Row</button>',
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
    // A scoped min-w-0/min-h-0 is a floor, not a shrink — it is a no-op
    // against an already-sufficient base. These two do NOT independently
    // register sm/max-sm as a regime at all (shrinkDimensionRe excludes
    // min-), so they exercise nothing on their own (POPS-2282) — kept only
    // as a "does not crash / stays silent regardless" control; the pair
    // below is what actually proves the invariant.
    '<button className="h-11 w-11 sm:min-w-0" onClick={onClick}>Row</button>',
    '<button className="h-11 w-11 max-sm:min-w-0" onClick={onClick}>Row</button>',
    // POPS-2282: the regime-independently-registered version of the same
    // invariant — sm IS registered here (by sm:h-16), so scopedBoxReading
    // must still treat sm:min-w-0 as a FLOOR applied to the cascaded
    // width (44, borrowed from the base since sm sets no bare w reading of
    // its own), not as an alternative 0px reading that would short-circuit
    // the cascade and wrongly flag a compliant control.
    '<button className="h-11 w-11 sm:h-16 sm:min-w-0" onClick={onClick}>Row</button>',
    // POPS-2282: the max-sm: mirror, floor on the OTHER axis.
    '<button className="h-11 w-11 max-sm:w-16 max-sm:min-h-0" onClick={onClick}>Row</button>',
    // A scoped before:-inset-* whose magnitude shrinks relative to the
    // unprefixed one but combined with the box still clears the floor.
    '<button className="h-6 w-6 before:-inset-9 max-sm:before:-inset-4" onClick={onClick}><XIcon /></button>',
    // A scoped before:-inset-* that only grows the expansion further.
    '<button className="h-6 w-6 before:-inset-9 sm:before:-inset-12" onClick={onClick}><XIcon /></button>',
    // POPS-2255: the canonical fix idiom — compact box + inset expansion
    // below 640px, a real 44px box with no expansion needed at/above it. The
    // sm regime's OWN h-11/w-11, not the unprefixed h-6/w-6, is what the
    // sm:before:-inset-0 combines against.
    '<button className="h-6 w-6 before:-inset-9 sm:h-11 sm:w-11 sm:before:-inset-0" onClick={onClick}><XIcon /></button>',
    // POPS-2255: the max-sm: mirror of the same idiom.
    '<button className="h-11 w-11 max-sm:h-6 max-sm:w-6 max-sm:before:-inset-9" onClick={onClick}>Row</button>',
    // POPS-2263: TWO min-width regimes that only ever grow the box further —
    // multi-regime evaluation must not manufacture a false positive when
    // nothing shrinks.
    '<button className="h-11 w-11 sm:h-16 sm:w-16 md:h-20 md:w-20" onClick={onClick}>Row</button>',
    // POPS-2263: the cascade genuinely RESCUES compliance — md sets no box
    // of its own, but sm (the nearest wider min-width regime) really does
    // render a 44px box there, so borrowing sm's box (not the unprefixed
    // 24px base) is the correct, non-flagging answer.
    '<button className="h-6 w-6 before:-inset-9 sm:h-11 sm:w-11 sm:before:-inset-0 md:before:-inset-0" onClick={onClick}><XIcon /></button>',
    // POPS-2263: the max-width mirror of the cascade rescue — max-sm reuses
    // (not shrinks) the inset and borrows its box from max-md.
    '<button className="h-11 w-11 max-md:h-6 max-md:w-6 max-md:before:-inset-9 max-sm:before:-inset-9" onClick={onClick}>Row</button>',
    // POPS-2273: not-sm: only ever grows an already-sufficient base further.
    '<button className="h-11 w-11 not-sm:h-16 not-sm:w-16" onClick={onClick}>Row</button>',
    // POPS-2273: min-sm: only ever grows an already-sufficient base further.
    '<button className="h-11 w-11 min-sm:h-16 min-sm:w-16" onClick={onClick}>Row</button>',
    // POPS-2275: a scoped ceiling whose magnitude is still >= 44px is not a shrink.
    '<button className="h-11 w-11 sm:h-11 sm:w-11 sm:max-h-16 sm:max-w-16" onClick={onClick}>Row</button>',
    // POPS-2279: a scoped ceiling still >= 44px applied to a cascaded
    // reading (not a substituted one) does not shrink anything.
    '<button className="h-11 w-11 sm:max-h-96 sm:max-w-96" onClick={onClick}>Row</button>',
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
    'reports a sufficient base shrunk below 640px by same-axis max-sm:': dirtyHits.some(
      (v) => v.line === 13
    ),
    'reports a sufficient base shrunk at/above 640px by same-axis sm: (the mirror)': dirtyHits.some(
      (v) => v.line === 14
    ),
    'reports a sufficient base shrunk by an arbitrary max-[…]: bound': dirtyHits.some(
      (v) => v.line === 15
    ),
    'reports a sufficient base shrunk by the long-hand [@media(max-width:...)] form':
      dirtyHits.some((v) => v.line === 16),
    'reports a sufficient base shrunk by a stacked max-sm:hover: variant': dirtyHits.some(
      (v) => v.line === 17
    ),
    'reports a sufficient base shrunk by max-sm:size-* (one utility, both axes)': dirtyHits.some(
      (v) => v.line === 18
    ),
    'reports a button gated only by a CSS range media variant ([@media(width<=640px)]:)':
      dirtyHits.some((v) => v.line === 19),
    'reports a button gated only by the underscore-for-space arbitrary media spelling':
      dirtyHits.some((v) => v.line === 20),
    'reports a sufficient base shrunk by a CSS range media variant': dirtyHits.some(
      (v) => v.line === 21
    ),
    'reports a sufficient base shrunk by a scoped max-h/max-w (a ceiling, a real shrink)':
      dirtyHits.some((v) => v.line === 22),
    'reports a sufficient before:-inset-* expansion shrunk below 640px by max-sm:before:-inset-0':
      dirtyHits.some((v) => v.line === 23),
    'reports a sufficient before:-inset-* expansion collapsed on the WIDTH axis only by max-sm:before:-inset-x-0':
      dirtyHits.some((v) => v.line === 24),
    'reports a sufficient before:-inset-* expansion collapsed on the HEIGHT axis only by max-sm:before:-inset-y-0':
      dirtyHits.some((v) => v.line === 25),
    'reports a button gated only by a [@media_screen_and_(...)] media-type variant': dirtyHits.some(
      (v) => v.line === 26
    ),
    'reports a button gated only by a [@media_only_screen_and_(...)] media-type variant':
      dirtyHits.some((v) => v.line === 27),
    'reports a sufficient base shrunk by a [@media_screen_and_(max-width:...)] media-type variant':
      dirtyHits.some((v) => v.line === 28),
    'reports two min-width regimes mixing across scopes: md borrows sm own box, not the unprefixed base (POPS-2263)':
      dirtyHits.some((v) => v.line === 29),
    'reports the inset-side mirror: md own box paired with sm own inset, not the unprefixed one (POPS-2263)':
      dirtyHits.some((v) => v.line === 30),
    'reports the max-width mirror: max-sm borrows max-md own box (POPS-2263)': dirtyHits.some(
      (v) => v.line === 31
    ),
    'reports an unorderable two-sided arbitrary range overlapping a named regime as unresolved, failing closed (POPS-2263)':
      dirtyHits.some((v) => v.line === 32),
    'reports not-sm: with no unprefixed base at all (POPS-2273)': dirtyHits.some(
      (v) => v.line === 33
    ),
    'reports not-max-sm: with no unprefixed base at all (POPS-2273)': dirtyHits.some(
      (v) => v.line === 34
    ),
    'reports not-min-[…]: with no unprefixed base at all (POPS-2273)': dirtyHits.some(
      (v) => v.line === 35
    ),
    'reports min-sm: with no unprefixed base at all (POPS-2273)': dirtyHits.some(
      (v) => v.line === 36
    ),
    'reports a sufficient base shrunk by not-sm: (POPS-2273)': dirtyHits.some((v) => v.line === 37),
    'reports a sufficient base shrunk by not-max-sm: (POPS-2273)': dirtyHits.some(
      (v) => v.line === 38
    ),
    'reports a sufficient base shrunk by min-sm: (POPS-2273)': dirtyHits.some((v) => v.line === 39),
    'reports a sufficient before:-inset-* expansion collapsed by not-sm: (POPS-2273)':
      dirtyHits.some((v) => v.line === 40),
    'reports a sufficient before:-inset-* expansion collapsed by min-sm: (POPS-2273)':
      dirtyHits.some((v) => v.line === 41),
    'reports an arbitrary min-[…] regime wrongly treated as a narrower subset of a named min-width regime it actually sorts ahead of (POPS-2274)':
      dirtyHits.some((v) => v.line === 42),
    'reports a [@media…] regime wrongly treated as a narrower subset of a named regime it actually sorts after (POPS-2274)':
      dirtyHits.some((v) => v.line === 43),
    'reports the max-width mirror: an arbitrary max-[…] regime wrongly treated as a narrower subset of a named max-width regime (POPS-2274)':
      dirtyHits.some((v) => v.line === 44),
    'reports a scoped bare reading capped by a scoped ceiling in the same regime, not laundered as an alternative reading (POPS-2275)':
      dirtyHits.some((v) => v.line === 45),
    'reports a scoped size-* reading capped by a scoped max-h/max-w ceiling (POPS-2275)':
      dirtyHits.some((v) => v.line === 46),
    'reports the max-sm: mirror of a scoped reading capped by a scoped ceiling (POPS-2275)':
      dirtyHits.some((v) => v.line === 47),
    'reports a scoped ceiling with no reading of its own CAPPING the cascaded base reading, not substituting for it (POPS-2279)':
      dirtyHits.some((v) => v.line === 48),
    'reports the max-sm: mirror of the ceiling-caps-not-substitutes fix (POPS-2279)':
      dirtyHits.some((v) => v.line === 49),
    'reports an arbitrary pixel ceiling with the same ceiling-caps-not-substitutes bug (POPS-2279)':
      dirtyHits.some((v) => v.line === 50),
    'reports a per-axis ceiling-caps-not-substitutes shrink (POPS-2279)': dirtyHits.some(
      (v) => v.line === 51
    ),
    'reports a banded sm:max-md: token evaluated against its real intersection domain, not filed under sm alone (POPS-2281)':
      dirtyHits.some((v) => v.line === 52),
    'reports the reversed segment order of the same band (POPS-2281)': dirtyHits.some(
      (v) => v.line === 53
    ),
    'reports a not-*-wrapped band failing closed the same way (POPS-2281)': dirtyHits.some(
      (v) => v.line === 54
    ),
    'reports a real max-sm: shrink even alongside an unrelated scoped min-w-0 floor in the same regime (POPS-2282 regression control)':
      dirtyHits.some((v) => v.line === 55),
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
    'stays silent on a scoped min-w-0 (sm: direction, a floor, not a shrink)': !cleanHits.some(
      (v) => v.line === 7
    ),
    'stays silent on a scoped min-w-0 (max-sm: direction, a floor, not a shrink)': !cleanHits.some(
      (v) => v.line === 8
    ),
    'stays silent on a scoped min-w-0 that DOES independently register its regime (POPS-2282: the non-vacuous version — sm:h-16 registers sm, sm:min-w-0 must still act as a floor on the cascaded width, not a competing 0px reading)':
      !cleanHits.some((v) => v.line === 9),
    'stays silent on the max-sm: mirror of the non-vacuous min- floor (POPS-2282)': !cleanHits.some(
      (v) => v.line === 10
    ),
    'stays silent when a scoped before:-inset-* shrinks the magnitude but the expansion still clears the floor':
      !cleanHits.some((v) => v.line === 11),
    'stays silent when a scoped before:-inset-* only grows the expansion further': !cleanHits.some(
      (v) => v.line === 12
    ),
    'stays silent on the canonical fix idiom: compact box + inset below 640px, a real box with no inset needed at/above it (sm regime combines with its OWN box, not the unprefixed one)':
      !cleanHits.some((v) => v.line === 13),
    'stays silent on the max-sm: mirror of the same idiom': !cleanHits.some((v) => v.line === 14),
    'stays silent on two min-width regimes that only ever grow further (POPS-2263)':
      !cleanHits.some((v) => v.line === 15),
    'stays silent when the cascade genuinely rescues compliance: md borrows sm real 44px box (POPS-2263)':
      !cleanHits.some((v) => v.line === 16),
    'stays silent on the max-width mirror of the cascade rescue (POPS-2263)': !cleanHits.some(
      (v) => v.line === 17
    ),
    'stays silent when not-sm: only ever grows an already-sufficient base further (POPS-2273)':
      !cleanHits.some((v) => v.line === 18),
    'stays silent when min-sm: only ever grows an already-sufficient base further (POPS-2273)':
      !cleanHits.some((v) => v.line === 19),
    'stays silent on a scoped ceiling whose magnitude is still >= 44px (POPS-2275)':
      !cleanHits.some((v) => v.line === 20),
    'stays silent on a scoped ceiling applied to a CASCADED reading (not substituted for it) that is still >= 44px (POPS-2279)':
      !cleanHits.some((v) => v.line === 21),
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
