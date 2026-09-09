import {
  createPackageNameResolver,
  SHARED_RUNTIME_ENTRY_POINTS,
  SHARED_RUNTIME_SPECIFIERS,
} from '@pops/pillar-sdk/remote-build';

import type { Plugin } from 'vite';

import type { PackageNameResolver } from '@pops/pillar-sdk/remote-build';

/**
 * The shell's half of the shared-runtime contract
 * (`@pops/pillar-sdk/remote-build`, and the docstring on
 * `src/app/external-ui.tsx`).
 *
 * A pillar mounted through the runtime loader is a separate build that marks
 * React, the router, the query client, i18next and `@pops/ui` **external** —
 * a second copy of any of them is a correctness failure the browser reports
 * as a bug in the pillar. So its bundle reaches the browser containing bare
 * specifiers, which a module URL cannot resolve on its own. This plugin makes
 * the shell able to answer them.
 *
 * Two pieces, and both are needed:
 *
 *  1. **A facade module per specifier**, added to the build as its own entry.
 *     Re-exporting rather than reusing a chunk is the point: Rollup prunes a
 *     chunk's exports to what other chunks import from it, so pointing an
 *     import map at the chunk that happens to hold React would hand a pillar
 *     whichever handful of hooks the shell itself uses. An entry that says
 *     `export * from 'react'` keeps the whole surface. React's own modules
 *     stay in a chunk shared with the shell's entry — same file, same
 *     evaluation, one instance.
 *  2. **An import map in `index.html`**, naming those entries. It is injected
 *     ahead of the app's module script because an import map must precede
 *     every module load it governs, and browsers ignore a second one.
 *
 * The map is built from the emitted filenames rather than from a convention:
 * the entries are hashed like every other asset, so they can stay under the
 * `/assets/` `immutable` rule while `index.html` — which carries the map — is
 * served `no-cache`. A deploy therefore moves both together, and no browser
 * can pair a new pillar bundle with a stale runtime.
 *
 * In dev there is no bundle, so the map names the dev server's own URL for
 * each virtual module. That keeps one code path in the pillar and one in the
 * loader: a remote bundle built for production loads unmodified against the
 * dev server.
 */

const VIRTUAL_PREFIX = 'virtual:pops-shared-runtime/';

/** Rollup's convention for an id no file on disk backs. */
const RESOLVED_PREFIX = `\0${VIRTUAL_PREFIX}`;

/**
 * A specifier as a single path segment: `react/jsx-runtime` → `react__jsx-
 * runtime`, `@tanstack/react-query` → `tanstack__react-query`. Only the shape
 * of the chunk name and the virtual id depend on this; the import map is keyed
 * by the real specifier throughout.
 */
function chunkNameFor(specifier: string): string {
  return `shared-runtime-${specifier.replace(/^@/, '').replaceAll('/', '__')}`;
}

function virtualIdFor(specifier: string): string {
  return `${VIRTUAL_PREFIX}${specifier}`;
}

function specifierFromResolvedId(resolvedId: string): string | undefined {
  if (!resolvedId.startsWith(RESOLVED_PREFIX)) return undefined;
  return resolvedId.slice(RESOLVED_PREFIX.length);
}

/** An export name a facade can re-export by name. */
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * The names a specifier exports, read by importing it here in Node, or
 * `undefined` when it cannot be imported outside a bundler.
 *
 * This exists because `export * from 'react'` does not do what it reads like.
 * React is CommonJS: a bundler wraps it in a factory and resolves named
 * imports as property reads afterwards, so there is no static export list for
 * `export *` to forward and the facade came out carrying nothing but
 * `default`. Every named import a pillar makes would have been `undefined` —
 * in a browser, at first render, with a clean build log. Naming the exports
 * explicitly is what makes them survive, and Node's own module namespace is
 * where the names come from, since it reads CommonJS with the same lexer a
 * bundler does.
 *
 * `@pops/ui` is the case that cannot work this way — its entry is TypeScript
 * source, which Node will not load — and it is also the case that does not
 * need to, being ESM all the way down. It falls back to `export *`.
 */
