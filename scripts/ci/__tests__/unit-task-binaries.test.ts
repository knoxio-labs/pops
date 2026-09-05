/**
 * Every command a unit's mise task runs must resolve on the PATH mise builds
 * for that unit.
 *
 * mise runs a task's command with `sh`, and the only `node_modules/.bin` it
 * contributes is the one named by an `_.path` entry. `_.path` interpolates
 * `config_root` per config FILE, so the root `mise.toml` only ever adds the
 * workspace-hoisted `node_modules/.bin`. A unit whose task calls a binary that
 * pnpm linked into its OWN `node_modules/.bin` — `vite`, `playwright` — and
 * that does not add that directory itself gets `sh: <bin>: command not found`.
 *
 * That is not a cosmetic failure. `run-all` aborts at the first failing unit,
 * so `mise run openapi:generate` (which is `run-all build`) died at
 * `pillars/shell` and never regenerated any unit discovered after it. The only
 * signal was a red `Codegen drift` check on CI, after a push (POPS-2715, hit
 * on #4313). `mise run build` does not run the generators at all, so nothing
 * local said otherwise.
 *
 * This drives the real repo rather than a fixture: the invariant is about what
 * is actually installed next to what is actually configured, and a fixture
 * would assert only that the checker works.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseToml } from '../config-parse.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * The commands mise would run for a task, whatever shape `run` takes: a
 * string, or an array of strings.
 */
function runCommands(task: unknown): string[] {
  if (typeof task === 'string') return [task];
  if (Array.isArray(task)) return task.filter((entry) => typeof entry === 'string');
  if (task !== null && typeof task === 'object' && 'run' in task) {
    return runCommands((task as { run: unknown }).run);
  }
  return [];
}

/**
 * The leading binary of each `&&`/`;`-separated command in `command`.
 *
 * Deliberately shallow: it reads the first word of each segment and nothing
 * else. A command whose first word is a shell construct (`if`, `for`, a
 * variable assignment, a subshell) is returned as-is and filtered out below
 * rather than parsed — this is a check on bare binary names, not a shell.
 */
function leadingBinaries(command: string): string[] {
  return command
    .split(/&&|\|\||;|\n/u)
    .map((segment) => segment.trim().split(/\s+/u)[0] ?? '')
    .filter(Boolean);
}

/** Shell builtins and system tools that are never pnpm-linked. */
const NOT_A_PACKAGE_BINARY = new Set([
  'bash',
  'cargo',
  'cd',
  'cp',
  'echo',
  'find',
  'for',
  'if',
  'mise',
  'mkdir',
  'mv',
  'node',
  'pnpm',
  'rm',
  'set',
  'sh',
  'test',
  'while',
]);

type UnitTask = { unit: string; task: string; binary: string };

function discoverUnitMiseFiles(): string[] {
  const globs: string[] = [];
  for (const parent of ['pillars', 'libs']) {
    const parentDir = join(repoRoot, parent);
    if (!existsSync(parentDir)) continue;
    for (const entry of readdirSorted(parentDir)) {
      const unit = join(parent, entry);
      if (existsSync(join(repoRoot, unit, 'mise.toml'))) globs.push(unit);
      const app = join(unit, 'app');
      if (existsSync(join(repoRoot, app, 'mise.toml'))) globs.push(app);
    }
  }
  return globs;
}

function readdirSorted(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted((a, b) => a.localeCompare(b));
}

function collectUnitTaskBinaries(): UnitTask[] {
  const found: UnitTask[] = [];
  for (const unit of discoverUnitMiseFiles()) {
    const file = join(repoRoot, unit, 'mise.toml');
    const parsed = parseToml(readFileSync(file, 'utf8'), file) as Record<string, unknown>;
    const tasks = (parsed.tasks ?? {}) as Record<string, unknown>;
    for (const [task, definition] of Object.entries(tasks)) {
      for (const command of runCommands(definition)) {
        for (const binary of leadingBinaries(command)) {
          if (NOT_A_PACKAGE_BINARY.has(binary) || binary.includes('=') || binary.startsWith('.')) {
            continue;
          }
          found.push({ unit, task, binary });
        }
      }
    }
  }
  return found;
}

/**
 * Where mise would find `binary` when running a task in `unit`: the
 * workspace-hoisted bin dir always, and the unit's own only when that unit's
 * mise.toml puts it on PATH itself.
 */
function resolvable({ unit, binary }: UnitTask): boolean {
  if (existsSync(join(repoRoot, 'node_modules', '.bin', binary))) return true;
  const miseSource = readFileSync(join(repoRoot, unit, 'mise.toml'), 'utf8');
  const addsOwnBin = miseSource.includes('_.path') && miseSource.includes('node_modules/.bin');
  return addsOwnBin && existsSync(join(repoRoot, unit, 'node_modules', '.bin', binary));
}

describe('unit mise tasks call binaries that resolve', () => {
  const unitTasks = collectUnitTaskBinaries();

  it('discovers the units run-all fans out to', () => {
    // A floor: an empty walk would make every assertion below vacuous, which
    // is the failing-quiet direction ADR-045 exists to close.
    expect(unitTasks.length).toBeGreaterThan(20);
    expect(unitTasks.map((t) => t.unit)).toContain('pillars/shell');
  });

  it('leaves no task calling a binary mise cannot resolve', () => {
    const unresolvable = unitTasks
      .filter((entry) => !resolvable(entry))
      .map(({ unit, task, binary }) => `${unit} [${task}] -> ${binary}`)
      .toSorted((a, b) => a.localeCompare(b));

    // Printed rather than counted so the failure names the unit, the task and
    // the binary — the three things needed to fix it.
    expect(unresolvable).toEqual([]);
  });

  it('sees pillars/shell resolve vite, the case that broke openapi:generate', () => {
    const vite = unitTasks.find((t) => t.unit === 'pillars/shell' && t.binary === 'vite');
    expect(vite).toBeDefined();
    expect(resolvable(vite as UnitTask)).toBe(true);
  });
});
