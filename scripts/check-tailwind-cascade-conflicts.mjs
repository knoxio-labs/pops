#!/usr/bin/env node
/**
 * Tailwind cross-sheet cascade guard.
 *
 * Since POPS-4581 the shell's document carries more than one Tailwind
 * utilities sheet: the shell's own, and one per loader-mounted pillar, linked
 * after it. Inside one sheet Tailwind orders every utility so that two classes
 * competing for the same CSS property on one element resolve the way Tailwind
 * documents. Across sheets that order is gone: a rule the later sheet
 * re-emits is decided by its later copy. `layerPillarBaseUtilities` in
 * `libs/sdk/src/remote-build/stylesheet.ts` restores it for a plain utility
 * against a variant. Two shapes remain, and this guard keeps both out of the
 * tree:
 *
 *   1. VARIANT AGAINST VARIANT (scope: `pillars/shell/src`, `libs/*\/src`). A
 *      shell or kit element carrying two different variants of one property
 *      (`md:flex lg:hidden`). A pillar sheet that re-emits the variant Tailwind
 *      orders first (`md:flex`) puts it after the shell's `lg:hidden`, and the
 *      element is shown at `lg`. `cn()` does not help: tailwind-merge never
 *      merges two different variants.
 *   2. PLAIN AGAINST PLAIN (scope: `pillars/*\/app/src`). A pillar element
 *      carrying two plain utilities that set one CSS property (`p-2 p-4`, or
 *      `p-2 px-4`). The pillar's plain utilities sit in the
 *      `utilities.pillar-base` sublayer, which loses to every rule the shell
 *      sheet emits, so whichever of the two the shell also uses wins,
 *      regardless of Tailwind's order. Inside a `cn()`/`twMerge()` call a pair
 *      of the same property set is merged to one class and is fine; a
 *      shorthand before its longhand (`cn('p-2 px-4')`) survives the merge,
 *      so that shape is reported inside `cn()` too.
 *
 * WHAT IS AN ELEMENT. Every JSX `className=`/`class=`/`*ClassName=` attribute
 * value, and every `cn(`/`twMerge(`/`clsx(`/`cva(` call outside one. Within
 * it, every string literal and template-literal chunk that reaches the class
 * list: literals compared with `===`/`!==`, used as an index, passed to some
 * other function (`t('…')`), or sitting in a `clsx` object's value position
 * are not classes. Two classes only compete when they can be applied
 * together: the two branches of a ternary, and two options of one `cva`
 * variant, never are.
 *
 * WHEN TWO VARIANTS ACTUALLY DEPEND ON ORDER. Only when both can hold at
 * once, both style the same node, and neither outranks the other:
 *   - Variants that move the rule to another node (`before:`, `*:`,
 *     `[&_svg]:`) are its target; two classes with different targets are not
 *     compared. Two descendant selectors that can reach the same node are a
 *     stated blind spot.
 *   - Conditions that cannot hold together are exclusive: one data/aria
 *     attribute with two values (`data-[size=sm]:` / `data-[size=lg]:`), two
 *     element types (`[a&]:` / `[button&]:`), `X` and `not-X`, and a
 *     breakpoint and its own range end (`lg:` / `max-lg:`). That last one is
 *     the fix this guard asks for: `md:max-lg:p-6 lg:p-8`.
 *   - Rules of different specificity resolve the same way in either order.
 *     {@link conditionSpecificity} reads it off a table of variants; one
 *     outside the table (an arbitrary `[&:…]:`) makes the pair reported.
 *   - A third class that requires every condition of both and outranks them
 *     decides every case where both hold (`hover:bg-x dark:bg-y
 *     dark:hover:bg-z`), so the pair never reaches sheet order.
 *   - Two classes with and without `!` never depend on order either.
 *
 * WHAT IS A PROPERTY. {@link propertiesOf} maps a utility to the CSS
 * properties it sets, for the groups the cascade problem actually bites:
 * display, position, padding and margin per side, width/height (and their
 * min/max), flex and grid layout, font size, text colour, alignment and the
 * background. A utility outside that table sets nothing as far as this guard
 * is concerned; widening the table only ever adds reports.
 *
 * LIMITS, stated rather than hidden. This is a text scanner, not a TypeScript
 * parser (the job is install-free, ADR-045 Tier A). Classes reaching an
 * element through a variable (`cn(base, 'p-4')`) are not followed. The scan of
 * an expression is quote-, template- and comment-aware, and an expression
 * whose brackets never balance is reported as a finding rather than skipped.
 *
 * Usage:
 *   node scripts/check-tailwind-cascade-conflicts.mjs              check the real tree
 *   node scripts/check-tailwind-cascade-conflicts.mjs --self-test  prove the guard reports
 *
 * Exit 0 when no element carries either shape; 1 on any finding, a failed
 * self-test, or a discovery result too small to be believable; 2 on a usage
 * error.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

/** Directory names never walked. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'storybook-static']);

/** Fixture and test content, not shipped UI. */
const EXEMPT_FILE_RE = /\.stories\.tsx?$|\.test\.tsx?$|\.spec\.tsx?$/;

/** Path fragments exempt wholesale, as POSIX-ish substrings. */
const EXEMPT_PATH_FRAGMENTS = ['/__tests__/', '/__mocks__/', '/e2e/', '/.storybook/'];

/** Generated client trees: `src/<pillar>-api/…`. */
const GENERATED_CLIENT_RE = /\/src\/[a-z-]+-api\//;

/** Calls whose arguments are class lists. */
const CLASS_FUNCTIONS = new Set(['cn', 'twMerge', 'clsx', 'cva', 'twJoin', 'cx']);

/** Calls that run tailwind-merge over their arguments. */
const MERGING_FUNCTIONS = new Set(['cn', 'twMerge']);

