import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

/**
 * The shared-runtime contract for a pillar UI the shell mounts through its
 * runtime loader (`pillars/shell/src/app/external-ui.tsx`).
 *
 * A loader-mounted pillar is a separate build. Anything it bundles is a
 * second copy at runtime, and for a package holding module-global or React
 * context state a second copy is not a size problem but a correctness one:
 * two React copies give two dispatchers and the pillar's first hook throws
 * `Invalid hook call`; two `@tanstack/react-query` copies give a component
 * reading an empty cache through a provider it cannot see; two `i18next`
 * copies give a pillar rendering raw keys because the instance holding the
 * resources is the other one. None of those fail at build time, and each
 * presents as a bug in the pillar rather than in the packaging.
 *
 * So the contract is: **the shell owns one instance of every specifier below,
 * and a loader-mounted pillar's bundle imports them rather than containing
 * them.** The pillar build marks them external; the shell resolves the bare
 * specifiers to its own chunks through an import map it emits. Externalising
 * without that import map is what makes the failure loud — the browser
 * refuses a bare specifier it cannot resolve — instead of silent.
 *
 * The list is deliberately short. A package earns a place on it by holding
 * state a second copy would split, not by being large or by being shared:
 * `@pops/navigation`'s icon map and `@pops/types` are duplicated harmlessly
 * and stay bundled, because externalising them would make the import map the
 * shell has to emit grow without buying anything.
 */

/**
 * Package names a loader-mounted pillar bundle must import rather than
 * contain. Subpaths are covered — `react/jsx-runtime` and `@pops/ui/theme`
 * both resolve to the same instance as their package root.
 *
 * Most of these are here because a second instance is a correctness bug: two
 * React dispatchers, a second query cache, a second i18n. `recharts` is here
 * for a different reason that is no less binding — its dependency subtree is
 * partly CommonJS and `require()`s React at module scope. Bundled beside an
 * externalised React, the emitted `require` has nothing to resolve against,
 * and the pillar throws on first mount rather than merely shipping a
 * duplicate. So a bundle that externalises React cannot contain recharts.
 */
export const SHARED_RUNTIME_SPECIFIERS: readonly string[] = [
  'react',
  'react-dom',
  'react-router',
  '@tanstack/react-query',
  'i18next',
  'react-i18next',
  '@pops/ui',
  'recharts',
];

/**
 * Every specifier a remote bundle may actually import, including the subpaths
 * that resolve to a module of their own.
 *
 * `SHARED_RUNTIME_SPECIFIERS` says what a bundle must not contain; this says
 * what the host has to be able to hand it. They are different lists because a
 * package root and its subpaths are separate modules to a browser: an import
 * map keyed only on `react` leaves `react/jsx-runtime` unresolvable, and every
 * bundle compiled with the automatic JSX runtime imports it. Both JSX runtimes
 * are here because a bundle built in either mode must load against the same
 * host.
 *
 * `hasDefault` records whether the specifier exports a default binding. The
 * host's re-export facade needs it and cannot infer it —
 * `export { default } from 'react-router'` is a build error rather than a
 * no-op — and `pillars/shell` checks each flag against the real module so the
 * record cannot quietly go stale.
 *
 * The binding it describes is the one the BROWSER gets, which is not always
 * the one Node reports. A dual-published package resolves to its CommonJS
 * build under Node — where the namespace carries an `__esModule` marker and a
 * synthesised `default` — and to a real ESM build in the browser, which has
 * neither. `recharts` is exactly that: flagged `false` because the module the
 * facade re-exports from has no default, whatever `await import('recharts')`
 * shows at a Node prompt.
 */
export const SHARED_RUNTIME_ENTRY_POINTS: readonly {
  readonly specifier: string;
  readonly hasDefault: boolean;
}[] = [
  { specifier: 'react', hasDefault: true },
  { specifier: 'react/jsx-runtime', hasDefault: true },
  { specifier: 'react/jsx-dev-runtime', hasDefault: true },
  { specifier: 'react-dom', hasDefault: true },
  { specifier: 'react-dom/client', hasDefault: true },
  { specifier: 'react-router', hasDefault: false },
  { specifier: '@tanstack/react-query', hasDefault: false },
  { specifier: 'i18next', hasDefault: true },
  { specifier: 'react-i18next', hasDefault: false },
  { specifier: '@pops/ui', hasDefault: false },
  { specifier: 'recharts', hasDefault: false },
];

