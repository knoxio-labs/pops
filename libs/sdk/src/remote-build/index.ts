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
 */
export const SHARED_RUNTIME_SPECIFIERS: readonly string[] = [
  'react',
  'react-dom',
  'react-router',
  '@tanstack/react-query',
  'i18next',
  'react-i18next',
  '@pops/ui',
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
