import { posix } from 'node:path';

/** @param {string} path */
function containsControlCharacter(path) {
  for (let index = 0; index < path.length; index += 1) {
    const code = path.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/**
 * Reject noncanonical or interpolated container paths before comparing mount boundaries.
 * @param {unknown} path
 * @returns {path is string}
 */
export function isStoragePath(path) {
  return (
    typeof path === 'string' &&
    path.startsWith('/data/') &&
    !/[\\$]/u.test(path) &&
    !containsControlCharacter(path) &&
    path
      .split('/')
      .slice(1)
      .every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

/** @param {string} value @returns {unknown} */
function pathScalar(value) {
  const scalar = value.replace(/\s+#.*$/u, '').trim();
  if (scalar.startsWith('"')) return JSON.parse(scalar);
  if (scalar.startsWith("'") && scalar.endsWith("'")) {
    return scalar.slice(1, -1).replaceAll("''", "'");
  }
  return scalar;
}

/**
 * Read the maintained block-style Litestream `dbs[].path` declarations without dependencies.
 * Unsupported list shapes, missing paths and unsafe paths fail closed instead of narrowing coverage.
 * @param {string} source
 * @returns {string[]}
 */
export function declaredDatabasePaths(source) {
  const paths = [];
  let inDatabases = false;
  let declarations = 0;
  let entries = 0;
  let entryPaths = 0;
  for (const line of source.split(/\r?\n/u)) {
    if (/^\s*(?:#.*)?$/u.test(line)) continue;
    if (/^dbs:/u.test(line)) {
      if (!/^dbs:\s*(?:#.*)?$/u.test(line) || declarations !== 0) {
        throw new Error('Unsupported Litestream dbs declaration');
      }
      declarations += 1;
      inDatabases = true;
      continue;
    }
    if (/^\S/u.test(line)) inDatabases = false;
    if (!inDatabases) continue;
    if (/\t/u.test(line)) throw new Error('Unsupported Litestream indentation');
    if (/^ {2}-(?:\s|$)/u.test(line)) {
      if (entries !== 0 && entryPaths !== 1) throw new Error('Missing Litestream database path');
      entries += 1;
      entryPaths = 0;
    }
    const match = /^ {2}(?:- | {2})path:\s*(.*?)\s*$/u.exec(line);
    if (!match) continue;
    const path = pathScalar(match[1] ?? '');
    if (entries === 0 || entryPaths !== 0 || !isStoragePath(path)) {
      throw new Error('Invalid Litestream database path');
    }
    entryPaths += 1;
    paths.push(path);
  }
  if (declarations !== 1 || entries === 0 || entryPaths !== 1) {
    throw new Error('Missing Litestream database path');
  }
  return paths;
}

/**
 * Canonical directory containment; a similarly prefixed sibling is never a child.
 * @param {string} directory
 * @param {string} path
 * @returns {boolean}
 */
export function storageContains(directory, path) {
  return isStoragePath(directory) && isStoragePath(path) && path.startsWith(`${directory}/`);
}

/** @typedef {{source: string, target: string, readOnly: boolean, isBind?: boolean}} StorageMount */

/** @param {string} path @param {StorageMount[]} mounts @returns {StorageMount[]} */
function effectiveMounts(path, mounts) {
  const covering = mounts.filter(
    (mount) => mount.target === path || storageContains(mount.target, path)
  );
  const longest = Math.max(...covering.map((mount) => mount.target.length));
  return covering.filter((mount) => mount.target.length === longest);
}

/**
 * Enforce the effective mount for every declared DB, including nested mount shadowing.
 * @param {string} id
 * @param {string[]} paths
 * @param {StorageMount[]} mounts
 * @param {boolean} backup Whether to reject storage unrelated to the replicated databases.
 * @returns {string[]}
 */
export function databaseMountViolations(id, paths, mounts, backup) {
  const violations = [];
  for (const mount of mounts) {
    if (mount.target.startsWith('/data') && !isStoragePath(mount.target))
      violations.push('invalid data mount target');
    if (
      backup &&
      mount.target.startsWith('/data') &&
      !paths.some((path) => storageContains(mount.target, path))
    ) {
      violations.push('backup mounts storage unrelated to its declared databases');
    }
  }
  if (paths.length === 0) violations.push('missing database declaration');
  for (const path of paths) {
    if (!isStoragePath(path)) {
      violations.push('invalid database path');
      continue;
    }
    const effective = effectiveMounts(path, mounts);
    const mount = effective[0];
    if (!mount) {
      violations.push(`missing a volume mounting ${posix.dirname(path)}`);
    } else if (effective.length !== 1 || mount.target === path) {
      violations.push(`ambiguous or file-only database mount for ${path}`);
    } else if (
      !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(mount.source) ||
      mount.readOnly ||
      mount.isBind === true
    ) {
      violations.push(
        `invalid database mount ${mount.source} at ${mount.target} for ${path}; ${id} requires a writable named volume`
      );
    }
    if (
      mount &&
      mounts.some(
        (other) =>
          other !== mount &&
          other.source === mount.source &&
          other.target.startsWith('/data') &&
          !paths.some((declared) => storageContains(other.target, declared))
      )
    )
      violations.push('database DATA volume also mounts unrelated storage');
  }
  return violations;
}

/**
 * Require backup and every owning writer to address the same file within the named DATA volume.
 * Both processes require writable DATA for SQLite/shadow WAL; nested volume options are unsupported.
 * @param {string} id
 * @param {string[]} paths
 * @param {StorageMount[]} reader
 * @param {StorageMount[][]} writers
 * @returns {string[]}
 */
export function databaseReplicaViolations(id, paths, reader, writers) {
  const violations = databaseMountViolations(id, paths, reader, true);
  if (violations.length > 0) return violations;
  if (writers.length === 0) return ['missing an owning DATA writer'];
  for (const writer of writers) {
    const problems = databaseMountViolations(id, paths, writer, false);
    if (problems.length > 0) {
      violations.push(...problems);
      continue;
    }
    for (const path of paths) {
      const reading = effectiveMounts(path, reader)[0];
      const writing = effectiveMounts(path, writer)[0];
      if (
        !reading ||
        !writing ||
        reading.source !== writing.source ||
        posix.relative(reading.target, path) !== posix.relative(writing.target, path)
      ) {
        violations.push(
          `backup mount ${reading?.source ?? '(missing)'} for ${path} expected ${writing?.source ?? '(missing)'}; backup and writer address different volume-relative database paths`
        );
      }
    }
  }
  return violations;
}