/**
 * True when an import specifier names a shared-runtime package or one of its
 * subpaths. Suitable as a Rollup `external` predicate.
 *
 * Matches on package-name boundaries so a package whose name merely starts
 * with a shared one (`react-router-dom`, `@pops/ui-kit`) is not swept in by
 * accident — that would externalise a specifier the shell's import map has no
 * entry for, and the pillar would fail to load rather than merely ship a
 * duplicate.
 */
/**
 * `define` entries every remote bundle needs.
 *
 * A remote bundle is loaded by the browser as a plain ES module, with no
 * bundler-provided `process` shim around it. Vite's own `define` covers the
 * app's source, but a CJS dependency that reaches the browser through the
 * bundle carries its `process.env.NODE_ENV` branch with it — the shape
 * `use-sync-external-store` and much of the React ecosystem still ships — and
 * that branch is evaluated at module scope. The result is a bundle that
 * builds cleanly, passes every unit test that imports it in Node (where
 * `process` exists), and throws `ReferenceError: process is not defined` the
 * first time a browser mounts it, surfacing as the shell's "interface could
 * not be loaded" placeholder rather than as anything naming the cause.
 *
 * Pinned to `'production'` rather than read from the ambient environment:
 * these bundles are only ever built to be served, and a bundle whose contents
 * depended on who ran the build is the defect `scripts/build-remote.ts`
 * already sets `NODE_ENV` to avoid.
 */
export const REMOTE_BUILD_DEFINE: Readonly<Record<string, string>> = {
  'process.env.NODE_ENV': JSON.stringify('production'),
};

/**
 * Emitted chunks that read the `process` global without checking for it.
 *
 * {@link REMOTE_BUILD_DEFINE} removes the common case, but it only rewrites
 * the exact `process.env.NODE_ENV` member expression; a dependency reading
 * `process.env` wholesale, or `process.platform`, survives it and throws in a
 * browser exactly the same way. So the build asserts the absence rather than
 * trusting the `define` to have covered everything.
 *
 * **A chunk containing any `typeof process` check is cleared, not scanned.**
 * Feature-detecting `process` is how a library ships one build for Node and
 * the browser, and it is extremely common in the dependency trees that reach
 * these bundles: `pdfjs-dist`, for one, computes `typeof process == "object"
 * && …` once and guards every later `process.getBuiltinModule` behind it.
 * Flagging those would make this guard fire on working bundles, and a guard
 * that cries wolf gets deleted rather than obeyed.
 *
 * The cost of that is real and worth stating: a chunk that guards one read
 * and forgets another is cleared by the first. What remains caught is the
 * shape that actually broke — an unconditional read at module scope, with no
 * detection anywhere in the chunk — which is what a CJS dependency's
 * `process.env.NODE_ENV` branch compiles to.
 *
 * `process` matches only as a whole word not preceded by a `.`, so a property
 * or local named `process` — `queue.process(...)`, `preprocess` — is not
 * mistaken for the global.
 */
export function findProcessGlobalUsage(
  chunks: readonly { readonly fileName: string; readonly code: string }[]
): string[] {
  const globalProcess = /(?<![.\w$])process\s*\./;
  const featureDetected = /typeof\s+process\b/;
  return chunks
    .filter((chunk) => globalProcess.test(chunk.code) && !featureDetected.test(chunk.code))
    .map((chunk) => chunk.fileName);
}

export function isSharedRuntimeSpecifier(specifier: string): boolean {
  return SHARED_RUNTIME_SPECIFIERS.some(
    (shared) => specifier === shared || specifier.startsWith(`${shared}/`)
  );
}

/**
 * Answers which package a resolved module id belongs to, by locating the
 * nearest `package.json` at or above it and reading its `name`. Returns
 * `undefined` for an id that belongs to no package.
 */
export type PackageNameResolver = (moduleId: string) => string | undefined;

