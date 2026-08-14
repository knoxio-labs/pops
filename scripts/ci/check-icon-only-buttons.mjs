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
 * non-empty, statically-known `aria-label`/`aria-labelledby`. A quoted string
 * literal decides either attribute whether it's bare (`size="icon"`) or
 * brace-wrapped (`size={'icon'}`); an empty string or a literal `undefined`
 * does not count as a label.
 *
 * `aria-label`/`aria-labelledby` additionally understands a ternary
 * (`cond ? A : B`), a nullish-coalescing expression (`A ?? B`), and a
 * logical-AND expression (`A && B`), each recursively — including nested
 * combinations. The rule for each shape:
 *   - Ternary: reports when EITHER branch is a decidable empty literal
 *     (`""` or `undefined`/`null`), in either position — a reversed ternary
 *     (`cond ? "" : "Close"`) is caught the same as the direct one. Only
 *     passes clean when BOTH branches are decidably non-empty.
 *   - `A ?? B`: if `A` is a decidable non-nullish literal, its own value
 *     decides the whole expression (`?? ` never reaches `B`). If `A` is
 *     decidably nullish (`undefined`/`null`), `B` decides it. If `A` is not
 *     statically decidable (the common case — a variable), the expression is
 *     reported only when `B` is a decidable empty literal, since a nullish
 *     `A` at runtime would then produce that empty `B`.
 *   - `A && B`: unless `A` is a decidable non-empty, non-nullish literal
 *     (so provably always truthy), the guard reports — `&&` has no path that
 *     reaches `B` when `A` is falsy, and a plain condition (`cond && 'X'`)
 *     can always be falsy at runtime, leaving the button unlabelled in that
 *     branch. This deliberately flags the common `cond && 'Label'` idiom on
 *     an icon-only button; the same idiom passes silently once given a
 *     genuinely-always-truthy left side, which realistic code never has.
 *
 * A value this guard still can't resolve after that (a bare variable, a
 * template with interpolation, or — inside a ternary — two branches that are
 * both unresolvable, e.g. `cond ? labelA : labelB`) is not statically
 * decidable and is treated as present rather than guessed at: **fail-open**,
 * deliberately, the same trade-off the guard already makes for a dynamic
 * `size`. False negatives here are safer than false positives on a required
 * check — flagging every `aria-label={computedLabel}` call site would either
 * get this guard disabled or trained-around, and it cannot see runtime
 * values to do better. A conditional whose two branches are BOTH bare,
 * unresolvable identifiers falls into exactly this bucket and is not
 * flagged, on the same reasoning.
 *
 * Literal `false`/`0`/`NaN` branches (rather than `""`/`undefined`/`null`)
 * are not modelled as decidably-empty — they fall into the same "not
 * statically decidable" bucket as any other non-string-literal expression,
 * which is the fail-open path above, applied consistently rather than
 * special-cased.
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
 * Matches a `size=` or `aria-label=`/`aria-labelledby=` attribute, anchored
 * so a prefixed lookalike (`data-aria-label`, `iconSize`) never matches: the
 * lookbehind rejects an attribute name preceded by a word character or a
 * hyphen. Captures the raw value text — a quoted string or a `{…}`
 * expression — for the caller to interpret.
 *
 * @param {string} attrName
 * @returns {RegExp}
 */
function attrValueRe(attrName) {
  return new RegExp(
    `(?<![\\w-])${attrName}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\\{[^}]*\\})`,
    'g'
  );
}

const SIZE_ATTR_RE = attrValueRe('size');
const ARIA_LABEL_ATTR_RE = attrValueRe('aria-label(?:ledby)?');

/**
 * A quoted string literal's content, or `null` if `text` isn't one. Used
 * both directly on an attribute value and on the inner text of a `{…}`
 * expression, so `size={'icon'}` decides the same way `size="icon"` does.
 *
 * @param {string} text
 * @returns {string | null}
 */
