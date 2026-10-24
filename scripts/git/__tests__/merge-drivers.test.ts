import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { installMergeDrivers, MERGE_DRIVER_CONFIG } from '../install-merge-drivers.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WRAPPER = 'scripts/git/mergiraf-merge.sh';

const BASE = `import { alpha, beta } from './letters';

export const registry = {
  alpha,
  beta,
};
`;

const OURS = `import { alpha, beta, gamma } from './letters';

export const registry = {
  alpha,
  beta,
  gamma,
};
`;

const THEIRS = `import { alpha, beta, delta } from './letters';

export const registry = {
  alpha,
  beta,
  delta,
};
`;

const MERGED = `import { alpha, beta, gamma, delta } from './letters';

export const registry = {
  alpha,
  beta,
  gamma,
  delta,
};
`;

const scratch: string[] = [];

function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratch.push(dir);
  return dir;
}

function locateMergiraf(): string {
  const viaMise = spawnSync('mise', ['which', 'mergiraf'], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (viaMise.status === 0 && viaMise.stdout.trim() !== '') return viaMise.stdout.trim();
  const viaPath = spawnSync('sh', ['-c', 'command -v mergiraf'], { encoding: 'utf8' });
  if (viaPath.status === 0 && viaPath.stdout.trim() !== '') return viaPath.stdout.trim();
  throw new Error(
    'mergiraf is not installed. It is pinned in the root mise.toml; run `mise install`.'
  );
}

function gitBinary(): string {
  return execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
}

/**
 * The PATH a GUI-launched git typically has: system directories plus git,
 * with neither mergiraf nor mise resolvable.
 */
function pathWithoutMergiraf(): string {
  const bin = makeDir('pops-merge-bin-');
  symlinkSync(gitBinary(), join(bin, 'git'));
  const path = `${bin}:/usr/bin:/bin`;
  for (const tool of ['mergiraf', 'mise']) {
    const probe = spawnSync('sh', ['-c', `command -v ${tool}`], { env: { PATH: path } });
    if (probe.status === 0) throw new Error(`${tool} is resolvable from ${path}`);
  }
  return path;
}

function hermeticEnv(path: string): NodeJS.ProcessEnv {
  return {
    PATH: path,
    HOME: makeDir('pops-merge-home-'),
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.invalid',
  };
}

interface Scenario {
  repo: string;
  git: (args: string[]) => ReturnType<typeof spawnSync>;
}

/**
 * Two branches that each append a different entry to the same import list
 * and object literal: adjacent edits a line merge cannot reconcile.
 */
function divergingBranches(env: NodeJS.ProcessEnv, { withWrapper = true } = {}): Scenario {
  const repo = makeDir('pops-merge-repo-');
  const git = (args: string[]) => spawnSync('git', args, { cwd: repo, env, encoding: 'utf8' });
  const must = (args: string[]) => {
    const result = git(args);
    if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(result.stderr)}`);
  };

  must(['init', '-q', '-b', 'main']);
  must(['config', 'commit.gpgsign', 'false']);
  must(['config', 'rerere.enabled', 'false']);
  copyFileSync(join(REPO_ROOT, '.gitattributes'), join(repo, '.gitattributes'));
  if (withWrapper) {
    mkdirSync(join(repo, 'scripts', 'git'), { recursive: true });
    copyFileSync(join(REPO_ROOT, WRAPPER), join(repo, WRAPPER));
  }
  writeFileSync(join(repo, 'registry.ts'), BASE);
  must(['add', '-A']);
  must(['commit', '-qm', 'base']);

  must(['checkout', '-qb', 'theirs']);
  writeFileSync(join(repo, 'registry.ts'), THEIRS);
  must(['commit', '-qam', 'add delta']);

  must(['checkout', '-q', 'main']);
  writeFileSync(join(repo, 'registry.ts'), OURS);
  must(['commit', '-qam', 'add gamma']);
  return { repo, git };
}

function expectLineConflict({ repo, git }: Scenario, merge: ReturnType<typeof spawnSync>) {
  expect(merge.status).not.toBe(0);
  const content = readFileSync(join(repo, 'registry.ts'), 'utf8');
  expect(content).toMatch(/^<{7} /mu);
  expect(content).toMatch(/^>{7} /mu);
  expect(content).toContain('gamma');
  expect(content).toContain('delta');
  expect(String(git(['diff', '--name-only', '--diff-filter=U']).stdout).trim()).toBe('registry.ts');
}

let mergirafBin = '';

beforeAll(() => {
  mergirafBin = locateMergiraf();
});

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Each case builds a repository and runs a real merge through git. */
const GIT_SCENARIO_TIMEOUT_MS = 30_000;

describe('.gitattributes merge=mergiraf', { timeout: GIT_SCENARIO_TIMEOUT_MS }, () => {
  it('conflicts under plain git when the clone has no driver config', () => {
    const scenario = divergingBranches(hermeticEnv(`${dirname(mergirafBin)}:${process.env.PATH}`));

    expectLineConflict(scenario, scenario.git(['merge', '-q', 'theirs']));
  });

  it('merges both additions cleanly once the driver config is installed', () => {
    const scenario = divergingBranches(hermeticEnv(`${dirname(mergirafBin)}:${process.env.PATH}`));
    installMergeDrivers({ cwd: scenario.repo });

    const merge = scenario.git(['merge', '-q', 'theirs']);

    expect(merge.status, String(merge.stderr)).toBe(0);
    expect(readFileSync(join(scenario.repo, 'registry.ts'), 'utf8')).toBe(MERGED);
    expect(String(scenario.git(['status', '--porcelain']).stdout)).toBe('');
  });

  it('falls back to a marked line conflict when mergiraf cannot be found', () => {
    const scenario = divergingBranches(hermeticEnv(pathWithoutMergiraf()));
    installMergeDrivers({ cwd: scenario.repo });

    expectLineConflict(scenario, scenario.git(['merge', '-q', 'theirs']));
  });

  it('restores our side and falls back to a line merge when mergiraf crashes', () => {
    const path = pathWithoutMergiraf();
    const crashing = join(path.split(':')[0] ?? '', 'mergiraf');
    writeFileSync(crashing, '#!/bin/sh\necho partial > "$4"\nexit 101\n', { mode: 0o755 });
    const scenario = divergingBranches(hermeticEnv(path));
    installMergeDrivers({ cwd: scenario.repo });

    const merge = scenario.git(['merge', '-q', 'theirs']);

    expectLineConflict(scenario, merge);
    expect(readFileSync(join(scenario.repo, 'registry.ts'), 'utf8')).not.toContain('partial');
    expect(String(merge.stderr)).toContain('mergiraf exited 101');
  });

  it('falls back to a marked line conflict when the checkout has no wrapper script', () => {
    const scenario = divergingBranches(hermeticEnv(`${dirname(mergirafBin)}:${process.env.PATH}`), {
      withWrapper: false,
    });
    installMergeDrivers({ cwd: scenario.repo });

    expectLineConflict(scenario, scenario.git(['merge', '-q', 'theirs']));
  });
});

describe('the root prepare script', { timeout: GIT_SCENARIO_TIMEOUT_MS }, () => {
  const manifest: unknown = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  const prepare =
    typeof manifest === 'object' &&
    manifest !== null &&
    'scripts' in manifest &&
    typeof manifest.scripts === 'object' &&
    manifest.scripts !== null &&
    'prepare' in manifest.scripts &&
    typeof manifest.scripts.prepare === 'string'
      ? manifest.scripts.prepare
      : '';

  /** A PATH whose `husky` succeeds without touching any repository. */
  function pathWithStubHusky(): string {
    const bin = makeDir('pops-merge-husky-');
    writeFileSync(join(bin, 'husky'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    return `${bin}:${dirname(process.execPath)}:${process.env.PATH ?? ''}`;
  }

  it('is declared', () => {
    expect(prepare).toContain('install-merge-drivers.mjs');
  });

  it('succeeds in an image build context, which has no scripts directory', () => {
    const context = makeDir('pops-merge-context-');

    const result = spawnSync('sh', ['-c', prepare], {
      cwd: context,
      env: hermeticEnv(pathWithStubHusky()),
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
  });

  it('installs the driver config in a clone', () => {
    const env = hermeticEnv(pathWithStubHusky());
    const { repo, git } = divergingBranches(env);
    copyFileSync(
      join(REPO_ROOT, 'scripts/git/install-merge-drivers.mjs'),
      join(repo, 'scripts/git/install-merge-drivers.mjs')
    );

    const result = spawnSync('sh', ['-c', prepare], { cwd: repo, env, encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(0);
    expect(String(git(['config', '--local', '--get', 'merge.mergiraf.driver']).stdout).trim()).toBe(
      MERGE_DRIVER_CONFIG['merge.mergiraf.driver']
    );
  });
});

describe('installMergeDrivers', { timeout: GIT_SCENARIO_TIMEOUT_MS }, () => {
  it('writes every key once and nothing on a second run', () => {
    const env = hermeticEnv(process.env.PATH ?? '');
    const { repo } = divergingBranches(env);

    const first = installMergeDrivers({ cwd: repo });
    const second = installMergeDrivers({ cwd: repo });

    expect(first).toEqual({ status: 'configured', written: Object.keys(MERGE_DRIVER_CONFIG) });
    expect(second).toEqual({ status: 'configured', written: [] });
    for (const [key, value] of Object.entries(MERGE_DRIVER_CONFIG)) {
      const stored = spawnSync('git', ['config', '--local', '--get', key], {
        cwd: repo,
        encoding: 'utf8',
      });
      expect(stored.stdout.replace(/\n$/u, '')).toBe(value);
    }
  });

  it('rewrites a key whose value has drifted', () => {
    const { repo } = divergingBranches(hermeticEnv(process.env.PATH ?? ''));
    installMergeDrivers({ cwd: repo });
    execFileSync('git', ['config', '--local', 'merge.mergiraf.driver', 'false'], { cwd: repo });

    expect(installMergeDrivers({ cwd: repo })).toEqual({
      status: 'configured',
      written: ['merge.mergiraf.driver'],
    });
  });

  it('reports a directory outside any work tree instead of failing', () => {
    expect(installMergeDrivers({ cwd: makeDir('pops-merge-plain-') })).toEqual({
      status: 'not-a-work-tree',
    });
  });
});
