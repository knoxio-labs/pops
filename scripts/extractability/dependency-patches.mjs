import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'yaml';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Read the authoritative dependency-patch map without discarding malformed policy.
 * Patch files must remain relative to the workspace so an extracted install can carry them.
 * @param {string} [source] The root workspace YAML.
 * @returns {Record<string, string> | null}
 */
export function rootPatchedDependencies(
  source = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8')
) {
  const doc = parseYaml(source);
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) {
    throw new Error('pnpm-workspace.yaml does not parse to a mapping');
  }
  if (!('patchedDependencies' in doc)) return null;
  const patches = doc.patchedDependencies;
  if (typeof patches !== 'object' || patches === null || Array.isArray(patches)) {
    throw new Error('patchedDependencies must be a mapping');
  }
  /** @type {Record<string, string>} */
  const result = {};
  for (const [name, path] of Object.entries(patches)) {
    if (
      name === '' ||
      typeof path !== 'string' ||
      path === '' ||
      isAbsolute(path) ||
      normalize(path) === '.' ||
      normalize(path) === '..' ||
      normalize(path).startsWith('../')
    ) {
      throw new Error('patchedDependencies must name workspace-contained patch files');
    }
    Object.defineProperty(result, name, {
      value: path,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return result;
}

/**
 * Capture every configured patch before dependency resolution; no install can retarget its bytes.
 * @param {Record<string, string> | null} patches The authoritative root mapping.
 * @param {string} [sourceRoot] The owning workspace root.
 * @returns {ReadonlyMap<string, Buffer>}
 */
export function captureRootPatchFiles(patches, sourceRoot = repoRoot) {
  const source = realpathSync(sourceRoot);
  const files = [...new Set(Object.values(patches ?? {}))].map((path) => {
    const file = realpathSync(resolve(source, path));
    const sourceRelative = relative(source, file);
    if (sourceRelative === '..' || sourceRelative.startsWith('../') || isAbsolute(sourceRelative)) {
      throw new Error('Dependency patch escapes the owning workspace');
    }
    return { path, bytes: readFileSync(file) };
  });
  return new Map(files.map(({ path, bytes }) => [path, bytes]));
}

/**
 * Copy only the selected captured bytes at their authoritative relative paths.
 * @param {string} destination The private workspace root.
 * @param {Record<string, string> | null} patches Selected root policy.
 * @param {ReadonlyMap<string, Buffer>} files Immutable pre-resolution source bytes.
 */
export function stageRootPatchFiles(destination, patches, files) {
  const selected = [...new Set(Object.values(patches ?? {}))].map((path) => {
    const bytes = files.get(path);
    if (bytes === undefined) throw new Error('Selected dependency patch was not captured');
    return { path, bytes };
  });
  for (const { path, bytes } of selected) {
    const target = resolve(destination, path);
    const targetRelative = relative(resolve(destination), target);
    if (targetRelative === '..' || targetRelative.startsWith('../') || isAbsolute(targetRelative)) {
      throw new Error('Dependency patch escapes the sandbox workspace');
    }
    let existingParent = dirname(target);
    while (!existsSync(existingParent)) existingParent = dirname(existingParent);
    const parentRelative = relative(realpathSync(destination), realpathSync(existingParent));
    if (parentRelative === '..' || parentRelative.startsWith('../') || isAbsolute(parentRelative)) {
      throw new Error('Dependency patch destination escapes the sandbox workspace');
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes, { flag: 'wx' });
  }
}

/**
 * Copy root patches directly for callers that already selected the applicable policy.
 * Existing destination files are never overwritten.
 * @param {string} destination The private workspace root.
 * @param {Record<string, string> | null} patches Applicable root policy.
 * @param {string} [sourceRoot] The owning workspace root.
 */
export function copyRootPatchFiles(destination, patches, sourceRoot = repoRoot) {
  stageRootPatchFiles(destination, patches, captureRootPatchFiles(patches, sourceRoot));
}
