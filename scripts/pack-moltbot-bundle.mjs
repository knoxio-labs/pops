#!/usr/bin/env node
/**
 * Pack `pillars/moltbot` into a versioned tarball.
 *
 * The moltbot compose profile is the one profile in the fleet that is not
 * served by pulling an image: the bot itself is the upstream
 * `moltbot/moltbot:latest` container, and everything POPS-specific about it —
 * the config, the skill prompts, the pre-flight validator — reaches the
 * container through host bind mounts. A deployer who had only the published
 * images could start every other service and not that one.
 *
 * This produces the missing artifact. `release.yml` runs it and attaches the
 * result to the GitHub Release, so `moltbot-bundle-vX.Y.Z.tar.gz` is versioned
 * and fetchable the same way an image tag is, and the compose files resolve
 * their moltbot mounts through `POPS_MOLTBOT_DIR` so an extracted bundle can
 * stand in for the source tree.
 *
 * The whole directory is packed rather than a curated file list. A list is the
 * failure mode this closes — the bundle would drift the first time a mount was
 * added and nobody remembered to add it here. What keeps that honest is not
 * this script but its test, which reads the moltbot mounts back out of both
 * compose files and requires each one to be inside the bundle.
 *
 * Dependency-free on purpose: `release.yml` runs with no `pnpm install`, so a
 * single bare-specifier import here would fail the release at the last step.
 *
 * Usage:
 *   node scripts/pack-moltbot-bundle.mjs --version v1.2.0 [--out dist]
 */

import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The directory the bundle carries, and the top-level entry inside the tarball. */
export const MOLTBOT_DIR = join('pillars', 'moltbot');

/** Path the tarball unpacks to, relative to wherever it is extracted. */
export const BUNDLE_ROOT = 'moltbot';

/**
 * The compose source prefix a moltbot mount resolves to once
 * `POPS_MOLTBOT_DIR` takes its default. Compose paths are relative to the
 * compose file's own directory (`infra/`), hence the `../`.
 */
const COMPOSE_MOLTBOT_PREFIX = '../pillars/moltbot/';

/** A version string safe to embed in a filename. */
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

/**
 * @param {string} version e.g. `v1.2.0`.
 * @returns {string} e.g. `moltbot-bundle-v1.2.0.tar.gz`.
 * @throws {Error} When the version could escape the output directory or
 *   confuse a shell — the value arrives from a workflow output, so validate it
 *   rather than interpolate it blind.
 */
export function bundleFileName(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`invalid version '${version}': expected e.g. v1.2.0`);
  }
  return `moltbot-bundle-${version}.tar.gz`;
}

/**
 * Substitute Compose's `${NAME:-default}` / `${NAME-default}` forms with their
 * defaults, and any other `${...}` with the empty string.
 *
 * A volume entry is otherwise split on `:`, and `${POPS_MOLTBOT_DIR:-../pillars/moltbot}`
 * carries one. Compose interpolates before it splits; so does this.
 *
 * @param {string} entry A short-form `volumes:` entry.
 * @returns {string}
 */
export function interpolateDefaults(entry) {
  return entry.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?-([^}]*))?\}/gu, (_, __, fallback) =>
    fallback === undefined ? '' : fallback
  );
}

/**
 * The bundle-relative paths a set of compose volume entries mounts out of
 * `pillars/moltbot`.
 *
 * @param {readonly unknown[]} volumeEntries `volumes:` entries as they appear
 *   in a compose service — short-form strings; long-form objects are ignored,
 *   as no moltbot mount uses that form.
 * @returns {string[]} Sorted, deduplicated, e.g. `['config/config.yml',
 *   'scripts/validate-config.sh', 'skills']`.
 */
