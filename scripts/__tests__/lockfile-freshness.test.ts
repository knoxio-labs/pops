/**
 * The pre-push lockfile-freshness gate.
 *
 * A stale `pnpm-lock.yaml` is invisible to every other local gate — typecheck,
 * test, lint and format all read `node_modules`, which still holds the last
 * install's resolution — and reds every CI job that installs from scratch. The
 * hook closes that with `pnpm install --frozen-lockfile --lockfile-only`.
 *
 * The claim worth testing is not that the hook contains a string, but that
 * those flags actually reject a manifest edit with no lockfile update — in
 * both directions, since a dependency REMOVED from a package.json is the case
 * that produced the 75-red-check push on POPS-3221 and is the one a "did you
 * forget to install" reading of the flag would miss. That behaviour lives in
 * pnpm, so it is pinned here against a throwaway workspace rather than
 * asserted about our own source. A last test ties the hook to the flags this
 * suite proved, so the two cannot drift apart.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CHECK_ARGS = ['install', '--frozen-lockfile', '--lockfile-only'];

let workspace: string;

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function packageManifest(dependencies: Record<string, string>): unknown {
  return { name: '@fixture/app', version: '0.0.0', private: true, dependencies };
}

function setAppDependencies(dependencies: Record<string, string>): void {
  writeJson(join(workspace, 'packages/app/package.json'), packageManifest(dependencies));
}

/** Exit code of the freshness check against the fixture workspace. */
function runCheck(): number {
  try {
    execFileSync('pnpm', CHECK_ARGS, { cwd: workspace, stdio: 'pipe' });
    return 0;
  } catch (error) {
    const code = (error as { status?: number }).status;
    return typeof code === 'number' ? code : 1;
  }
}

beforeAll(() => {
  workspace = mkdtempSync(join(tmpdir(), 'pops-lockfile-'));
  mkdirSync(join(workspace, 'packages/app'), { recursive: true });
  mkdirSync(join(workspace, 'packages/lib'), { recursive: true });

  // Workspace-only dependencies, so minting the lockfile needs no registry.
  writeFileSync(join(workspace, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
  writeJson(join(workspace, 'package.json'), {
    name: '@fixture/root',
    version: '0.0.0',
    private: true,
  });
  writeJson(join(workspace, 'packages/lib/package.json'), {
    name: '@fixture/lib',
    version: '0.0.0',
    private: true,
  });
  setAppDependencies({ '@fixture/lib': 'workspace:*' });

  execFileSync('pnpm', ['install', '--lockfile-only'], { cwd: workspace, stdio: 'pipe' });
}, 120_000);

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('pnpm install --frozen-lockfile --lockfile-only', () => {
  it('passes when the lockfile matches the manifests', () => {
    setAppDependencies({ '@fixture/lib': 'workspace:*' });
    expect(runCheck()).toBe(0);
  });

  it('fails on a dependency added to a manifest and never installed', () => {
    setAppDependencies({ '@fixture/lib': 'workspace:*', '@fixture/root': 'workspace:*' });
    expect(runCheck()).not.toBe(0);
  });

  // The POPS-3221 shape: `@pops/app-bfm` left `pillars/shell/package.json` and
  // the lockfile was never regenerated.
  it('fails on a dependency removed from a manifest while the lockfile carries it', () => {
    setAppDependencies({});
    expect(runCheck()).not.toBe(0);
  });

  // Nothing in this suite would notice the check being installed under
  // different flags, or dropped from the hook entirely.
  it('is the command the pre-push hook runs', () => {
    const hook = readFileSync(join(REPO_ROOT, '.husky/pre-push'), 'utf8');
    expect(hook).toContain(`pnpm ${CHECK_ARGS.join(' ')}`);
  });
});
