import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { stringify as stringifyYaml } from 'yaml';

import { isMapping, parseYaml } from '../ci/config-parse.mjs';
import {
  captureRootPatchFiles,
  rootPatchedDependencies,
  stageRootPatchFiles,
} from './dependency-patches.mjs';
import {
  exactPatchSelector,
  parsePnpmDependencyGraph,
  projectResolvedPatches,
} from './patch-projection.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const listArguments = ['list', '--lockfile-only', '--json', '--depth', 'Infinity'];

/**
 * Run normal pnpm with inherited lifecycle behavior. Only list JSON is captured;
 * install output remains attached to the ordinary build log without a buffer limit.
 * @param {string[]} args Public pnpm arguments.
 * @param {string} cwd Private unit workspace root.
 * @returns {Promise<string>}
 */
export function runSandboxPnpm(args, cwd) {
  return new Promise((complete, reject) => {
    const capture = args[0] === 'list';
    const child = spawn('pnpm', args, {
      cwd,
      stdio: ['inherit', capture ? 'pipe' : 'inherit', 'inherit'],
    });
    let stdout = '';
    if (child.stdout !== null) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
    }
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code !== 0) reject(new Error(`Sandbox pnpm ${args[0]} failed (${signal ?? code})`));
      else complete(stdout);
    });
  });
}

/** @param {string} path */
function privateWorkspace(path) {
  const bytes = readFileSync(path, 'utf8');
  const workspace = parseYaml(bytes, path);
  if (
    !isMapping(workspace) ||
    !Array.isArray(workspace.packages) ||
    workspace.packages.length !== 0 ||
    Object.hasOwn(workspace, 'patchedDependencies')
  ) {
    throw new Error('Rewrite the isolated workspace without patch policy before resolution');
  }
  return { bytes, workspace };
}

/** @param {string} path @param {string} expected */
function unchangedWorkspace(path, expected) {
  if (readFileSync(path, 'utf8') !== expected)
    throw new Error('Lifecycle changed isolated workspace policy');
}

/** @param {(args: string[]) => Promise<string>} run */
async function resolvedGraph(run) {
  const graph = parsePnpmDependencyGraph(await run([...listArguments]));
  if (graph.length !== 1) throw new Error('Expected one complete isolated dependency graph');
  return graph;
}

/**
 * @param {(args: string[]) => Promise<string>} run
 * @param {{ path: string, bytes: string }} policy
 * @param {ReturnType<typeof parsePnpmDependencyGraph>} graph
 * @param {string[]} args
 */
async function installResolvedPhase(run, policy, graph, args) {
  await run(args);
  unchangedWorkspace(policy.path, policy.bytes);
  if (JSON.stringify(await resolvedGraph(run)) !== JSON.stringify(graph)) {
    throw new Error('Install changed the resolved dependency graph');
  }
}

/**
 * Resolve the rewritten private closure normally, then project immutable exact root
 * patches through native pnpm queries before regenerating and freezing its lockfile.
 * Name/range selectors are deliberately unsupported by this internal protocol; they
 * must be implemented explicitly before root policy can use them for EX-2.
 * Normal lifecycle scripts run in every install phase and are never stripped.
 * @param {string} destination Rewritten standalone unit, with packages: [] policy.
 * @param {{ sourceRoot?: string, runPnpm?: (args: string[], cwd: string) => Promise<string> }} [options]
 * @returns {Promise<Record<string, string>>} The exact applicable root patch mapping.
 */
export async function installSandbox(
  destination,
  { sourceRoot = repoRoot, runPnpm = runSandboxPnpm } = {}
) {
  const workspacePath = join(destination, 'pnpm-workspace.yaml');
  const initial = privateWorkspace(workspacePath);
  const patches = rootPatchedDependencies(
    readFileSync(join(sourceRoot, 'pnpm-workspace.yaml'), 'utf8')
  );
  for (const selector of Object.keys(patches ?? {})) exactPatchSelector(selector);
  const files = captureRootPatchFiles(patches, sourceRoot);
  const run = (args) => runPnpm([...args], destination);
  await run(['install', '--lockfile-only', '--no-frozen-lockfile']);
  unchangedWorkspace(workspacePath, initial.bytes);
  const before = await resolvedGraph(run);
  const selected = await projectResolvedPatches(patches, before, (selector) =>
    run([...listArguments, selector])
  );
  stageRootPatchFiles(destination, selected, files);
  const projected = { ...initial.workspace };
  if (Object.keys(selected).length > 0) projected.patchedDependencies = selected;
  const projectedBytes = stringifyYaml(projected);
  writeFileSync(workspacePath, projectedBytes);
  const policy = { path: workspacePath, bytes: projectedBytes };
  await installResolvedPhase(run, policy, before, [
    'install',
    '--lockfile-only',
    '--no-frozen-lockfile',
  ]);
  await installResolvedPhase(run, policy, before, ['install', '--frozen-lockfile']);
  return selected;
}

if (import.meta.main) {
  const [destination, ...extra] = process.argv.slice(2);
  if (destination === undefined || extra.length > 0)
    throw new Error('Usage: install-sandbox.mjs <rewritten-unit-root>');
  const selected = await installSandbox(resolve(destination));
  process.stdout.write(
    `sandbox: retained ${Object.keys(selected).length} applicable dependency patch(es)\n`
  );
}