async function namedExportsOf(specifier: string): Promise<readonly string[] | undefined> {
  try {
    const namespace: Record<string, unknown> = await import(specifier);
    return Object.keys(namespace);
  } catch {
    return undefined;
  }
}

/**
 * The facade's source: the whole export surface of one specifier, re-exported
 * so an import map can point a remote bundle at it.
 *
 * `export *` deliberately omits `default` — that is the spec, not an
 * oversight — so a default is always re-exported by name. Emitting that line
 * for a specifier that has none is a build error rather than a no-op, which is
 * why the flag is carried beside the specifier rather than guessed.
 */
async function facadeSource(specifier: string, hasDefault: boolean): Promise<string> {
  const exported = await namedExportsOf(specifier);
  if (exported === undefined) {
    const lines = [`export * from '${specifier}';`];
    if (hasDefault) lines.push(`export { default } from '${specifier}';`);
    return `${lines.join('\n')}\n`;
  }

  const named = exported.filter((name) => name !== 'default' && IDENTIFIER.test(name));
  const lines: string[] = [];
  if (named.length > 0) lines.push(`export { ${named.join(', ')} } from '${specifier}';`);
  if (exported.includes('default')) lines.push(`export { default } from '${specifier}';`);
  return `${lines.join('\n')}\n`;
}

/**
 * The dev server's URL for a virtual module. Vite serves a resolved id at
 * `/@id/<id>` with the leading NUL escaped, which is the same module instance
 * its own optimized-deps graph hands the shell.
 */
function devUrlFor(specifier: string): string {
  return `/@id/__x00__${virtualIdFor(specifier)}`;
}

/**
 * The extra rollup entries the build needs: one facade per specifier, plus the
 * html entry Vite would otherwise have supplied on its own.
 */
function buildInputs(): Record<string, string> {
  return {
    index: 'index.html',
    ...Object.fromEntries(
      SHARED_RUNTIME_ENTRY_POINTS.map(({ specifier }) => [
        chunkNameFor(specifier),
        virtualIdFor(specifier),
      ])
    ),
  };
}

/** The import map's contents, from the build's output or from the dev server. */
function importMapFor(
  bundle: Readonly<Record<string, unknown>> | undefined
): Record<string, string> {
  if (bundle !== undefined) return buildImports(bundle);
  return Object.fromEntries(
    SHARED_RUNTIME_ENTRY_POINTS.map(({ specifier }) => [specifier, devUrlFor(specifier)])
  );
}

export function sharedRuntimePlugin(): Plugin {
  return {
    name: 'pops-shared-runtime',

    config(_config, { command }) {
      if (command !== 'build') return;
      return {
        build: {
          rollupOptions: {
            // Without this the facade entries are emitted with NO exports at
            // all: the bundler sees nothing inside the build importing them
            // and prunes an entry's signature down to its side effects. The
            // files still appear, still import the right chunks, and hand a
            // pillar an empty module namespace — which fails at the pillar's
            // first `useState`, in a browser, with nothing in the build log.
            preserveEntrySignatures: 'allow-extension',
            input: buildInputs(),
          },
        },
      };
    },

    resolveId(id) {
      return id.startsWith(VIRTUAL_PREFIX) ? `\0${id}` : undefined;
    },

    async load(id) {
      const specifier = specifierFromResolvedId(id);
      if (specifier === undefined) return undefined;
      const entry = SHARED_RUNTIME_ENTRY_POINTS.find((e) => e.specifier === specifier);
      if (entry === undefined) {
        throw new Error(`no shared-runtime entry point named '${specifier}'`);
      }
      return await facadeSource(entry.specifier, entry.hasDefault);
    },

    generateBundle(_options, bundle) {
      const duplicated = duplicatedSharedPackages(bundle);
      if (duplicated.length > 0) {
        throw new Error(
          `shared-runtime package(s) ended up in more than one chunk of the shell ` +
            `bundle: ${duplicated.join(', ')}. The import map would then hand a ` +
            `loader-mounted pillar a different instance than the shell uses, which ` +
            `is the failure this whole mechanism exists to prevent.`
        );
      }
    },

    transformIndexHtml: {
      // `post` for WHEN, `head-prepend` for WHERE, and the two are
      // independent. The emitted filenames only exist once the bundle is
      // generated, and a `pre` transform runs before that — it produced a
      // production `index.html` carrying the DEV urls, silently, because the
      // absent bundle is also how this hook recognises dev.
      order: 'post',
      handler(_html, ctx) {
        return [
          {
            tag: 'script',
            attrs: { type: 'importmap' },
            children: JSON.stringify({ imports: importMapFor(ctx.bundle) }, null, 2),
            injectTo: 'head-prepend' as const,
          },
        ];
      },
    },
  };
}