export function moltbotMountPaths(volumeEntries) {
  /** @type {Set<string>} */
  const paths = new Set();
  for (const entry of volumeEntries) {
    if (typeof entry !== 'string') continue;
    const segments = interpolateDefaults(entry).split(':');
    // Split from the right, exactly as compose reads it: drop the trailing
    // mode when there is one, then the container target.
    if (segments.length > 1 && !(segments.at(-1) ?? '').startsWith('/')) segments.pop();
    segments.pop();
    const source = segments.join(':');
    if (!source.startsWith(COMPOSE_MOLTBOT_PREFIX)) continue;
    paths.add(source.slice(COMPOSE_MOLTBOT_PREFIX.length));
  }
  return [...paths].toSorted();
}

/**
 * Which of `volumeEntries`' moltbot mounts the bundle does not carry.
 *
 * A mount can name a directory (`skills`) or a file inside one
 * (`config/config.yml`), so a mount counts as covered when the bundle holds
 * that path or anything under it.
 *
 * @param {readonly unknown[]} volumeEntries
 * @param {readonly string[]} bundlePaths Bundle-relative paths, POSIX-separated.
 * @returns {string[]} The uncovered mounts, sorted.
 */
export function missingFromBundle(volumeEntries, bundlePaths) {
  const present = new Set(bundlePaths);
  return moltbotMountPaths(volumeEntries).filter(
    (mount) => !present.has(mount) && !bundlePaths.some((p) => p.startsWith(`${mount}/`))
  );
}

/**
 * Every file under `dir`, as POSIX-separated paths relative to it.
 *
 * @param {string} dir
 * @returns {string[]} Sorted.
 */
export function listFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join(posix.sep))
    .toSorted();
}

/**
 * Copy the moltbot directory into `stagingDir` under {@link BUNDLE_ROOT} and
 * stamp it with the version.
 *
 * The stamp is what tells an operator staring at an extracted directory on the
 * host which release it came from — nothing else in there carries a version.
 *
 * @param {{ sourceDir: string, stagingDir: string, version: string }} options
 * @returns {string} The staged bundle root.
 */
export function stageBundle({ sourceDir, stagingDir, version }) {
  if (!existsSync(sourceDir)) throw new Error(`moltbot source directory not found: ${sourceDir}`);
  const root = join(stagingDir, BUNDLE_ROOT);
  cpSync(sourceDir, root, { recursive: true });
  writeFileSync(join(root, 'VERSION'), `${version}\n`);
  return root;
}

/**
 * Build the tarball.
 *
 * @param {{ version: string, outDir?: string, sourceDir?: string }} options
 * @returns {string} Absolute path to the tarball.
 */
export function packBundle({ version, outDir = 'dist', sourceDir = join(repoRoot, MOLTBOT_DIR) }) {
  const fileName = bundleFileName(version);
  const target = resolve(outDir, fileName);
  mkdirSync(dirname(target), { recursive: true });
  const stagingDir = mkdtempSync(join(tmpdir(), 'moltbot-bundle-'));
  try {
    stageBundle({ sourceDir, stagingDir, version });
    execFileSync('tar', ['-czf', target, '-C', stagingDir, BUNDLE_ROOT], {
      // macOS tar otherwise packs `._`-prefixed AppleDouble entries alongside
      // every file, which a Linux deployer then finds in their config dir.
      env: { ...process.env, COPYFILE_DISABLE: '1' },
    });
  } finally {
    rmSync(stagingDir, { recursive: true, force: true });
  }
  return target;
}

/**
 * @param {readonly string[]} argv
 * @returns {{ version: string, outDir: string }}
 */
export function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument '${arg}'`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
    flags[arg.slice(2)] = value;
    i += 1;
  }
  const version = flags.version;
  if (version === undefined) throw new Error('--version is required (e.g. --version v1.2.0)');
  return { version, outDir: flags.out ?? 'dist' };
}

function main() {
  try {
    const { version, outDir } = parseArgs(process.argv.slice(2));
    console.log(packBundle({ version, outDir }));
  } catch (error) {
    console.error(`pack-moltbot-bundle: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main();
}
