import { isMapping } from '../ci/config-parse.mjs';

/** @typedef {{ from: string, version: string, resolved?: string, dependencies?: DependencyMap, deduped?: boolean, dedupedDependenciesCount?: number }} DependencyNode */
/** @typedef {Record<string, DependencyNode>} DependencyMap */
/** @typedef {Record<string, DependencyMap>} DependencyRoot */

const categories = ['dependencies', 'devDependencies', 'optionalDependencies'];
const rootKeys = new Set(['name', 'version', 'path', 'private', ...categories]);
const nodeKeys = new Set([
  'from',
  'version',
  'path',
  'resolved',
  'dependencies',
  'deduped',
  'dedupedDependenciesCount',
]);

/** @param {Record<string, unknown>} value @param {ReadonlySet<string>} allowed */
function requireKeys(value, allowed) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unsupported pnpm list field: ${key}`);
  }
}

/** @param {unknown} value @returns {DependencyMap} */
function dependencyMap(value) {
  if (!isMapping(value)) throw new Error('Expected a pnpm dependency mapping');
  /** @type {DependencyMap} */
  const result = {};
  for (const [alias, node] of Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b))) {
    Object.defineProperty(result, alias, {
      value: dependencyNode(node),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

/** @param {Record<string, unknown>} value @returns {{ resolved?: string }} */
function resolvedMetadata(value) {
  if (!Object.hasOwn(value, 'resolved')) return {};
  if (typeof value.resolved !== 'string' || value.resolved === '')
    throw new Error('Unsupported pnpm resolved provenance');
  return { resolved: value.resolved };
}

/** @param {Record<string, unknown>} value @returns {{ deduped?: boolean, dedupedDependenciesCount?: number }} */
function deduplication(value) {
  /** @type {{ deduped?: boolean, dedupedDependenciesCount?: number }} */
  const result = {};
  if (Object.hasOwn(value, 'deduped')) {
    if (typeof value.deduped !== 'boolean') throw new Error('Unsupported pnpm deduplication flag');
    result.deduped = value.deduped;
  }
  if (Object.hasOwn(value, 'dedupedDependenciesCount')) {
    if (
      typeof value.dedupedDependenciesCount !== 'number' ||
      !Number.isSafeInteger(value.dedupedDependenciesCount) ||
      value.dedupedDependenciesCount < 0
    )
      throw new Error('Unsupported pnpm deduplication count');
    result.dedupedDependenciesCount = value.dedupedDependenciesCount;
  }
  return result;
}

/** @param {unknown} value @returns {DependencyNode} */
function dependencyNode(value) {
  if (
    !isMapping(value) ||
    typeof value.from !== 'string' ||
    value.from === '' ||
    typeof value.version !== 'string' ||
    value.version === ''
  ) {
    throw new Error('Missing canonical pnpm dependency identity');
  }
  requireKeys(value, nodeKeys);
  /** @type {DependencyNode} */
  const node = {
    from: value.from,
    version: value.version,
    ...resolvedMetadata(value),
    ...deduplication(value),
  };
  if (Object.hasOwn(value, 'dependencies')) node.dependencies = dependencyMap(value.dependencies);
  return node;
}

/**
 * Canonicalize the pinned pnpm list JSON, preserving categories, aliases, identities,
 * provenance and dependency edges. Root metadata and filesystem paths are not graph identity.
 * @param {string} source The public CLI's JSON output.
 * @returns {DependencyRoot[]}
 */
export function parsePnpmDependencyGraph(source) {
  /** @type {unknown} */
  const roots = JSON.parse(source);
  if (!Array.isArray(roots) || roots.length > 1)
    throw new Error('Expected one isolated pnpm list root');
  return roots.map((root) => {
    if (!isMapping(root)) throw new Error('Expected a pnpm list root mapping');
    requireKeys(root, rootKeys);
    return Object.fromEntries(
      categories.map((category) => [category, dependencyMap(root[category] ?? {})])
    );
  });
}

/**
 * EX-2 currently supports the root policy's explicit package@version selectors.
 * Broader pnpm name/range selectors require an explicit protocol extension, never silent omission.
 * @param {string} selector The authoritative root patch key.
 * @returns {{ name: string, version: string }}
 */
export function exactPatchSelector(selector) {
  const match =
    /^((?:@[^/@\s]+\/)?[^/@\s]+)@([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/u.exec(
      selector
    );
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new Error(
      `EX-2 patch projection requires an exact package@version selector; extend the protocol before using ${selector}`
    );
  }
  return { name: match[1], version: match[2] };
}

/** @param {DependencyMap} nodes @param {{ name: string, version: string }} expected @returns {boolean} */
function mapContains(nodes, expected) {
  return Object.values(nodes).some(
    (node) =>
      (node.from === expected.name && node.version === expected.version) ||
      (node.dependencies !== undefined && mapContains(node.dependencies, expected))
  );
}

/** @param {DependencyRoot[]} graph @param {{ name: string, version: string }} expected @returns {boolean} */
function graphContains(graph, expected) {
  return graph.some((root) => Object.values(root).some((nodes) => mapContains(nodes, expected)));
}

/**
 * Project exact root policy through the resolved graph and pnpm's native selector query.
 * A query can match an alias, so only actual canonical name/version identities admit a patch.
 * @param {Record<string, string> | null} patches Immutable root policy.
 * @param {ReturnType<typeof parsePnpmDependencyGraph>} graph Full unfiltered resolved graph.
 * @param {(selector: string) => Promise<string>} query Native pnpm list JSON for that selector.
 * @returns {Promise<Record<string, string>>}
 */
export async function projectResolvedPatches(patches, graph, query) {
  const matches = await Promise.all(
    Object.entries(patches ?? {}).map(async ([selector, path]) => {
      const expected = exactPatchSelector(selector);
      const matched = graphContains(parsePnpmDependencyGraph(await query(selector)), expected);
      if (matched !== graphContains(graph, expected))
        throw new Error('pnpm patch query disagrees with its resolved dependency graph');
      return { selector, path, matched };
    })
  );
  /** @type {Record<string, string>} */
  const selected = {};
  for (const { selector, path, matched } of matches) if (matched) selected[selector] = path;
  return selected;
}