/**
 * Shared-runtime packages with a MODULE emitted into more than one chunk.
 *
 * The import map points a pillar at one file per specifier, and that is the
 * shell's own instance only because no module of those packages was copied
 * into two chunks. Nothing declares that — it is a property of how the graph
 * happened to be split — and it is the property the whole contract rests on,
 * so it is asserted on every build rather than assumed.
 *
 * Per module, not per package: a package's files are routinely *distributed*
 * across chunks, each evaluated once, which is ordinary code splitting and not
 * a second instance. Only the same module id in two chunks is.
 */
function duplicatedSharedPackages(
  bundle: Readonly<Record<string, unknown>>,
  packageNameOf: PackageNameResolver = createPackageNameResolver()
): string[] {
  const chunksByModule = new Map<string, { packageName: string; chunks: Set<string> }>();

  for (const [fileName, output] of Object.entries(bundle)) {
    for (const moduleId of moduleIdsOf(output)) {
      const packageName = packageNameOf(moduleId);
      if (packageName === undefined || !SHARED_RUNTIME_SPECIFIERS.includes(packageName)) continue;
      const seen = chunksByModule.get(moduleId) ?? { packageName, chunks: new Set<string>() };
      seen.chunks.add(fileName);
      chunksByModule.set(moduleId, seen);
    }
  }

  const offenders = new Set<string>();
  for (const { packageName, chunks } of chunksByModule.values()) {
    if (chunks.size > 1) offenders.add(packageName);
  }
  return [...offenders].toSorted();
}

/** The module ids one bundle output was assembled from; empty for an asset. */
function moduleIdsOf(output: unknown): string[] {
  if (typeof output !== 'object' || output === null || !('modules' in output)) return [];
  const modules = (output as { modules: unknown }).modules;
  if (typeof modules !== 'object' || modules === null) return [];
  return Object.keys(modules);
}

/**
 * Emitted URL per specifier, read from the build's own output. A missing entry
 * throws rather than being skipped: an import map short one specifier is a
 * pillar that loads until the first component reaching for it, and the failure
 * would surface in a browser rather than here.
 */
function buildImports(bundle: Readonly<Record<string, unknown>>): Record<string, string> {
  const byChunkName = new Map<string, string>();
  for (const [fileName, output] of Object.entries(bundle)) {
    const name =
      typeof output === 'object' && output !== null && 'name' in output
        ? (output as { name: unknown }).name
        : undefined;
    if (typeof name === 'string') byChunkName.set(name, fileName);
  }

  const imports: Record<string, string> = {};
  for (const { specifier } of SHARED_RUNTIME_ENTRY_POINTS) {
    const fileName = byChunkName.get(chunkNameFor(specifier));
    if (fileName === undefined) {
      throw new Error(
        `shared-runtime entry for '${specifier}' was not emitted; a loader-mounted ` +
          `pillar importing it would fail to resolve in the browser`
      );
    }
    imports[specifier] = `/${fileName}`;
  }
  return imports;
}

/** Exposed for `vite-plugin-shared-runtime.test.ts`; not part of the plugin. */
export const sharedRuntimeInternals = {
  chunkNameFor,
  facadeSource,
  devUrlFor,
  buildImports,
  duplicatedSharedPackages,
};