function stringLiteralContent(text) {
  const trimmed = text.trim();
  const match = /^(["'`])([\s\S]*)\1$/.exec(trimmed);
  return match ? match[2] : null;
}

/**
 * Resolve an attribute's raw captured value to a statically-known string, or
 * `null` when it isn't one (a variable, a template with interpolation, a
 * ternary — anything this guard can't evaluate). Handles both a bare quoted
 * literal (`"icon"`) and a brace-wrapped literal (`{'icon'}`); a brace-wrapped
 * `undefined` resolves to the empty string, matching how it renders.
 *
 * @param {string} raw
 * @returns {string | null}
 */
function resolveStaticValue(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner === 'undefined') return '';
    return stringLiteralContent(inner);
  }
  return stringLiteralContent(trimmed);
}

/**
 * @typedef {'empty' | 'nonempty' | 'unknown'} LabelVerdict
 */

/**
 * @typedef {'nullish' | 'emptyString' | 'nonEmptyString' | 'unknown'} LeafKind
 */

/**
 * Classify one leaf sub-expression: a quoted string literal, the literal
 * `undefined`/`null`, or anything else this guard doesn't model.
 *
 * @param {string} text
 * @returns {LeafKind}
 */
function classifyLeaf(text) {
  const trimmed = text.trim();
  if (trimmed === 'undefined' || trimmed === 'null') return 'nullish';
  const literal = stringLiteralContent(trimmed);
  if (literal !== null) return literal.trim() === '' ? 'emptyString' : 'nonEmptyString';
  return 'unknown';
}

/**
 * @param {LeafKind} kind
 * @returns {LabelVerdict}
 */
function leafVerdict(kind) {
  if (kind === 'nullish' || kind === 'emptyString') return 'empty';
  if (kind === 'nonEmptyString') return 'nonempty';
  return 'unknown';
}

/**
 * Strip matching, fully-enclosing outer parentheses, repeatedly.
 *
 * @param {string} text
 * @returns {string}
 */
function unwrapParens(text) {
  let current = text.trim();
  while (current.startsWith('(') && current.endsWith(')') && isFullyParenWrapped(current)) {
    current = current.slice(1, -1).trim();
  }
  return current;
}

/**
 * Does `text`'s leading `(` close only at its final character — i.e. does
 * one pair of parens wrap the whole string, rather than just its start?
 *
 * @param {string} text
 * @returns {boolean}
 */
function isFullyParenWrapped(text) {
  let depth = 0;
  /** @type {"'" | '"' | '`' | null} */
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0 && i !== text.length - 1) return false;
    }
  }
  return depth === 0;
}

/**
 * Find a top-level ternary's `cond`, `then` (after `?`), and `else` (after
 * the matching `:`) in `text` — outside strings/templates and outside any
 * `(...)`/`[...]`/`{...}` nesting. Skips `?.` (optional chaining) and `??`
 * (nullish coalescing) so they never get mistaken for a ternary `?`. Tracks
 * a ternary-depth counter so `a ? b ? x : y : z` resolves to the outer split
 * (cond `a`, then `b ? x : y`, else `z`), matching JS's right-associativity.
 *
 * @param {string} text
 * @returns {{ cond: string, whenTrue: string, whenFalse: string } | null}
 */
function findTopLevelTernary(text) {
  let depth = 0;
  /** @type {"'" | '"' | '`' | null} */
  let quote = null;
  let ternaryDepth = 0;
  let questionIndex = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;
    if (ch === '?') {
      if (text[i + 1] === '.' || text[i + 1] === '?') {
        i += 1;
        continue;
      }
      if (questionIndex === -1) questionIndex = i;
      ternaryDepth += 1;
      continue;
    }
    if (ch === ':' && ternaryDepth > 0) {
      ternaryDepth -= 1;
      if (ternaryDepth === 0) {
        return {
          cond: text.slice(0, questionIndex),
          whenTrue: text.slice(questionIndex + 1, i),
          whenFalse: text.slice(i + 1),
        };
      }
    }
  }
  return null;
}

/**
 * Find the first top-level occurrence of a binary operator (`&&` or `??`) in
 * `text`, outside strings/templates and outside any bracket nesting.
 *
 * @param {string} text
 * @param {'&&' | '??'} op
 * @returns {{ left: string, right: string } | null}
 */
function findTopLevelBinary(text, op) {
  let depth = 0;
  /** @type {"'" | '"' | '`' | null} */
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) continue;
    if (text.startsWith(op, i)) {
      return { left: text.slice(0, i), right: text.slice(i + op.length) };
    }
  }
  return null;
}

