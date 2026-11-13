import { spawnSync } from 'node:child_process';
import { join, relative, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

/** Finite CLI-only budget: these commands neither install dependencies nor compile the application. */
export const BFM_MIGRATION_KIT_TIMEOUT_MS = 30_000;

/** Completion from the pinned public CLI; status alone is insufficient for its caught error branches. */
export interface BfmKitCompletion {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Runs the owning installed CLI with relative output paths, preserving every diagnostic for validation. */
export function runBfmMigrationKit(repoRoot: string, args: string[]): BfmKitCompletion {
  const cwd = join(repoRoot, 'pillars/bfm');
  const normalArgs = args.map((arg) =>
    arg.startsWith('--out=')
      ? `--out=${relative(cwd, resolve(cwd, arg.slice('--out='.length)))}`
      : arg
  );
  const result = spawnSync(join(cwd, 'node_modules/.bin/drizzle-kit'), normalArgs, {
    cwd,
    encoding: 'utf8',
    timeout: BFM_MIGRATION_KIT_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error !== undefined) throw result.error;
  if (result.status === null) throw new Error('Drizzle Kit did not exit normally.');
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status };
}
/** Reject caught CLI errors, diagnostics and unsuccessful process exits. */
export function requireKitSuccess(result: BfmKitCompletion): void {
  if (result.exitCode !== 0 || result.stderr.trim() !== '') {
    throw new Error('Drizzle Kit reported failure.', { cause: result });
  }
}
/** Require the pinned zero-SQL completion branch as well as successful process completion. */
export function requireZeroDiff(result: BfmKitCompletion): void {
  requireKitSuccess(result);
  const lines = stripVTControlCharacters(result.stdout).trim().split(/\r?\n/u);
  if (lines.at(-1) !== 'No schema changes, nothing to migrate 😴') {
    throw new Error('Drizzle Kit did not confirm successful zero-diff generation.', {
      cause: result,
    });
  }
}
