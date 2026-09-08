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
 * The shared-runtime packages that ended up **inside** a built bundle,
 * given the resolved module ids its chunks were assembled from.
 *
 * Reads ids rather than emitted source: a chunk that contains React carries a
 * `.../node_modules/react/index.js` module id, and no amount of minification
 * removes it from the build's own record. Grepping the output for a marker
 * string would pass the day React's minifier renames it.
 *
 * @param moduleIds Resolved module ids across every emitted chunk.
 * @returns The offending package names, sorted, without duplicates.
 */
export function findBundledSharedRuntime(moduleIds: Iterable<string>): string[] {
  const offenders = new Set<string>();
  for (const id of moduleIds) {
    const packageName = packageNameOf(id);
    if (packageName !== undefined && SHARED_RUNTIME_SPECIFIERS.includes(packageName)) {
      offenders.add(packageName);
    }
  }
  return [...offenders].toSorted();
}

/**
 * The installed package a resolved module id belongs to, or `undefined` for a
 * first-party source file. Reads the last `node_modules/` segment so a
 * pnpm-virtual-store path (`.../node_modules/.pnpm/react@19.2.8/node_modules/
 * react/index.js`) reports `react` and not `.pnpm`.
 */
function packageNameOf(moduleId: string): string | undefined {
  const marker = '/node_modules/';
  const at = moduleId.lastIndexOf(marker);
  if (at === -1) return undefined;
  const rest = moduleId.slice(at + marker.length);
  const segments = rest.split('/');
  const [first, second] = segments;
  if (first === undefined || first.length === 0) return undefined;
  if (first.startsWith('@')) {
    return second === undefined ? undefined : `${first}/${second}`;
  }
  return first;
}