/**
 * The shared-runtime packages that ended up **inside** a built bundle,
 * given the resolved module ids its chunks were assembled from.
 *
 * Reads ids rather than emitted source: a chunk that contains React carries a
 * module id naming the file it came from, and no amount of minification
 * removes it from the build's own record. Grepping the output for a marker
 * string would pass the day React's minifier renames it.
 *
 * The id is attributed by walking up to the nearest `package.json`, not by
 * looking for a `/node_modules/` segment. A workspace package is the reason:
 * `@pops/ui` resolves to `libs/ui/src/index.ts` — its `main` points at source
 * and pnpm links it — so its module ids carry no `node_modules` anywhere. A
 * path-segment check reports a clean bundle for the one package on this list
 * that a repo-local build is most likely to inline, which is the failure this
 * function exists to catch.
 *
 * @param moduleIds Resolved module ids across every emitted chunk.
 * @param packageNameOf Attributes an id to a package; see
 *   `createPackageNameResolver` for the filesystem-backed one.
 * @returns The offending package names, sorted, without duplicates.
 */
export function findBundledSharedRuntime(
  moduleIds: Iterable<string>,
  packageNameOf: PackageNameResolver
): string[] {
  const offenders = new Set<string>();
  for (const id of moduleIds) {
    const packageName = packageNameOf(id);
    if (packageName !== undefined && SHARED_RUNTIME_SPECIFIERS.includes(packageName)) {
      offenders.add(packageName);
    }
  }
  return [...offenders].toSorted();
}

/** The two filesystem reads the package walk performs. */
export interface ManifestFiles {
  readonly exists: (path: string) => boolean;
  readonly read: (path: string) => string;
}

const nodeFiles: ManifestFiles = {
  exists: (path) => existsSync(path),
  read: (path) => readFileSync(path, 'utf8'),
};

/**
 * A filesystem-backed `PackageNameResolver`: walks up from a module id to the
 * nearest `package.json` and returns its `name`.
 *
 * One mechanism covers both kinds of dependency. For an installed package the
 * nearest manifest is the package's own, so a pnpm virtual-store path
 * (`.../node_modules/.pnpm/react@19.2.8/node_modules/react/index.js`) reports
 * `react` rather than `.pnpm`. For a workspace package linked into the build
 * it reports the same name from `libs/<x>/package.json`, which no path-segment
 * check could have found.
 *
 * Results are memoised per directory: a bundle's module ids cluster into a
 * handful of packages, and the walk would otherwise `stat` the same
 * directories once per file.
 *
 * Node-only. `@pops/pillar-sdk/remote-build` is imported by build scripts and
 * never by a shipped bundle.
 *
 * @param files Filesystem reads, injectable so the walk's termination can be
 *   driven over layouts a test cannot create — a nameless `package.json` at
 *   the root among them.
 */
export function createPackageNameResolver(files: ManifestFiles = nodeFiles): PackageNameResolver {
  const cache = new Map<string, string | undefined>();

  function nameForDirectory(directory: string): string | undefined {
    const cached = cache.get(directory);
    if (cached !== undefined || cache.has(directory)) return cached;

    const parent = dirname(directory);
    // `dirname('/')` is `/`, so this is where the walk stops. It gates BOTH
    // branches below: a nameless `package.json` at the filesystem root would
    // otherwise recurse into itself until the stack ran out, which is the
    // same non-termination the missing-manifest case guards against and has
    // no reason to be treated differently.
    const atRoot = parent === directory;
    const climb = (): string | undefined => (atRoot ? undefined : nameForDirectory(parent));

    const manifest = join(directory, 'package.json');
    let name: string | undefined;
    if (files.exists(manifest)) {
      const parsed: unknown = JSON.parse(files.read(manifest));
      const declared =
        typeof parsed === 'object' && parsed !== null && 'name' in parsed
          ? (parsed as { name: unknown }).name
          : undefined;
      // A nameless package.json (a bare `{ "type": "module" }` marker, which
      // several packages drop into a subdirectory) does not end the walk —
      // the owning package is still above it.
      name = typeof declared === 'string' ? declared : climb();
    } else {
      name = climb();
    }

    cache.set(directory, name);
    return name;
  }

  return (moduleId) => {
    // Rollup decorates some ids (`\0virtual:…`, `id?query`); neither names a
    // file on disk, and neither can be a shared-runtime package.
    if (moduleId.startsWith('\0')) return undefined;
    const [path] = moduleId.split('?');
    if (path === undefined || !isAbsolute(path)) return undefined;
    return nameForDirectory(dirname(path));
  };
}