/**
 * Resolve a brace-expression's inner text to a {@link LabelVerdict},
 * recursing through a top-level ternary, `??`, or `&&` per the rules
 * documented in this file's header comment. Falls back to leaf
 * classification (a string literal or `undefined`/`null`) when the
 * expression is none of those shapes.
 *
 * @param {string} text
 * @returns {LabelVerdict}
 */
function resolveExpr(text) {
  const unwrapped = unwrapParens(text);

  const ternary = findTopLevelTernary(unwrapped);
  if (ternary) {
    const thenVerdict = resolveExpr(ternary.whenTrue);
    const elseVerdict = resolveExpr(ternary.whenFalse);
    if (thenVerdict === 'empty' || elseVerdict === 'empty') return 'empty';
    if (thenVerdict === 'nonempty' && elseVerdict === 'nonempty') return 'nonempty';
    return 'unknown';
  }

  const nullish = findTopLevelBinary(unwrapped, '??');
  if (nullish) {
    const leftKind = classifyLeaf(unwrapParens(nullish.left));
    if (leftKind === 'nullish') return resolveExpr(nullish.right);
    if (leftKind === 'emptyString') return 'empty';
    if (leftKind === 'nonEmptyString') return 'nonempty';
    return resolveExpr(nullish.right) === 'empty' ? 'empty' : 'unknown';
  }

  const and = findTopLevelBinary(unwrapped, '&&');
  if (and) {
    const leftKind = classifyLeaf(unwrapParens(and.left));
    if (leftKind === 'nullish' || leftKind === 'emptyString') return 'empty';
    if (leftKind === 'nonEmptyString') return resolveExpr(and.right);
    return 'empty';
  }

  return leafVerdict(classifyLeaf(unwrapped));
}

/**
 * Resolve one captured `aria-label`/`aria-labelledby` attribute value (the
 * raw text between `=` and the next attribute) to a {@link LabelVerdict}.
 *
 * @param {string} raw
 * @returns {LabelVerdict}
 */
function resolveLabelVerdict(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return resolveExpr(trimmed.slice(1, -1));
  }
  const literal = stringLiteralContent(trimmed);
  if (literal === null) return 'unknown';
  return literal.trim() === '' ? 'empty' : 'nonempty';
}

/**
 * Does this opening tag carry a statically-decidable, non-empty accessible
 * name via `aria-label` or `aria-labelledby`? See this file's header
 * comment for the ternary/`??`/`&&` rules and the fail-open rule for a value
 * this guard still can't resolve after applying them.
 *
 * @param {string} tag
 * @returns {boolean}
 */