const ATTRIBUTE_RE =
  /(?<![\w$.])(?:class|className|[a-z][A-Za-z0-9]*ClassName)\s*=(?!=)\s*(?=["'{`])/g;
const CLASS_CALL_RE = /(?<![\w$.])(cn|twMerge|clsx|cva|twJoin|cx)\s*\(/g;

const FOUR_SIDES = ['top', 'right', 'bottom', 'left'];
/** @type {Record<string, string[]>} */
const SIDES = {
  '': FOUR_SIDES,
  x: ['right', 'left'],
  y: ['top', 'bottom'],
  t: ['top'],
  r: ['right'],
  b: ['bottom'],
  l: ['left'],
  s: ['left'],
  e: ['right'],
};

const DISPLAY = new Set([
  'block',
  'inline-block',
  'inline',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'hidden',
  'contents',
  'flow-root',
  'list-item',
  'table',
  'inline-table',
  'table-caption',
  'table-cell',
  'table-column',
  'table-column-group',
  'table-footer-group',
  'table-header-group',
  'table-row-group',
  'table-row',
]);
const POSITION = new Set(['static', 'fixed', 'absolute', 'relative', 'sticky']);
const FONT_SIZES = /^(?:xs|2xs|sm|base|lg|xl|[2-9]xl)(?:\/.+)?$/;
const TEXT_ALIGN = new Set(['left', 'center', 'right', 'justify', 'start', 'end']);
const TEXT_NOT_COLOR = /^(?:wrap|nowrap|balance|pretty|ellipsis|clip|shadow(?:-.*)?)$/;
const ALIGNMENT =
  /^(?:start|end|center|between|around|evenly|stretch|normal|baseline|end-safe|center-safe)$/;
const ARBITRARY_LENGTH =
  /^\[(?:length:|-?\d|\.\d|calc\(|clamp\(|min\(|max\(|var\(--(?:text|font-size|spacing))/;

/**
 * The CSS properties a Tailwind utility (no variants, no important marker)
 * sets, as far as this guard's groups go. An empty list means the utility is
 * outside every group this guard checks.
 *
 * @param {string} utility e.g. `px-4`, `text-sm`, `bg-muted/50`, `-mt-2`.
 * @returns {string[]}
 */
export function propertiesOf(utility) {
  const u = utility.replace(/^-/, '');
  if (DISPLAY.has(u)) return ['display'];
  if (POSITION.has(u)) return ['position'];
  const box = /^([pm])([xytrblse]?)-(.+)$/.exec(u);
  if (box !== null) {
    const kind = box[1] === 'p' ? 'padding' : 'margin';
    return (SIDES[box[2] ?? ''] ?? []).map((side) => `${kind}-${side}`);
  }
  const dimension = /^(min-|max-)?(w|h|size)-(.+)$/.exec(u);
  if (dimension !== null) {
    const prefix = dimension[1] ?? '';
    const axes =
      dimension[2] === 'size' ? ['width', 'height'] : [dimension[2] === 'w' ? 'width' : 'height'];
    return axes.map((axis) => `${prefix}${axis}`);
  }
  return flexGridProperties(u) ?? textProperties(u) ?? backgroundProperties(u) ?? [];
}

/** @param {string} u @returns {string[] | undefined} */
function flexGridProperties(u) {
  if (/^flex-(?:row|col)(?:-reverse)?$/.test(u)) return ['flex-direction'];
  if (/^flex-(?:wrap|wrap-reverse|nowrap)$/.test(u)) return ['flex-wrap'];
  if (/^flex-.+$/.test(u)) return ['flex-grow', 'flex-shrink', 'flex-basis'];
  if (/^grow(?:-.+)?$/.test(u)) return ['flex-grow'];
  if (/^shrink(?:-.+)?$/.test(u)) return ['flex-shrink'];
  if (/^basis-.+$/.test(u)) return ['flex-basis'];
  if (/^items-.+$/.test(u)) return ['align-items'];
  if (/^self-.+$/.test(u)) return ['align-self'];
  if (/^justify-items-.+$/.test(u)) return ['justify-items'];
  if (/^justify-self-.+$/.test(u)) return ['justify-self'];
  const justify = /^justify-(.+)$/.exec(u);
  if (justify !== null && ALIGNMENT.test(justify[1] ?? '')) return ['justify-content'];
  const content = /^content-(.+)$/.exec(u);
  if (content !== null && ALIGNMENT.test(content[1] ?? '')) return ['align-content'];
  if (/^gap-x-.+$/.test(u)) return ['column-gap'];
  if (/^gap-y-.+$/.test(u)) return ['row-gap'];
  if (/^gap-.+$/.test(u)) return ['column-gap', 'row-gap'];
  if (/^grid-cols-.+$/.test(u)) return ['grid-template-columns'];
  if (/^grid-rows-.+$/.test(u)) return ['grid-template-rows'];
  if (/^grid-flow-.+$/.test(u)) return ['grid-auto-flow'];
  const track = /^(col|row)-(span-.+|auto|\[.+\])$/.exec(u);
  if (track !== null) return [`${gridLine(track[1])}-start`, `${gridLine(track[1])}-end`];
  const edge = /^(col|row)-(start|end)-.+$/.exec(u);
  if (edge !== null) return [`${gridLine(edge[1])}-${edge[2]}`];
  return undefined;
}

/** @param {string | undefined} axis `col` or `row` */
function gridLine(axis) {
  return axis === 'col' ? 'grid-column' : 'grid-row';
}

/** @param {string} u @returns {string[] | undefined} */
function textProperties(u) {
  const text = /^text-(.+)$/.exec(u);
  if (text === null) return undefined;
  const value = text[1] ?? '';
  if (FONT_SIZES.test(value) || ARBITRARY_LENGTH.test(value)) return ['font-size'];
  if (TEXT_ALIGN.has(value)) return ['text-align'];
  if (TEXT_NOT_COLOR.test(value)) return [];
  return ['color'];
}

/** @param {string} u @returns {string[] | undefined} */
function backgroundProperties(u) {
  const bg = /^bg-(.+)$/.exec(u);
  if (bg === null) return undefined;
  const value = bg[1] ?? '';
  if (/^(?:none|gradient-.+|linear-.+|radial(?:-.+)?|conic(?:-.+)?|\[url\(.+)$/.test(value)) {
    return ['background-image'];
  }
  if (/^(?:auto|cover|contain)$/.test(value)) return ['background-size'];
  if (
    /^(?:center|top|bottom|left|right|left-top|left-bottom|right-top|right-bottom)$/.test(value)
  ) {
    return ['background-position'];
  }
  if (/^(?:repeat|no-repeat|repeat-x|repeat-y|repeat-round|repeat-space)$/.test(value)) {
    return ['background-repeat'];
  }
  if (/^(?:fixed|local|scroll)$/.test(value)) return ['background-attachment'];
  if (/^(?:clip|origin|blend)-.+$/.test(value)) return [];
  return ['background-color'];
}

/**
 * A class token split into its variant chain and its utility.
 *
 * @typedef {object} ParsedClass
 * @property {string} variants The variant chain, `''` for a plain utility.
 * @property {string} target   The variants that move the rule off the element
 *   itself (`before:`, `*:`, `[&_svg]:`), `''` when it styles the element.
 * @property {string[]} conditions The other variants, which only gate it.
 * @property {string} utility  The utility, without variants or `!`.
 * @property {boolean} important Whether it carries the important modifier.
 * @property {number | undefined} specificity What the condition variants add
 *   to the rule's selector ({@link conditionSpecificity}), undefined when one
 *   of them is outside the table.
 * @property {string[]} properties What {@link propertiesOf} says it sets.
 */

const PSEUDO_ELEMENTS = new Set([
  'before',
  'after',
  'placeholder',
  'file',
  'selection',
  'marker',
  'first-letter',
  'first-line',
  'backdrop',
  'details-content',
]);

/**
 * Whether a variant moves the rule to another node: a pseudo-element, the
 * child and descendant variants, or an arbitrary variant whose selector steps
 * from `&` to a relative (`[&_svg]`, `[&>li]`).
 *
 * @param {string} variant
 */
function retargets(variant) {
  if (PSEUDO_ELEMENTS.has(variant) || variant === '*' || variant === '**') return true;
  return /^\[.*&[_>~+ ]/.test(variant);
}

/**
 * Split a class token on its top-level colons (not those inside `[…]` or
 * `(…)`), and strip either spelling of the important modifier.
 *
 * @param {string} token
 * @returns {ParsedClass}
 */
export function parseClass(token) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of token) {
    if (ch === '[' || ch === '(') depth += 1;
    if (ch === ']' || ch === ')') depth -= 1;
    if (ch === ':' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  const utility = current.replace(/^!/, '').replace(/!$/, '');
  const conditions = parts.filter((part) => !retargets(part));
  return {
    variants: parts.join(':'),
    target: parts.filter(retargets).join(':'),
    conditions,
    utility,
    important: utility !== current,
    specificity: conditionSpecificity(conditions),
    properties: propertiesOf(utility),
  };
}

/**
 * Variants that compile to an at-rule, or into `:where()`, and so add nothing
 * to a selector's specificity: breakpoints and their ranges, container
 * queries, media features, `supports-*`, `starting`, `rtl`/`ltr` and `in-*`.
 */
const ZERO_SPECIFICITY =
  /^(?:sm|md|lg|xl|2xl|max-(?:sm|md|lg|xl|2xl)|min-\[.+\]|max-\[.+\]|@.+|motion-safe|motion-reduce|print|portrait|landscape|contrast-more|contrast-less|forced-colors|inverted-colors|(?:any-)?pointer-(?:none|coarse|fine)|noscript|starting|rtl|ltr|(?:not-)?supports-.+|in-.+)$/;

/**
 * Variants that add one pseudo-class or attribute selector. `dark` is here
 * because the theme defines it as `&:is(.dark *)` (libs/ui/src/theme/globals.css).
 */
const ONE_CLASS_SPECIFICITY =
  /^(?:hover|focus|focus-visible|focus-within|active|visited|target|disabled|enabled|checked|indeterminate|default|required|optional|valid|invalid|user-valid|user-invalid|in-range|out-of-range|placeholder-shown|autofill|read-only|first|last|only|odd|even|first-of-type|last-of-type|only-of-type|empty|open|inert|dark|(?:nth|nth-last|nth-of-type|nth-last-of-type)-.+|(?:group|peer)-(?!has-\[).+|(?:has-)?(?:data|aria)-.+|has-(?:hover|focus|focus-visible|checked|disabled|invalid))$/;

/**
 * The specificity the condition variants of a class add to its selector, as
 * `classes * 1000 + elements`, or undefined when one of them is outside the
 * table above: an arbitrary variant, or a named one this guard does not know.
 * Two rules on one element whose specificities differ resolve the same way in
 * any order, so only equal ones are order-dependent.
 *
 * @param {string[]} conditions
 * @returns {number | undefined}
 */
export function conditionSpecificity(conditions) {
  let total = 0;
  for (const condition of conditions) {
    const inner = condition.replace(/^not-/, '');
    if (ZERO_SPECIFICITY.test(inner)) continue;
    if (ONE_CLASS_SPECIFICITY.test(inner)) total += 1000;
    else if (/^\[[a-z][a-z0-9]*&\]$/.test(inner)) total += 1;
    else return undefined;
  }
  return total;
}

/**
 * A condition that names one value out of several (`data-[size=sm]`,
 * `group-data-[state=open]/tabs`, `[a&]`), as a key and a value: two
 * conditions with one key and different values never hold together.
 *
 * @param {string} condition
 * @returns {[string, string] | undefined}
 */
function keyedCondition(condition) {
  const attribute =
    /^((?:group-|peer-)?(?:has-|in-)?(?:data|aria))-\[([\w-]+)=['"]?([^\]'"]+)['"]?\](\/[\w-]+)?$/.exec(
      condition
    );
  if (attribute !== null)
    return [`${attribute[1]}|${attribute[2]}|${attribute[4] ?? ''}`, attribute[3] ?? ''];
  const tag = /^\[([a-z][a-z0-9]*)&\]$/.exec(condition);
  if (tag !== null) return ['tag', tag[1] ?? ''];
  return undefined;
}

/**
 * Whether two variant chains can never apply at once: one names a keyed
 * condition the other names with another value, or one negates (`not-dark`)
 * a condition the other requires.
 *
 * @param {string[]} a
 * @param {string[]} b
 */
export function conditionsExclusive(a, b) {
  for (const x of a) {
    for (const y of b) {
      if (x === `not-${y}` || y === `not-${x}`) return true;
      if (x === `max-${y}` || y === `max-${x}`) return true;
      const kx = keyedCondition(x);
      const ky = keyedCondition(y);
      if (kx !== undefined && ky !== undefined && kx[0] === ky[0] && kx[1] !== ky[1]) return true;
    }
  }
  return false;
}

/**
 * A string that reaches an element's class list.
 *
 * @typedef {object} ClassLiteral
 * @property {string} text  The literal's content (or template chunk), trimmed of partial edges.
 * @property {number} offset Where it starts in the file.
 * @property {string[]} alternatives `<id>=<branch>` for each ternary or cva variant it sits under.
 * @property {boolean} merged Whether a `cn()`/`twMerge()` call encloses it.
 */

/**
 * One element's class-bearing literals.
 *
 * @typedef {object} ClassElement
 * @property {number} offset Where the attribute or call starts.
 * @property {ClassLiteral[]} literals
 * @property {string} [error] Set when the expression could not be scanned.
 */

/**
 * @typedef {object} Frame
 * @property {'root'|'call'|'paren'|'index'|'array'|'object'|'template'} kind
 * @property {string} [name] The callee, for a call frame.
 * @property {number} arg The argument index, for a call frame.
 * @property {{ id: string, branch: 'then'|'else' }[]} ternaries Open ternaries at this depth.
 * @property {string | undefined} key The current key, for an object frame.
 * @property {boolean} inValue Whether an object frame is past its current key's colon.
 */

/**
 * What a string token remembers of the frames around it.
 *
 * @typedef {object} Snapshot
 * @property {string[]} alternatives `<id>=<branch>` for each open ternary.
 * @property {Omit<Frame, 'ternaries'>[]} frames Outermost first.
 */

/**
 * @typedef {object} Token
 * @property {'str' | 'word' | 'num' | 'op' | 'punct'} type
 * @property {string} value
 * @property {number} offset
 * @property {Snapshot} [snapshot] For a string token.
 */

/**
 * @typedef {{ end: number, tokens: Token[] } | { error: string, at: number }} ScanResult
 */

/** @param {Frame['kind']} kind @param {string} [name] @returns {Frame} */
function frame(kind, name) {
  return { kind, name, arg: 0, ternaries: [], key: undefined, inValue: false };
}

const COMPARISON = new Set(['===', '!==', '==', '!=']);

/** @type {Record<string, Frame['kind'][]>} */
const CLOSES = { ')': ['call', 'paren'], ']': ['index', 'array'], '}': ['object'] };

/**
 * Scan one JS expression from `start` (the first character after the opening
 * `{` or `(`) to the bracket that closes it, and return every string token it
 * contains with the context the class decision needs.
 *
 * @param {string} src
 * @param {number} start
 * @param {Frame} root
 * @returns {ScanResult}
 */
function scanExpression(src, start, root) {
  /** @type {Frame[]} */
  const stack = [root];
  /** @type {Token[]} */
  const tokens = [];
  let ternaryCounter = 0;
  let i = start;
  const top = () => stack[stack.length - 1];
  const closeTernaries = () => {
    const f = top();
    if (f !== undefined) f.ternaries = [];
  };
  /** @returns {Snapshot} */
  const snapshot = () => ({
    alternatives: stack.flatMap((f) => f.ternaries.map((t) => `${t.id}=${t.branch}`)),
    frames: stack.map((f) => ({
      kind: f.kind,
      name: f.name,
      arg: f.arg,
      key: f.key,
      inValue: f.inValue,
    })),
  });
  /** @param {string} value @param {number} offset */
  const pushString = (value, offset) =>
    tokens.push({ type: 'str', value, offset, snapshot: snapshot() });

  while (i < src.length) {
    const c = src.charAt(i);
    const next = src.charAt(i + 1);
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === '/' && next === '/') {
      const eol = src.indexOf('\n', i);
      i = eol === -1 ? src.length : eol;
      continue;
    }
    if (c === '/' && next === '*') {
      const close = src.indexOf('*/', i + 2);
      if (close === -1) return { error: 'unterminated comment', at: i };
      i = close + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = stringEnd(src, i);
      if (end === -1) return { error: 'unterminated string', at: i };
      pushString(src.slice(i + 1, end), i + 1);
      i = end + 1;
      continue;
    }
    if (c === '`') {
      stack.push(frame('template'));
      i += 1;
      let chunkStart = i;
      let afterExpression = false;
      let closed = false;
      while (i < src.length) {
        if (src[i] === '\\') {
          i += 2;
          continue;
        }
        if (src[i] === '`' || (src[i] === '$' && src[i + 1] === '{')) {
          const chunk = src.slice(chunkStart, i);
          const beforeExpression = src[i] === '$';
          pushString(trimPartialEdges(chunk, afterExpression, beforeExpression), chunkStart);
          if (!beforeExpression) {
            closed = true;
            i += 1;
            break;
          }
          const inner = scanExpression(src, i + 2, frame('root'));
          if ('error' in inner) return inner;
          for (const token of inner.tokens) {
            if (token.snapshot !== undefined) {
              const outer = snapshot();
              token.snapshot = {
                alternatives: [...outer.alternatives, ...token.snapshot.alternatives],
                frames: [...outer.frames, ...token.snapshot.frames],
              };
            }
            tokens.push(token);
          }
          i = inner.end + 1;
          chunkStart = i;
          afterExpression = true;
          continue;
        }
        i += 1;
      }
      if (!closed) return { error: 'unterminated template literal', at: i };
      stack.pop();
      tokens.push({ type: 'punct', value: '`', offset: i - 1 });
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*/.exec(src.slice(i, i + 200));
    if (word !== null) {
      tokens.push({ type: 'word', value: word[0], offset: i });
      i += word[0].length;
      continue;
    }
    const number = /^\d[\d._]*/.exec(src.slice(i, i + 50));
    if (number !== null) {
      tokens.push({ type: 'num', value: number[0], offset: i });
      i += number[0].length;
      continue;
    }
    const op = /^(?:===|!==|==|!=|=>|&&|\|\||\?\?|\?\.(?!\d)|\.\.\.|[<>]=?)/.exec(
      src.slice(i, i + 3)
    );
    if (op !== null) {
      tokens.push({ type: 'op', value: op[0], offset: i });
      i += op[0].length;
      continue;
    }
    const previous = tokens[tokens.length - 1];
    if (c === '(') {
      const callee = previous?.type === 'word' ? previous.value.split(/\??\./).pop() : undefined;
      stack.push(callee === undefined ? frame('paren') : frame('call', callee));
    } else if (c === '[') {
      const subscript =
        previous !== undefined &&
        (previous.type === 'word' || previous.value === ')' || previous.value === ']');
      stack.push(frame(subscript ? 'index' : 'array'));
    } else if (c === '{') {
      stack.push(frame('object'));
    } else if (c === ')' || c === ']' || c === '}') {
      const closing = stack.pop();
      const expected = CLOSES[c] ?? [];
      if (closing === undefined) return { error: `unbalanced ${c}`, at: i };
      if (closing === root || stack.length === 0) {
        if (!(closing.kind === 'root' ? c === '}' : expected.includes(closing.kind))) {
          return { error: `unbalanced ${c}`, at: i };
        }
        return { end: i, tokens };
      }
      if (!expected.includes(closing.kind)) return { error: `unbalanced ${c}`, at: i };
    } else if (c === '?') {
      ternaryCounter += 1;
      top()?.ternaries.push({ id: `t${start}.${ternaryCounter}`, branch: 'then' });
    } else if (c === ':') {
      const f = top();
      const pending = f?.ternaries.findLast((t) => t.branch === 'then');
      if (pending !== undefined) pending.branch = 'else';
      else if (f?.kind === 'object') {
        f.inValue = true;
        f.key = previous?.type === 'str' || previous?.type === 'word' ? previous.value : undefined;
      }
    } else if (c === ',' || c === ';') {
      closeTernaries();
      const f = top();
      if (f !== undefined) {
        f.arg += 1;
        f.inValue = false;
        f.key = undefined;
      }
    }
    tokens.push({ type: 'punct', value: c, offset: i });
    i += 1;
  }
  return { error: 'expression never closes', at: i };
}

/** @param {string} src @param {number} open @returns {number} */
function stringEnd(src, open) {
  const quote = src[open];
  for (let i = open + 1; i < src.length; i += 1) {
    if (src[i] === '\\') {
      i += 1;
      continue;
    }
    if (src[i] === quote) return i;
    if (src[i] === '\n') return -1;
  }
  return -1;
}

/**
 * A template chunk that abuts a `${…}` has a class token cut in half at that
 * edge (`p-${n}`): drop the fragment rather than read `p-` as a class.
 *
 * @param {string} chunk
 * @param {boolean} afterExpression
 * @param {boolean} beforeExpression
 */
function trimPartialEdges(chunk, afterExpression, beforeExpression) {
  let text = chunk;
  if (afterExpression && /^\S/.test(text)) text = text.replace(/^\S+/, '');
  if (beforeExpression && /\S$/.test(text)) text = text.replace(/\S+$/, '');
  return text;
}

/**
 * Decide, from the frames enclosing a string token and its neighbours,
 * whether it reaches the class list, and under which alternatives.
 *
 * @param {Snapshot} snap
 * @param {Token | undefined} prev
 * @param {Token | undefined} next
 * @returns {{ alternatives: string[], merged: boolean } | undefined}
 */
function classContext(snap, prev, next) {
  if (prev !== undefined && (COMPARISON.has(prev.value) || prev.value === 'case')) return undefined;
  if (next !== undefined && COMPARISON.has(next.value)) return undefined;
  const alternatives = [...snap.alternatives];
  const frames = snap.frames;
  const innermostCall = frames.findLastIndex((f) => f.kind === 'call');
  if (frames.some((f) => f.kind === 'index')) return undefined;
  const merged = frames.some(
    (f) => f.kind === 'call' && f.name !== undefined && MERGING_FUNCTIONS.has(f.name)
  );
  const call = frames[innermostCall];
  if (call === undefined) {
    return frames.some((f) => f.kind === 'object') ? undefined : { alternatives, merged };
  }
  if (call.name === undefined || !CLASS_FUNCTIONS.has(call.name)) return undefined;
  const objects = frames.slice(innermostCall + 1).filter((f) => f.kind === 'object');
  if (call.name === 'cva') {
    if (objects.length === 0) return call.arg === 0 ? { alternatives, merged } : undefined;
    const path = objects.map((f) => (f.inValue ? f.key : undefined));
    if (
      path[0] === 'variants' &&
      path.length === 3 &&
      path[1] !== undefined &&
      path[2] !== undefined
    ) {
      return { alternatives: [...alternatives, `cva.${path[1]}=${path[2]}`], merged };
    }
    const last = path[path.length - 1];
    if (path[0] === 'compoundVariants' && (last === 'class' || last === 'className')) {
      return { alternatives, merged };
    }
    return undefined;
  }
  if (objects.length === 0) return { alternatives, merged };
  const innermost = objects[objects.length - 1];
  const isKey = innermost !== undefined && !innermost.inValue && next?.value === ':';
  return isKey ? { alternatives, merged } : undefined;
}

/**
 * @param {string} src
 * @param {number} offset
 */
function inComment(src, offset) {
  const lineStart = src.lastIndexOf('\n', offset - 1) + 1;
  const before = src.slice(lineStart, offset);
  return /^\s*(?:\*|\/\*|\/\/)/.test(before) || /(?:^|\s)\/\/(?!.*["'`])/.test(before);
}

/** @param {ScanResult} scan @param {number} offset @returns {ClassElement} */
function elementFrom(scan, offset) {
  if ('error' in scan) return { offset, literals: [], error: scan.error };
  /** @type {ClassLiteral[]} */
  const literals = [];
  const significant = scan.tokens;
  significant.forEach((token, index) => {
    if (token.type !== 'str' || token.snapshot === undefined) return;
    const context = classContext(token.snapshot, significant[index - 1], significant[index + 1]);
    if (context === undefined) return;
    literals.push({ text: token.value, offset: token.offset, ...context });
  });
  return { offset, literals };
}

/**
 * Every class-bearing element in one source file.
 *
 * @param {string} src
 * @returns {ClassElement[]}
 */
export function extractElements(src) {
  /** @type {ClassElement[]} */
  const elements = [];
  /** @type {[number, number][]} */
  const covered = [];
  for (const match of src.matchAll(ATTRIBUTE_RE)) {
    const offset = match.index;
    if (inComment(src, offset)) continue;
    const valueStart = offset + match[0].length;
    const opener = src[valueStart];
    if (opener === '"' || opener === "'") {
      const end = stringEnd(src, valueStart);
      if (end === -1) {
        elements.push({ offset, literals: [], error: 'unterminated string' });
        continue;
      }
      elements.push({
        offset,
        literals: [
          {
            text: src.slice(valueStart + 1, end),
            offset: valueStart + 1,
            alternatives: [],
            merged: false,
          },
        ],
      });
      covered.push([offset, end]);
      continue;
    }
    const expressionStart = opener === '{' ? valueStart + 1 : valueStart;
    const scan =
      opener === '{'
        ? scanExpression(src, expressionStart, frame('root'))
        : scanExpression(
            `${src.slice(0, valueStart)}{${src.slice(valueStart)}`,
            valueStart + 1,
            frame('root')
          );
    elements.push(elementFrom(scan, offset));
    covered.push([offset, 'error' in scan ? scan.at : scan.end]);
  }
  for (const match of src.matchAll(CLASS_CALL_RE)) {
    const offset = match.index;
    if (covered.some(([from, to]) => offset > from && offset < to)) continue;
    if (inComment(src, offset)) continue;
    if (/\bfunction\s+$/.test(src.slice(Math.max(0, offset - 20), offset))) continue;
    const root = frame('call', match[1]);
    const scan = scanExpression(src, offset + match[0].length, root);
    elements.push(elementFrom(scan, offset));
    covered.push([offset, 'error' in scan ? scan.at : scan.end]);
  }
  return elements.toSorted((a, b) => a.offset - b.offset);
}

/**
 * @typedef {object} Conflict
 * @property {string} file
 * @property {number} line
 * @property {'variant' | 'plain'} kind
 * @property {string} first
 * @property {string} second
 * @property {string[]} properties The CSS properties both set.
 * @property {string} [error] Set instead of the pair when the element could not be scanned.
 */

/** @param {string} entry @returns {[string, string]} */
function splitAlternative(entry) {
  const at = entry.lastIndexOf('=');
  return [entry.slice(0, at), entry.slice(at + 1)];
}

/**
 * Whether two literals sit in different branches of one ternary or in
 * different options of one cva variant.
 *
 * @param {string[]} a
 * @param {string[]} b
 */
function mutuallyExclusive(a, b) {
  const branches = new Map(a.map(splitAlternative));
  return b.some((entry) => {
    const [id, branch] = splitAlternative(entry);
    return branches.has(id) && branches.get(id) !== branch;
  });
}

/**
 * One class token on an element, with the literal it came from.
 *
 * @typedef {ParsedClass & { token: string, literal: ClassLiteral, order: number }} ClassInstance
 */

/** @param {string} src @param {number} offset */
function lineOf(src, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i += 1) if (src[i] === '\n') line += 1;
  return line;
}

/**
 * Which shapes to report for a file.
 *
 * @typedef {object} Scope
 * @property {boolean} variant Report two variants of one property.
 * @property {boolean} plain   Report two plain utilities of one property.
 */

/**
 * Pure core: every conflict in one file's source, for the shapes `scope`
 * asks for. An element whose expression could not be scanned is reported as
 * a conflict carrying `error`, never skipped.
 *
 * @param {string} file Repo-relative path, for the report.
 * @param {string} src
 * @param {Scope} scope
 * @returns {Conflict[]}
 */
export function findConflicts(file, src, scope) {
  /** @type {Conflict[]} */
  const conflicts = [];
  for (const element of extractElements(src)) {
    if (element.error !== undefined) {
      conflicts.push({
        file,
        line: lineOf(src, element.offset),
        kind: scope.variant ? 'variant' : 'plain',
        first: '',
        second: '',
        properties: [],
        error: element.error,
      });
      continue;
    }
    /** @type {ClassInstance[]} */
    const classes = element.literals.flatMap((literal) =>
      literal.text
        .split(/\s+/)
        .filter((token) => token !== '')
        .map((token, index) => ({
          token,
          literal,
          order: literal.offset + index / 1000,
          ...parseClass(token),
        }))
    );
    const seen = new Set();
    for (const [i, a] of classes.entries()) {
      for (const b of classes.slice(i + 1)) {
        if (a.utility === b.utility) continue;
        const shared = a.properties.filter((p) => b.properties.includes(p));
        if (shared.length === 0) continue;
        if (
          a.literal !== b.literal &&
          mutuallyExclusive(a.literal.alternatives, b.literal.alternatives)
        )
          continue;
        const kind = classifyPair(a, b, scope);
        if (kind === undefined) continue;
        if (kind === 'variant' && dominated(a, b, shared, classes)) continue;
        const key = `${kind}|${a.token}|${b.token}`;
        if (seen.has(key)) continue;
        seen.add(key);
        conflicts.push({
          file,
          line: lineOf(src, a.literal.offset),
          kind,
          first: a.token,
          second: b.token,
          properties: shared,
        });
      }
    }
  }
  return conflicts;
}

/**
 * Whether a third class on the element decides every case where `a` and `b`
 * both apply: it requires every condition either of them does, so it holds
 * whenever both hold, and it outranks them on specificity, so sheet order
 * never reaches the pair (`hover:bg-x dark:bg-y dark:hover:bg-z`).
 *
 * @param {ClassInstance} a
 * @param {ClassInstance} b
 * @param {string[]} shared
 * @param {ClassInstance[]} classes
 */
function dominated(a, b, shared, classes) {
  const union = new Set([...a.conditions, ...b.conditions]);
  return classes.some(
    (c) =>
      c !== a &&
      c !== b &&
      c.target === a.target &&
      c.important === a.important &&
      shared.every((p) => c.properties.includes(p)) &&
      [...union].every((condition) => c.conditions.includes(condition)) &&
      c.specificity !== undefined &&
      a.specificity !== undefined &&
      c.specificity > a.specificity &&
      !mutuallyExclusive(c.literal.alternatives, a.literal.alternatives) &&
      !mutuallyExclusive(c.literal.alternatives, b.literal.alternatives)
  );
}

/**
 * Which report, if any, two classes that set a common property make.
 *
 * @param {ClassInstance} a
 * @param {ClassInstance} b
 * @param {Scope} scope
 * @returns {'variant' | 'plain' | undefined}
 */
function classifyPair(a, b, scope) {
  if (a.important !== b.important) return undefined;
  if (a.variants !== '' && b.variants !== '' && a.variants !== b.variants) {
    if (!scope.variant || a.target !== b.target) return undefined;
    if (
      a.specificity !== undefined &&
      b.specificity !== undefined &&
      a.specificity !== b.specificity
    ) {
      return undefined;
    }
    return conditionsExclusive(a.conditions, b.conditions) ? undefined : 'variant';
  }
  if (a.variants !== '' || b.variants !== '' || !scope.plain) return undefined;
  if (!(a.literal.merged && b.literal.merged)) return 'plain';
  const [earlier, later] = a.order < b.order ? [a, b] : [b, a];
  const survives =
    earlier.properties.length > later.properties.length &&
    later.properties.every((p) => earlier.properties.includes(p));
  return survives ? 'plain' : undefined;
}

/**
 * Which shapes apply to a repo-relative path, or undefined when the file is
 * out of scope.
 *
 * @param {string} relPath
 * @returns {Scope | undefined}
 */
export function scopeOf(relPath) {
  const path = `/${relPath}`;
  if (!/\.[jt]sx?$/.test(relPath)) return undefined;
  if (EXEMPT_FILE_RE.test(relPath) || GENERATED_CLIENT_RE.test(path)) return undefined;
  if (EXEMPT_PATH_FRAGMENTS.some((fragment) => path.includes(fragment))) return undefined;
  if (/^pillars\/shell\/src\//.test(relPath) || /^libs\/(?:.+\/)?src\//.test(relPath)) {
    return { variant: true, plain: false };
  }
  if (/^pillars\/[^/]+\/app\/src\//.test(relPath)) return { variant: false, plain: true };
  return undefined;
}

/**
 * Every in-scope file under `root`'s `pillars/` and `libs/`, relative to
 * `root`. A missing scan root throws rather than yielding an empty list.
 *
 * @param {string} root
 * @returns {string[]}
 */
function discoverFiles(root) {
  /** @type {string[]} */
  const found = [];
  /** @param {string} dir */
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = relative(root, abs).split(sep).join('/');
      if (scopeOf(rel) !== undefined) found.push(rel);
    }
  };
  for (const scanRoot of ['pillars', 'libs']) {
    const abs = join(root, scanRoot);
    if (!existsSync(abs) || !statSync(abs).isDirectory()) {
      throw new Error(`scan root ${scanRoot}/ is missing under ${root}`);
    }
    walk(abs);
  }
  return found.toSorted((a, b) => a.localeCompare(b));
}

/**
 * Floors on discovery, per scope. The tree has hundreds of files and
 * thousands of elements in each; numbers near zero mean the walk or the
 * extractor broke, not that the tree got clean.
 */
const MIN_FILES = { variant: 300, plain: 1000 };
const MIN_ELEMENTS = { variant: 700, plain: 4000 };

/**
 * @typedef {object} AuditCounts
 * @property {{ files: number, elements: number }} variant Shell and lib files.
 * @property {{ files: number, elements: number }} plain   Pillar app files.
 */

/**
 * Run the guard over a repository tree.
 *
 * @param {string} root The repository root to scan.
 * @returns {{ counts: AuditCounts, conflicts: Conflict[] }}
 * @throws When `pillars/` or `libs/` is missing under `root`.
 */
export function auditTree(root) {
  const counts = { variant: { files: 0, elements: 0 }, plain: { files: 0, elements: 0 } };
  /** @type {Conflict[]} */
  const conflicts = [];
  for (const file of discoverFiles(root)) {
    const scope = scopeOf(file);
    if (scope === undefined) continue;
    const src = readFileSync(join(root, file), 'utf8');
    const which = scope.variant ? 'variant' : 'plain';
    counts[which].files += 1;
    counts[which].elements += extractElements(src).length;
    conflicts.push(...findConflicts(file, src, scope));
  }
  return { counts, conflicts };
}

/**
 * One message per scope whose discovery fell below its floor; empty when
 * both scopes found enough to be believable.
 *
 * @param {AuditCounts} counts
 * @returns {string[]}
 */
export function floorViolations(counts) {
  return /** @type {const} */ (['variant', 'plain'])
    .filter(
      (which) =>
        counts[which].files < MIN_FILES[which] || counts[which].elements < MIN_ELEMENTS[which]
    )
    .map(
      (which) =>
        `Discovery for the ${which} scope found ${counts[which].files} file(s) and ` +
        `${counts[which].elements} element(s), below the floors of ${MIN_FILES[which]} and ` +
        `${MIN_ELEMENTS[which]}. The walk or the extractor is broken; this is not a clean tree.`
    );
}

/** @param {Conflict} c */
function formatConflict(c) {
  if (c.error !== undefined) {
    return `  ${c.file}:${c.line}  could not scan the class expression (${c.error})`;
  }
  return `  ${c.file}:${c.line}  ${c.first}  vs  ${c.second}  (${c.properties.join(', ')})`;
}

/** @returns {boolean} */
function run() {
  const { counts, conflicts } = auditTree(repoRoot);
  const floors = floorViolations(counts);
  for (const message of floors) console.error(message);
  const variant = conflicts.filter((c) => c.kind === 'variant');
  const plain = conflicts.filter((c) => c.kind === 'plain');
  console.log(
    `Scanned ${counts.variant.files} shell/lib file(s) (${counts.variant.elements} elements) and ` +
      `${counts.plain.files} pillar app file(s) (${counts.plain.elements} elements).`
  );
  if (variant.length > 0) {
    console.error(
      `\n${variant.length} shell/lib pair(s) of variants of one property at equal specificity. A ` +
        'pillar sheet that re-emits the one Tailwind orders first overrides the other. Make the ' +
        'conditions exclusive (md:max-lg:p-6 lg:p-8, not md:p-6 lg:p-8):'
    );
    for (const c of variant) console.error(formatConflict(c));
  }
  if (plain.length > 0) {
    console.error(
      `\n${plain.length} pillar pair(s) of plain utilities of one property. Across sheets the ` +
        'shell sheet decides which wins. Remove the loser, merge them with cn(), or make them ' +
        'disjoint (py-2 px-4, not p-2 px-4):'
    );
    for (const c of plain) console.error(formatConflict(c));
  }
  const ok = floors.length === 0 && variant.length === 0 && plain.length === 0;
  if (ok) console.log('OK: no element depends on the order of two utilities across stylesheets.');
  return ok;
}

/**
 * Plant each shape the guard exists to catch, and each it must not report,
 * and check the result. Returns false (and says why) on any mismatch.
 *
 * @returns {boolean}
 */
function selfTest() {
  const shell = { variant: true, plain: false };
  const pillar = { variant: false, plain: true };
  /** @type {[string, string, Scope, string[]][]} */
  const cases = [
    [
      'variant pair in a string attribute',
      '<nav className="hidden md:flex lg:hidden" />',
      shell,
      ['md:flex|lg:hidden'],
    ],
    [
      'variant pair across cn() arguments',
      "<a className={cn('md:flex', open && 'lg:hidden')} />",
      shell,
      ['md:flex|lg:hidden'],
    ],
    [
      'variant pair in a template literal',
      '<a className={`md:p-2 ${x} lg:p-4`} />',
      shell,
      ['md:p-2|lg:p-4'],
    ],
    [
      'variant pair in a standalone cva base',
      "const v = cva('sm:w-4 md:w-8');",
      shell,
      ['sm:w-4|md:w-8'],
    ],
    ['two plain paddings with no merge', '<div className="p-2 p-4" />', pillar, ['p-2|p-4']],
    [
      'shorthand before longhand survives cn()',
      "<div className={cn('p-2 px-4')} />",
      pillar,
      ['p-2|px-4'],
    ],
    [
      'plain pair split across a ternary condition',
      "<div className={`flex ${a ? 'hidden' : ''}`} />",
      pillar,
      ['flex|hidden'],
    ],
    ['same variant twice is one rule, not two', '<a className="md:flex md:flex" />', shell, []],
    [
      'same utility under two variants sets one value',
      '<a className="md:flex lg:flex" />',
      shell,
      [],
    ],
    ['plain against variant is the sublayer case', '<a className="hidden md:flex" />', shell, []],
    [
      'different properties never compete',
      '<a className="md:px-2 lg:py-4 text-sm text-primary" />',
      pillar,
      [],
    ],
    [
      'ternary branches are exclusive',
      "<a className={open ? 'md:flex' : 'lg:hidden'} />",
      shell,
      [],
    ],
    ['cn() merges a same-property pair', "<a className={cn('p-2', big && 'p-4')} />", pillar, []],
    [
      'compared literals are not classes',
      "<a className={cn(size === 'p-2' && 'p-4')} />",
      pillar,
      [],
    ],
    ['other calls are not classes', "<a className={cn(t('p-2'), 'p-4')} />", pillar, []],
    [
      'cva options of one variant are exclusive',
      "cva('', { variants: { size: { sm: 'md:h-8', lg: 'lg:h-10' } } })",
      shell,
      [],
    ],
    [
      'cva defaultVariants are not classes',
      "cva('md:h-8', { defaultVariants: { size: 'lg:h-10' } })",
      shell,
      [],
    ],
    [
      'cva options of two variants compete',
      "cva('', { variants: { a: { x: 'md:h-8' }, b: { y: 'lg:h-10' } } })",
      shell,
      ['md:h-8|lg:h-10'],
    ],
    ['a class in a comment is not an element', '// <a className="md:flex lg:hidden" />', shell, []],
    [
      'variant shapes are out of the pillar scope',
      '<a className="md:flex lg:hidden" />',
      pillar,
      [],
    ],
    [
      'equal specificity with no decider is reported',
      '<tr className="hover:bg-a data-[state=on]:bg-b" />',
      shell,
      ['hover:bg-a|data-[state=on]:bg-b'],
    ],
    [
      'an unknown arbitrary variant is reported',
      '<a className="[&:nth-child(3)]:p-2 md:p-4" />',
      shell,
      ['[&:nth-child(3)]:p-2|md:p-4'],
    ],
    [
      'a breakpoint and its max- range are exclusive',
      '<a className="md:max-lg:p-6 lg:p-8" />',
      shell,
      [],
    ],
    ['not-X and X are exclusive', '<a className="not-dark:hover:bg-a dark:bg-b" />', shell, []],
    [
      'one data attribute with two values is exclusive',
      '<a className="data-[size=sm]:h-8 data-[size=lg]:h-10" />',
      shell,
      [],
    ],
    [
      'different specificity is order-independent',
      '<a className="hover:bg-a dark:hover:bg-b" />',
      shell,
      [],
    ],
    [
      'a third class that outranks both decides the pair',
      '<a className="hover:bg-a dark:bg-b dark:hover:bg-c" />',
      shell,
      [],
    ],
    [
      'variants aimed at other nodes do not compete',
      '<a className="[&_p]:my-1 [&_pre]:my-2 before:w-2 after:w-4" />',
      shell,
      [],
    ],
    [
      'important against normal is order-independent',
      '<a className="md:p-2! lg:p-4" />',
      shell,
      [],
    ],
  ];
  let ok = true;
  for (const [label, src, scope, expected] of cases) {
    const found = findConflicts('fixture.tsx', src, scope).map((c) =>
      c.error ? `error:${c.error}` : `${c.first}|${c.second}`
    );
    if (JSON.stringify(found) !== JSON.stringify(expected)) {
      console.error(
        `self-test FAILED: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(found)}`
      );
      ok = false;
    }
  }
  const broken = findConflicts(
    'fixture.tsx',
    "<a className={cn('md:flex', (open && 'lg:hidden')} />",
    shell
  );
  if (broken.length !== 1 || broken[0]?.error === undefined) {
    console.error(
      'self-test FAILED: an expression that never balances must be reported, not skipped'
    );
    ok = false;
  }
  const missing = scopeOf('pillars/shell/src/app/nav.tsx');
  if (missing === undefined || scopeOf('pillars/finance/app/src/page.tsx')?.plain !== true) {
    console.error('self-test FAILED: the scope map no longer recognises the shell or a pillar app');
    ok = false;
  }
  ok = selfTestTree() && ok;
  if (ok) console.log(`self-test OK: ${cases.length + 5} planted shapes classified as expected.`);
  return ok;
}

/**
 * The degenerate cases ADR-045 requires: a planted conflict is reported
 * through the real walk, a tree too small to be real fails its floors, and a
 * tree missing a scan root throws instead of passing.
 *
 * @returns {boolean}
 */
function selfTestTree() {
  let ok = true;
  const root = mkdtempSync(join(tmpdir(), 'tailwind-cascade-'));
  try {
    mkdirSync(join(root, 'pillars/shell/src'), { recursive: true });
    mkdirSync(join(root, 'pillars/media/app/src'), { recursive: true });
    mkdirSync(join(root, 'libs/ui/src'), { recursive: true });
    writeFileSync(
      join(root, 'pillars/shell/src/Nav.tsx'),
      '<nav className="md:block lg:hidden" />\n'
    );
    writeFileSync(join(root, 'pillars/media/app/src/Card.tsx'), '<div className="p-2 p-4" />\n');
    const { counts, conflicts } = auditTree(root);
    const found = conflicts.map((c) => `${c.kind}:${c.file}:${c.first}|${c.second}`).toSorted();
    const expected = [
      'plain:pillars/media/app/src/Card.tsx:p-2|p-4',
      'variant:pillars/shell/src/Nav.tsx:md:block|lg:hidden',
    ];
    if (JSON.stringify(found) !== JSON.stringify(expected)) {
      console.error(`self-test FAILED: the planted tree reported ${JSON.stringify(found)}`);
      ok = false;
    }
    if (floorViolations(counts).length !== 2) {
      console.error('self-test FAILED: a two-file tree must fail both discovery floors');
      ok = false;
    }
    rmSync(join(root, 'libs'), { recursive: true });
    let threw = false;
    try {
      auditTree(root);
    } catch {
      threw = true;
    }
    if (!threw) {
      console.error('self-test FAILED: a tree with no libs/ must throw, not pass');
      ok = false;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--self-test')) {
    console.error('Usage: node scripts/check-tailwind-cascade-conflicts.mjs [--self-test]');
    process.exit(2);
  }
  if (args.includes('--self-test')) process.exit(selfTest() ? 0 : 1);
  process.exit(run() ? 0 : 1);
}

if (import.meta.main) {
  main();
}
