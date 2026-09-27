import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const RELEASES_DIRECTORY = '.ui-dev-releases';
const CURRENT_RELEASE_FILE = '.ui-dev-current.json';

/**
 * Parse repeated `--pillar <id>` options from a local UI watcher command.
 *
 * @param {readonly string[]} args Command-line arguments after the node executable.
 * @returns {string[]} The requested pillar ids, in declaration order.
 */
export function pillarIdsFromArgs(args) {
  /** @type {string[]} */
  const ids = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--pillar') continue;
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error('`--pillar` needs a pillar id');
    }
    if (!/^[a-z][a-z0-9-]*$/.test(value)) {
      throw new Error(`invalid pillar id: ${value}`);
    }
    if (!ids.includes(value)) ids.push(value);
    index += 1;
  }
  if (ids.length === 0) throw new Error('provide at least one `--pillar <id>`');
  return ids;
}

/**
 * Find app packages that publish a loader-mounted remote build.
 *
 * @param {string} repoRoot Absolute repository root.
 * @returns {Promise<string[]>} Pillar ids with a `vite.remote.config.ts` app build.
 */
export async function discoverRemotePillars(repoRoot) {
  const pillarsRoot = path.join(repoRoot, 'pillars');
  const entries = await readdir(pillarsRoot, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
  const matching = await Promise.all(
    candidates.map(async (pillarId) => {
      const config = path.join(pillarsRoot, pillarId, 'app', 'vite.remote.config.ts');
      try {
        await readFile(config);
        return pillarId;
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          return undefined;
        }
        throw error;
      }
    })
  );
  return matching.filter((pillarId) => pillarId !== undefined);
}

/**
 * Return whether a filesystem change can alter a pillar's remote bundle.
 *
 * @param {string} appRoot Absolute app package path.
 * @param {string} changedPath Absolute changed path.
 * @param {readonly string[]} [sharedRoots] Direct shared-library roots consumed by the app.
 * @returns {boolean} Whether a rebuild is required.
 */
export function isRemoteBuildInput(appRoot, changedPath, sharedRoots = []) {
  const relative = path.relative(appRoot, changedPath);
  if (!relative.startsWith('..') && !path.isAbsolute(relative) && relative !== '') {
    if (relative.startsWith(`src${path.sep}`)) return true;
    if (relative.startsWith(`scripts${path.sep}`)) return true;
    return ['remote.css', 'vite.remote.config.ts', 'package.json'].includes(relative);
  }
  return sharedRoots.some((root) => {
    const sharedRelative = path.relative(root, changedPath);
    return (
      sharedRelative !== '' &&
      !sharedRelative.startsWith('..') &&
      !path.isAbsolute(sharedRelative) &&
      !sharedRelative.startsWith(`dist${path.sep}`) &&
      !sharedRelative.startsWith(`node_modules${path.sep}`)
    );
  });
}

/**
 * Serialize async rebuilds while coalescing every change that arrives during
 * the debounce delay or an active build into one follow-up build.
 *
 * @param {() => Promise<void>} rebuild The build and publication operation.
 * @param {{ debounceMs?: number; setTimer?: typeof setTimeout; clearTimer?: typeof clearTimeout }} [options]
 * @returns {{ request(): void; close(): Promise<void> }} A queue controller.
 */
export function createRebuildQueue(rebuild, options = {}) {
  const debounceMs = options.debounceMs ?? 120;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let running = false;
  let pending = false;
  let stopped = false;
  /** @type {Promise<void>} */
  let completion = Promise.resolve();

  const start = () => {
    if (stopped || running || !pending) return;
    pending = false;
    running = true;
    completion = completion
      .then(rebuild)
      .catch((error) => {
        process.stderr.write(
          `ui remote build failed: ${error instanceof Error ? error.message : String(error)}\n`
        );
      })
      .finally(() => {
        running = false;
        if (pending) schedule();
      });
  };
  const schedule = () => {
    if (stopped) return;
    if (timer !== undefined) clearTimer(timer);
    timer = setTimer(() => {
      timer = undefined;
      start();
    }, debounceMs);
  };

  return {
    request() {
      if (stopped) return;
      pending = true;
      if (!running) schedule();
    },
    async close() {
      stopped = true;
      if (timer !== undefined) clearTimer(timer);
      await completion;
    },
  };
}

/**
 * Publish a completed remote build as a new immutable release.
 *
 * The shell reads the pointer file before serving a request. Updating that
 * pointer only after copying the whole build means it can serve an older
 * release during a build, but never a half-written output directory.
 *
 * @param {{ appRoot: string; releaseId: string }} options Source app and unique release id.
 * @returns {Promise<string>} The published release directory.
 */
