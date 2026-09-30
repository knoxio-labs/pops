#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const builtGraphTool = join(repoRoot, 'scripts', 'require-built-graph.mjs');
const builtGraphDependency = join(repoRoot, 'scripts', 'ci', 'cold-graph-deps.mjs');
const skippedDirectories = new Set(['.git', 'build', 'coverage', 'dist', 'node_modules', 'target']);
const sourceExtensions = new Set(['.cjs', '.js', '.mjs', '.mts', '.ts', '.tsx']);
const externalScriptCommand = /\b(?:node|tsx|bash|sh|python3?)\s+((?:\.\.\/)+[^\s;&|]+)/gu;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInsideRepo(path) {
  const absolutePath = resolve(path);
  return absolutePath === repoRoot || absolutePath.startsWith(`${repoRoot}${sep}`);
}

function sourceUsesOxfmt(unitDir) {
  const walk = (directory) => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return false;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skippedDirectories.has(entry.name) || entry.name.startsWith('.')) continue;
        if (walk(join(directory, entry.name))) return true;
      } else if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
        if (readFileSync(join(directory, entry.name), 'utf8').includes('oxfmt')) return true;
      }
    }
    return false;
  };

  return walk(unitDir);
}

function hasDependency(packageManifest, name) {
  for (const field of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const dependencies = packageManifest[field];
    if (isRecord(dependencies) && Object.hasOwn(dependencies, name)) return true;
  }
  return false;
}

/**
 * Return root-owned tools that must be installed into an extracted unit.
 *
 * `@pops/contract-openapi` invokes the formatter from its generated code, and
 * generator scripts can invoke it directly. The root package manifest remains
 * the version source for that formatter.
 *
 * @param {string} unitDir
 * @param {Record<string, unknown>} packageManifest
 * @param {Record<string, unknown>} rootPackageManifest
 * @returns {Record<string, string>}
 */
export function sandboxToolDependencies(unitDir, packageManifest, rootPackageManifest) {
  const usesOxfmt =
    hasDependency(packageManifest, '@pops/contract-openapi') || sourceUsesOxfmt(unitDir);
  if (!usesOxfmt || hasDependency(packageManifest, 'oxfmt')) return {};

  const rootDevDependencies = rootPackageManifest.devDependencies;
  const rootDependencies = rootPackageManifest.dependencies;
  const version =
    (isRecord(rootDevDependencies) && rootDevDependencies.oxfmt) ||
    (isRecord(rootDependencies) && rootDependencies.oxfmt);
  if (typeof version !== 'string') {
    throw new Error(
      `sandbox: ${unitDir} requires tool "oxfmt", but the root package.json does not declare it`
    );
  }
  return { oxfmt: version };
}

/**
 * Validate package scripts that invoke files outside their extracted unit.
 * The build-graph check is the only supported root script because the sandbox
 * copies its implementation into the unit's original relative layout.
 *
 * @param {string} unitDir
 * @param {Record<string, unknown>} packageManifest
 */
export function checkOutOfUnitScriptTools(unitDir, packageManifest) {
  const scripts = packageManifest.scripts;
  if (!isRecord(scripts)) return;

  for (const [scriptName, command] of Object.entries(scripts)) {
    if (typeof command !== 'string') continue;
    for (const match of command.matchAll(externalScriptCommand)) {
      const toolPath = match[1];
      if (typeof toolPath !== 'string') continue;
      const resolvedTool = resolve(unitDir, toolPath);
      if (resolvedTool === builtGraphTool) {
        if (
          !isInsideRepo(unitDir) ||
          !existsSync(builtGraphTool) ||
          !existsSync(builtGraphDependency)
        ) {
          throw new Error(
            `sandbox: script "${scriptName}" requires tool "${basename(toolPath)}", but its sandbox provider is unavailable`
          );
        }
        continue;
      }

      throw new Error(
        `sandbox: script "${scriptName}" reaches outside the unit for tool "${basename(toolPath)}" at "${toolPath}"; no sandbox provider is configured`
      );
    }
  }
}

/**
 * Check a unit's out-of-unit tool references before dependency packing starts.
 *
 * @param {string[]} argv
 */
function main(argv) {
  const unitArg = argv[0];
  if (!unitArg) {
    process.stderr.write('usage: sandbox-tools.mjs <unit-dir>\n');
    return 2;
  }

  const unitDir = resolve(unitArg);
  const manifestPath = join(unitDir, 'package.json');
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!isRecord(parsed)) throw new Error(`sandbox: ${manifestPath} is not a JSON object`);
  checkOutOfUnitScriptTools(unitDir, parsed);
  process.stdout.write(`sandbox: out-of-unit tool references are provided for ${unitDir}\n`);
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
