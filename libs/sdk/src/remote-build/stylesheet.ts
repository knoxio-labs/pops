import type { Plugin } from 'vite';

/**
 * Where a pillar app keeps its remote stylesheet entry, relative to the app
 * root. `remoteBuildConfig` adds it to the build — the app's own source
 * never imports it — and the build emits it beside the JS entry as
 * `<pillar>.css`.
 *
 * The file is three lines and the same in every app, and it is a file rather
 * than something this module generates because its `@source` is relative to
 * where it sits: `./src` is the app's own source and nothing else, which is
 * what keeps a pillar's sheet to the utilities that pillar uses.
 *
 * ```css
 * @reference '@pops/ui/theme/globals.css';
 * @import 'tailwindcss/utilities' layer(utilities) source(none);
 * @source './src';
 * ```
 *
 * `@reference` makes the theme's tokens, variants and custom utilities
 * resolvable without emitting any of them; preflight, the tokens and the kit's
 * own utilities stay in the shell's stylesheet. `layer(utilities)` puts the
 * pillar's rules in the same cascade layer as the shell's, so they compete as
 * utilities rather than as unlayered CSS that would beat every layer.
 */
export const REMOTE_STYLESHEET_PATH = 'remote.css';

/**
 * The cascade sublayer a pillar sheet's base utilities are moved into:
 * `utilities.pillar-base`.
 */
export const PILLAR_BASE_LAYER = 'pillar-base';

/**
 * The top-level items of a stylesheet: each rule or at-rule with its block,
 * as written. Quoted strings, escapes and comments are stepped over, so a `{`
 * inside any of them does not open a block.
 */
function topLevelItems(css: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < css.length) {
    const skipTo = pastOpaque(css, i);
    if (skipTo !== undefined) {
      i = skipTo;
      continue;
    }
    const c = css.charAt(i);
    if (c === '{') depth += 1;
    if (c === '}') depth -= 1;
    i += 1;
    if (depth === 0 && (c === '}' || c === ';')) {
      items.push(css.slice(start, i));
      start = i;
    }
  }
  if (start < css.length) items.push(css.slice(start));
  return items;
}

/**
 * Where scanning resumes when `css[i]` opens something whose contents are not
 * structure — an escape, a quoted string or a comment — or undefined when it
 * does not.
 */
function pastOpaque(css: string, i: number): number | undefined {
  const c = css.charAt(i);
  if (c === '\\') return i + 2;
  if (c === '"' || c === "'") return endOf(css.indexOf(c, i + 1), 1, css.length);
  if (c === '/' && css.charAt(i + 1) === '*') return endOf(css.indexOf('*/', i + 2), 2, css.length);
  return undefined;
}

function endOf(found: number, width: number, fallback: number): number {
  return found === -1 ? fallback : found + width;
}

/**
 * A single class selector with no variant in it. Tailwind writes a variant
 * into the class name behind an escaped colon (`.md\:flex`), so any `\:`
 * disqualifies it; other escapes (`\/`, `\.`, `\[`) are ordinary utilities.
 */
const BASE_UTILITY_SELECTOR = /^\.(?:\\[^:]|[\w-])+$/;

/**
 * Whether an item is a base utility: a flat rule whose every selector is a
 * variant-free class, or an `@supports` block made only of such rules (the
 * fallback Tailwind emits for an opacity modifier belongs with its utility).
 */
function isBaseUtility(item: string): boolean {
  const open = item.indexOf('{');
  if (open === -1 || !item.endsWith('}')) return false;
  const prelude = item.slice(0, open).trim();
  const body = item.slice(open + 1, -1);
  if (prelude.startsWith('@supports')) {
    const inner = topLevelItems(body).filter((part) => part.trim() !== '');
    return inner.length > 0 && inner.every(isBaseUtility);
  }
  if (topLevelItems(body).some((part) => part.trimEnd().endsWith('}'))) return false;
  return prelude.split(',').every((selector) => BASE_UTILITY_SELECTOR.test(selector.trim()));
}

/**
 * Moves a pillar sheet's base utilities out of the `utilities` layer's own
 * rules and into a sublayer of it, leaving every variant rule where it was.
 *
 * The shell's sheet and every pillar's sheet emit into the one `utilities`
 * layer, and a pillar's sheet is linked after the shell's, so a rule the two
 * share is decided by the pillar's copy. For a base utility that is wrong.
 * Tailwind orders a base utility before every variant of the same property,
 * and a later copy of `.hidden` would beat the shell's own `md:flex` on the
 * shell's own app rail. That is the first thing a pillar with `hidden`
 * anywhere in its source did before this existed. In a sublayer the pillar's
 * base utilities still beat the `base` and `components` layers, and lose to
 * every rule directly in `utilities`, which is the order a single sheet would
 * have given them.
 *
 * What this does not cover: two different variants of one property on one
 * element, where the pillar re-emits the one Tailwind orders first. Only the
 * rarer variant-against-variant case is left to sheet order.
 *
 * @param css A compiled pillar stylesheet.
 * @returns The same rules, with the base utilities in `utilities.pillar-base`.
 */
export function layerPillarBaseUtilities(css: string): string {
  return topLevelItems(css)
    .map((item) => {
      const opening = /^\s*@layer\s+utilities\s*\{/.exec(item);
      if (opening === null || !item.endsWith('}')) return item;
      const rules = topLevelItems(item.slice(opening[0].length, -1));
      const base = rules.filter(isBaseUtility);
      if (base.length === 0) return item;
      const rest = rules.filter((rule) => !isBaseUtility(rule));
      return `@layer utilities{@layer ${PILLAR_BASE_LAYER}{${base.join('')}}${rest.join('')}}`;
    })
    .join('');
}

/**
 * Puts the app's stylesheet entry into the build, moves the emitted sheet's
 * base utilities into their sublayer ({@link layerPillarBaseUtilities}), and
 * fails the build when no `<pillar>.css` comes out of it.
 *
 * The import is appended to the remote entry here rather than written into
 * it: the entry is TypeScript that tests and type-checks load too, and a
 * `.css` side-effect import there needs a module declaration those
 * environments do not carry. Appending leaves every existing line where it
 * was, so the entry's source map still holds — ES imports are hoisted, so
 * where the line sits does not change the module.
 *
 * The emitted-file check catches what the import cannot: a stylesheet that
 * compiles to nothing. The manifest advertises `stylesheetUrl` regardless, and
 * a sheet that 404s leaves the pillar mounting without every class the shell
 * does not happen to carry, with nothing saying why.
 */
export function remoteStylesheet(entry: string, stylesheet: string, fileName: string): Plugin {
  // The entry as the bundler names it, which is not always the path it was
  // given: a symlinked directory resolves to its target.
  let entryId: string | undefined;
  return {
    name: 'pops-remote-stylesheet',
    enforce: 'post',
    async buildStart() {
      entryId = (await this.resolve(entry))?.id;
    },
    transform(code, id) {
      if (id !== entryId) return null;
      return { code: `${code}\nimport ${JSON.stringify(stylesheet)};\n`, map: null };
    },
    generateBundle(_options, bundle) {
      const sheet = bundle[fileName];
      if (sheet === undefined || sheet.type !== 'asset') {
        this.error(
          `the remote build emitted no ${fileName}: ${REMOTE_STYLESHEET_PATH} produced no CSS, ` +
            "so the stylesheet the manifest's stylesheetUrl names would not exist."
        );
      }
      const css =
        typeof sheet.source === 'string' ? sheet.source : new TextDecoder().decode(sheet.source);
      sheet.source = layerPillarBaseUtilities(css);
    },
  };
}