export async function publishRemoteBundle({ appRoot, releaseId }) {
  if (!/^[a-z0-9-]+$/.test(releaseId)) throw new Error(`invalid release id: ${releaseId}`);
  const remoteDirectory = path.join(appRoot, 'dist', 'remote');
  const releasesDirectory = path.join(appRoot, 'dist', RELEASES_DIRECTORY);
  const releaseDirectory = path.join(releasesDirectory, releaseId);
  const pointer = path.join(appRoot, 'dist', CURRENT_RELEASE_FILE);
  const temporaryPointer = `${pointer}.${releaseId}.tmp`;

  await mkdir(releasesDirectory, { recursive: true });
  await cp(remoteDirectory, releaseDirectory, { recursive: true, errorOnExist: true });
  await writeFile(temporaryPointer, JSON.stringify({ release: releaseId }) + '\n');
  await rename(temporaryPointer, pointer);

  return releaseDirectory;
}

/**
 * Read the release selected by a completed-build pointer.
 *
 * @param {string} appRoot Absolute app package path.
 * @returns {Promise<string | undefined>} A safe release id, if one was published.
 */
export async function readPublishedRelease(appRoot) {
  try {
    const parsed = /** @type {unknown} */ (
      JSON.parse(await readFile(path.join(appRoot, 'dist', CURRENT_RELEASE_FILE), 'utf8'))
    );
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('release' in parsed) ||
      typeof parsed.release !== 'string' ||
      !/^[a-z0-9-]+$/.test(parsed.release)
    ) {
      return undefined;
    }
    return parsed.release;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

/**
 * Remove releases left by an earlier watcher session while retaining the
 * release the current pointer names. A running session never prunes: an older
 * entry can still request a lazy chunk after a newer release is published.
 *
 * @param {string} appRoot Absolute app package path.
 * @returns {Promise<void>} Completion after stale release directories are removed.
 */
export async function cleanPreviousSessionReleases(appRoot) {
  const current = await readPublishedRelease(appRoot);
  const releasesDirectory = path.join(appRoot, 'dist', RELEASES_DIRECTORY);
  try {
    const releases = await readdir(releasesDirectory, { withFileTypes: true });
    await Promise.all(
      releases
        .filter((entry) => entry.isDirectory() && entry.name !== current)
        .map((entry) =>
          rm(path.join(releasesDirectory, entry.name), { recursive: true, force: true })
        )
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return;
    throw error;
  }
}

/**
 * Remove the completed-build pointer when a watcher ends normally.
 *
 * The released files remain until the next watcher starts, but a subsequent
 * ordinary `build:remote` is then served from `dist/remote` as it was before
 * local watcher support existed.
 *
 * @param {string} appRoot Absolute app package path.
 * @returns {Promise<void>} Completion after deleting the release pointer.
 */
export async function clearPublishedReleasePointer(appRoot) {
  await rm(path.join(appRoot, 'dist', CURRENT_RELEASE_FILE), { force: true });
}

/**
 * Run a command in an isolated process group and stop it with its watcher.
 *
 * @param {string} cwd Command working directory.
 * @param {readonly string[]} args `pnpm` arguments.
 * @param {AbortSignal} signal Stop signal for this watcher.
 * @returns {Promise<void>} Completion after the build exits successfully.
 */
function runCommand(cwd, args, signal) {
  return new Promise((resolve, reject) => {
    const detached = process.platform !== 'win32';
    const command = spawn('pnpm', args, {
      cwd,
      detached,
      stdio: 'inherit',
    });
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', stop);
    };
    const resolveOnce = () => {
      finish();
      resolve();
    };
    /** @param {unknown} error */
    const rejectOnce = (error) => {
      if (settled) return;
      finish();
      reject(error);
    };
    const stop = () => {
      if (command.pid === undefined) return;
      try {
        process.kill(detached ? -command.pid : command.pid, 'SIGTERM');
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
      }
    };
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, { once: true });
    command.once('error', rejectOnce);
    command.once('exit', (code) => {
      if (code === 0) resolveOnce();
      else rejectOnce(new Error(`${args.join(' ')} exited with ${code ?? 'no'} status`));
    });
  });
}

/**
 * Rebuild the workspace's compiled dependency graph before a remote bundle.
 *
 * @param {string} repoRoot Absolute repository root.
 * @param {string} appRoot Absolute app package path.
 * @param {AbortSignal} signal Stop signal for this watcher.
 * @returns {Promise<void>} Completion after compiled dependencies and the remote build succeed.
 */
function buildRemote(repoRoot, appRoot, signal) {
  return runCommand(repoRoot, ['exec', 'tsc', '-b', 'tsconfig.build.json'], signal).then(() =>
    runCommand(appRoot, ['run', 'build:remote'], signal)
  );
}

/**
 * Read a package's runtime dependency names.
 *
 * @param {unknown} value Parsed package manifest.
 * @returns {string[]} Declared runtime dependency package names.
 */
function dependencyNamesOf(value) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('dependencies' in value) ||
    typeof value.dependencies !== 'object' ||
    value.dependencies === null
  ) {
    return [];
  }
  return Object.keys(value.dependencies);
}