function hasAccessibleName(tag) {
  for (const match of tag.matchAll(ARIA_LABEL_ATTR_RE)) {
    const verdict = resolveLabelVerdict(match[1]);
    if (verdict === 'nonempty' || verdict === 'unknown') return true;
  }
  return false;
}

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
    SIZE_ATTR_RE.lastIndex = 0;
    const sizeAttrMatch = SIZE_ATTR_RE.exec(tag);
    if (!sizeAttrMatch) continue;
    const size = resolveStaticValue(sizeAttrMatch[1]);
    if (size === null || !ICON_SIZE_RE.test(size)) continue;
    if (hasAccessibleName(tag)) continue;
    violations.push({
      file: relPath,
      line: source.slice(0, match.index).split('\n').length,
      component: match[1],
      size,
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
 * is present, stays silent on a non-icon size or a title-only button, does
 * not desync on a `>` inside an attribute expression, and does not treat an
 * empty, whitespace-only, undefined, or decoy (`data-aria-label`) attribute
 * as a real accessible name — while still deciding a brace-wrapped string
 * literal size and accepting a valid `aria-labelledby`. Also proves it
 * decides a ternary (direct and reversed), `??`, and `&&` aria-label per the
 * rules in this file's header, and stays fail-open on the one case that
 * genuinely isn't decidable — a ternary unresolvable on both branches.
 *
 * @returns {boolean}
 */
const CLEAN_CONDITIONALS_LABEL =
  "size={'icon'} with a real aria-label, both aria-labelledby forms, a ternary decidably " +
  'non-empty on both branches, `?? "Label"` with an unresolvable left, `"Label" && "Label"` ' +
  'with a decidably-truthy left, and a ternary unresolvable on both branches are not violations';

function selfTest() {
  const dirty = [
    '<Button size="icon"><Trash2 /></Button>',
    '<ButtonPrimitive size="icon-sm"><X /></ButtonPrimitive>',
    '<Button size="icon-lg" title="Delete"><Trash2 /></Button>',
    '<Button\n  size="icon-xs"\n  onClick={() => setOpen(x > y)}\n>\n  <Pencil />\n</Button>',
    '<Button size="icon" aria-label=""><Trash2 /></Button>',
    '<Button size="icon" aria-label={undefined}><Trash2 /></Button>',
    '<Button size="icon" data-aria-label="x"><Trash2 /></Button>',
    "<Button size={'icon'}><Trash2 /></Button>",
    '<Button size="icon" aria-label="   "><Trash2 /></Button>',
    '<Button size="icon" aria-label={cond ? "Close" : ""}><Trash2 /></Button>',
    '<Button size="icon" aria-label={cond ? "" : "Close"}><Trash2 /></Button>',
    '<Button size="icon" aria-label={cond && "Close"}><Trash2 /></Button>',
    '<Button size="icon" aria-label={x ?? ""}><Trash2 /></Button>',
    '<Button size="icon" aria-label={cond ? undefined : "Close"}><Trash2 /></Button>',
  ].join('\n');
  const clean = [
    '<Button size="icon" aria-label="Delete item"><Trash2 /></Button>',
    '<ButtonPrimitive size="icon-sm" aria-label="Close"><X /></ButtonPrimitive>',
    '<Button>Add Item</Button>',
    '<Button size="sm">Save</Button>',
    '<Button size={dynamicSize}><Trash2 /></Button>',
    '<Button size={\'icon\'} aria-label="Delete"><Trash2 /></Button>',
    '<Button size="icon" aria-labelledby={headingId}><Trash2 /></Button>',
    '<Button size="icon" aria-labelledby="delete-heading"><Trash2 /></Button>',
    '<Button size="icon" aria-label={cond ? "Close" : "Delete"}><Trash2 /></Button>',
    '<Button size="icon" aria-label={labelA ?? "Close"}><Trash2 /></Button>',
    '<Button size="icon" aria-label={"Close" && "Delete"}><Trash2 /></Button>',
    '<Button size="icon" aria-label={cond ? labelA : labelB}><Trash2 /></Button>',
  ].join('\n');

  const dirtyHits = findViolations('pillars/x/app/src/A.tsx', dirty);
  const cleanHits = findViolations('pillars/x/app/src/B.tsx', clean);
  const dirtyLines = new Set(dirtyHits.map((v) => v.line));

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
    'reports an empty aria-label as no label': dirtyLines.has(10),
    'reports aria-label={undefined} as no label': dirtyLines.has(11),
    'reports data-aria-label as a decoy, not a real aria-label': dirtyLines.has(12),
    "reports size={'icon'} — a brace-wrapped literal is decidable": dirtyLines.has(13),
    'reports a whitespace-only aria-label as no label': dirtyLines.has(14),
    'reports a ternary with an empty-string branch': dirtyLines.has(15),
    'reports a reversed ternary with an empty-string branch': dirtyLines.has(16),
    'reports cond && "Label" — no truthy proof on the left': dirtyLines.has(17),
    'reports x ?? "" — an unresolvable left with an empty-literal right': dirtyLines.has(18),
    'reports a ternary with an undefined branch': dirtyLines.has(19),
    'reports every dirty line, not just the first': dirtyLines.size === 14,
    'an icon button WITH aria-label is not a violation': !cleanHits.some(
      (v) => v.size === 'icon' && v.component === 'Button'
    ),
    'a primitive icon button WITH aria-label is not a violation': !cleanHits.some(
      (v) => v.component === 'ButtonPrimitive'
    ),
    'a prominent icon+text button is not a violation': cleanHits.every((v) => v.size !== undefined),
    'a non-icon size is not a violation': !cleanHits.some((v) => v.size === 'sm'),
    'a dynamic size expression is not guessed at': !cleanHits.some((v) => v.size === 'dynamicSize'),
    [CLEAN_CONDITIONALS_LABEL]: cleanHits.length === 0,
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