/**
 * Resolve all local library roots reachable through runtime dependencies.
 *
 * @param {ReadonlyMap<string, { readonly root: string; readonly dependencies: readonly string[] }>} libraries
 * @param {readonly string[]} initialDependencies App dependency package names.
 * @returns {string[]} Reachable library roots.
 */
export function localLibraryDependencyClosure(libraries, initialDependencies) {
  /** @type {string[]} */
  const pending = [...initialDependencies];
  /** @type {Set<string>} */
  const visited = new Set();
  /** @type {string[]} */
  const roots = [];
  while (pending.length > 0) {
    const name = pending.pop();
    if (name === undefined || visited.has(name)) continue;
    visited.add(name);
    const library = libraries.get(name);
    if (library === undefined) continue;
    roots.push(library.root);
    pending.push(...library.dependencies);
  }
  return roots.toSorted();
}

/**
 * Find all local library source roots reachable from an app's runtime graph.
 *
 * @param {string} repoRoot Absolute repository root.
 * @param {string} appRoot Absolute app package path.
 * @returns {Promise<string[]>} Transitive `libs/*` source roots the app imports.
 */
async function sharedBuildRoots(repoRoot, appRoot) {
  const appPackage = /** @type {unknown} */ (
    JSON.parse(await readFile(path.join(appRoot, 'package.json'), 'utf8'))
  );
  const dependencyNames = dependencyNamesOf(appPackage);
  const libsRoot = path.join(repoRoot, 'libs');
  const entries = await readdir(libsRoot, { withFileTypes: true });
  const libraries = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const root = path.join(libsRoot, entry.name);
        try {
          const packageJson = /** @type {unknown} */ (
            JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
          );
          return typeof packageJson === 'object' &&
            packageJson !== null &&
            'name' in packageJson &&
            typeof packageJson.name === 'string'
            ? { name: packageJson.name, root, dependencies: dependencyNamesOf(packageJson) }
            : undefined;
        } catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return undefined;
          }
          throw error;
        }
      })
  );
  return localLibraryDependencyClosure(
    new Map(
      libraries
        .filter((library) => library !== undefined)
        .map((library) => [
          library.name,
          { root: library.root, dependencies: library.dependencies },
        ])
    ),
    dependencyNames
  );
}

/**
 * Watch and publish one pillar app's remote bundle.
 *
 * @param {string} repoRoot Absolute repository root.
 * @param {string} pillarId Pillar id with a remote app build.
 * @returns {Promise<() => Promise<void>>} A cleanup function for the watcher and active build.
 */
async function watchPillar(repoRoot, pillarId) {
  const appRoot = path.join(repoRoot, 'pillars', pillarId, 'app');
  await cleanPreviousSessionReleases(appRoot);
  const sharedRoots = await sharedBuildRoots(repoRoot, appRoot);
  const controller = new AbortController();
  const releasePrefix = `${Date.now().toString(36)}-`;
  let buildNumber = 0;
  const queue = createRebuildQueue(async () => {
    await buildRemote(repoRoot, appRoot, controller.signal);
    buildNumber += 1;
    const release = `${releasePrefix}${buildNumber}`;
    await publishRemoteBundle({ appRoot, releaseId: release });
    process.stdout.write(`ui remote published: ${pillarId} (${release})\n`);
  });
  const watcher = watch(appRoot, { recursive: true }, (_event, filename) => {
    if (filename === null) return;
    const changedPath = path.join(appRoot, filename.toString());
    if (isRemoteBuildInput(appRoot, changedPath, sharedRoots)) queue.request();
  });
  const sharedWatchers = sharedRoots.map((sharedRoot) =>
    watch(sharedRoot, { recursive: true }, (_event, filename) => {
      if (filename === null) return;
      const changedPath = path.join(sharedRoot, filename.toString());
      if (isRemoteBuildInput(appRoot, changedPath, sharedRoots)) queue.request();
    })
  );
  queue.request();
  return async () => {
    watcher.close();
    for (const sharedWatcher of sharedWatchers) sharedWatcher.close();
    controller.abort();
    await queue.close();
    await clearPublishedReleasePointer(appRoot);
  };
}

async function main() {
  const repoRoot = path.resolve(import.meta.dirname, '../..');
  const requested = pillarIdsFromArgs(process.argv.slice(2));
  const available = await discoverRemotePillars(repoRoot);
  const unavailable = requested.filter((pillarId) => !available.includes(pillarId));
  if (unavailable.length > 0) {
    throw new Error(`pillars without a remote app build: ${unavailable.join(', ')}`);
  }
  /** @type {Array<() => Promise<void>>} */
  const closeWatchers = [];
  try {
    for (const pillarId of requested) closeWatchers.push(await watchPillar(repoRoot, pillarId));
  } catch (error) {
    await Promise.all(closeWatchers.map((closeWatcher) => closeWatcher()));
    throw error;
  }
  const close = async () => {
    await Promise.all(closeWatchers.map((closeWatcher) => closeWatcher()));
  };
  process.once('SIGINT', () => void close().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void close().finally(() => process.exit(0)));
}

if (import.meta.main) {
  await main();
}
