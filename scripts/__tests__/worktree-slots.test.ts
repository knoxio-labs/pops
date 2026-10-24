import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  classifySlot,
  formatSize,
  parseLease,
  parseWorktreeList,
  planGc,
  selectSlot,
} from '../worktree-slots.mjs';

type Slot = Parameters<typeof selectSlot>[0]['slots'][number];

const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;
const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const worktreeScript = join(repositoryRoot, 'scripts', 'worktree.mjs');

function slot(index: number, state: Slot['state'], branch: string | null = null): Slot {
  return {
    name: `pops-slot-${index}`,
    index,
    path: `/pool/pops-slot-${index}`,
    branch,
    state,
    lease: null,
    dirty: state === 'dirty',
  };
}

describe('parseWorktreeList', () => {
  it('parses branch, detached, locked and prunable entries', () => {
    const entries = parseWorktreeList(
      [
        'worktree /repo',
        'HEAD aaa',
        'branch refs/heads/main',
        '',
        'worktree /pool/pops-slot-1',
        'HEAD bbb',
        'detached',
        '',
        'worktree /gone',
        'HEAD ccc',
        'branch refs/heads/feat/x',
        'locked busy',
        'prunable gitdir file points to non-existent location',
        '',
      ].join('\n')
    );
    expect(entries.map((entry) => [entry.path, entry.branch, entry.detached])).toEqual([
      ['/repo', 'main', false],
      ['/pool/pops-slot-1', null, true],
      ['/gone', 'feat/x', false],
    ]);
    expect(entries[2]?.locked).toBe(true);
    expect(entries[2]?.prunable).toContain('non-existent');
    expect(entries[0]?.prunable).toBeNull();
  });
});

describe('parseLease', () => {
  it('accepts a well-formed lease and rejects malformed ones', () => {
    const good = { branch: 'b', pid: 12, acquiredAt: '2026-01-01T00:00:00.000Z' };
    expect(parseLease(JSON.stringify(good))).toEqual(good);
    expect(parseLease('not json')).toBeNull();
    expect(parseLease(JSON.stringify({ ...good, pid: 'x' }))).toBeNull();
    expect(parseLease(JSON.stringify({ ...good, acquiredAt: 'nope' }))).toBeNull();
    expect(parseLease('null')).toBeNull();
  });
});

describe('classifySlot', () => {
  const lease = { branch: 'b', pid: 1, acquiredAt: '2026-01-01T00:00:00.000Z' };
  const base = { lease, dirty: false, pidAlive: false, leaseAgeMs: 10_000, graceMs: 5_000 };

  it('treats a live holder as busy even when clean', () => {
    expect(classifySlot({ ...base, pidAlive: true })).toBe('busy');
  });
  it('reclaims a dead, clean, expired lease', () => {
    expect(classifySlot(base)).toBe('reclaimable');
  });
  it('keeps a dead lease busy inside the grace window', () => {
    expect(classifySlot({ ...base, leaseAgeMs: 4_999 })).toBe('busy');
    expect(classifySlot({ ...base, leaseAgeMs: 5_000 })).toBe('reclaimable');
  });
  it('never offers a dirty slot, leased or not', () => {
    expect(classifySlot({ ...base, dirty: true })).toBe('dirty');
    expect(classifySlot({ ...base, lease: null, dirty: true })).toBe('dirty');
  });
  it('treats an unleased clean slot as free', () => {
    expect(classifySlot({ ...base, lease: null })).toBe('free');
  });
});

describe('selectSlot', () => {
  it('prefers a slot already on the branch', () => {
    const choice = selectSlot({
      slots: [slot(1, 'free'), slot(2, 'reclaimable', 'feat/a')],
      branch: 'feat/a',
      maxSlots: 6,
    });
    expect(choice).toMatchObject({ action: 'reuse', slot: { index: 2 } });
  });
  it('fails when the branch is held by a busy slot', () => {
    const choice = selectSlot({
      slots: [slot(1, 'busy', 'feat/a')],
      branch: 'feat/a',
      maxSlots: 6,
    });
    expect(choice.action).toBe('fail');
  });
  it('picks the lowest free slot before a reclaimable one', () => {
    const choice = selectSlot({
      slots: [slot(3, 'free'), slot(1, 'reclaimable'), slot(2, 'free')],
      branch: 'x',
      maxSlots: 6,
    });
    expect(choice).toMatchObject({ action: 'reuse', slot: { index: 2 } });
  });
  it('creates the first unused index below the cap, skipping taken ones', () => {
    const choice = selectSlot({
      slots: [slot(1, 'busy'), slot(3, 'dirty')],
      branch: 'x',
      maxSlots: 4,
      takenIndexes: [2],
    });
    expect(choice).toEqual({ action: 'create', index: 4 });
  });
  it('fails at the cap and lists busy and dirty slots', () => {
    const choice = selectSlot({
      slots: [slot(1, 'busy', 'feat/a'), slot(2, 'dirty')],
      branch: 'x',
      maxSlots: 2,
    });
    expect(choice.action).toBe('fail');
    if (choice.action === 'fail') {
      expect(choice.reason).toContain('pops-slot-1: busy (feat/a)');
      expect(choice.reason).toContain('pops-slot-2: dirty');
    }
  });
});

describe('planGc', () => {
  const worktree = (path: string, branch: string | null, prunable: string | null = null) => ({
    path,
    head: null,
    branch,
    detached: branch === null,
    bare: false,
    locked: false,
    prunable,
  });

  it('classifies merged, gone and checked-out branches and protects main', () => {
    const plan = planGc({
      worktrees: [
        worktree('/repo', 'main'),
        worktree('/wt/live', 'live'),
        worktree('/wt/missing', 'orphan', 'gitdir missing'),
      ],
      branches: [
        { name: 'main', upstreamGone: false },
        { name: 'merged-one', upstreamGone: false },
        { name: 'gone-one', upstreamGone: true },
        { name: 'both', upstreamGone: true },
        { name: 'live', upstreamGone: true },
        { name: 'orphan', upstreamGone: true },
        { name: 'wip', upstreamGone: false },
      ],
      mergedBranches: ['main', 'merged-one', 'both', 'live'],
    });
    const byName = Object.fromEntries(plan.branches.map((branch) => [branch.name, branch]));
    expect(byName['main']).toBeUndefined();
    expect(byName['wip']).toBeUndefined();
    expect(byName['merged-one']).toMatchObject({ reason: 'merged', action: 'delete' });
    expect(byName['both']).toMatchObject({ reason: 'merged+gone', action: 'delete' });
    expect(byName['gone-one']).toMatchObject({
      reason: 'gone',
      action: 'delete-with-include-gone',
    });
    expect(byName['live']).toMatchObject({ action: 'skip', skip: 'checked out at /wt/live' });
    expect(byName['orphan']).toMatchObject({ action: 'delete-with-include-gone' });
    expect(plan.prunable.map((entry) => entry.path)).toEqual(['/wt/missing']);
  });

  it('does not list locked worktrees as prunable', () => {
    const plan = planGc({
      worktrees: [{ ...worktree('/wt/l', 'l', 'x'), locked: true }],
      branches: [],
      mergedBranches: [],
    });
    expect(plan.prunable).toEqual([]);
  });
});

describe('formatSize', () => {
  it('scales units', () => {
    expect(formatSize(512)).toBe('512 KiB');
    expect(formatSize(2048)).toBe('2.0 MiB');
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5 GiB');
  });
});

const temporaryDirectories: string[] = [];

function gitEnvironment(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith('GIT_') && !key.startsWith('POPS_WORKTREE')) environment[key] = value;
  }
  return {
    ...environment,
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
    ...extra,
  };
}

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: gitEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

interface Fixture {
  repo: string;
  pool: string;
  cli: (args: string[], extra?: NodeJS.ProcessEnv, input?: string) => ReturnType<typeof spawnSync>;
}

function createFixture(): Fixture {
  const tmp = join(repositoryRoot, 'tmp');
  mkdirSync(tmp, { recursive: true });
  const base = realpathSync(mkdtempSync(join(tmp, 'slots-')));
  temporaryDirectories.push(base);
  const origin = join(base, 'origin.git');
  const repo = join(base, 'repo');
  const pool = join(base, 'pool');
  git(base, 'init', '--bare', '--initial-branch=main', origin);
  git(base, 'clone', origin, repo);
  writeFileSync(join(repo, 'README.md'), '# fixture\n');
  writeFileSync(join(repo, '.gitignore'), 'target/\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'chore: seed');
  git(repo, 'push', 'origin', 'HEAD:main');
  git(repo, 'fetch', 'origin');
  return {
    repo,
    pool,
    cli: (args, extra = {}, input = '') =>
      spawnSync(process.execPath, [worktreeScript, ...args], {
        cwd: repo,
        encoding: 'utf8',
        input,
        env: gitEnvironment({ POPS_WORKTREE_ROOT: pool, ...extra }),
      }),
  };
}

function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', '']);
  return child.pid;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop() as string, { recursive: true, force: true });
  }
});

describe('slot commands', { timeout: REAL_SUBPROCESS_TIMEOUT_MS }, () => {
  const live = { POPS_WORKTREE_HOLDER_PID: String(process.pid) };

  it('acquires a new slot from origin/main, keeps ignored state across release and reuse', () => {
    const f = createFixture();
    const first = f.cli(['acquire', 'feat/one'], live);
    expect(first.status).toBe(0);
    const path = String(first.stdout).trim();
    expect(path).toBe(join(realpathSync(f.pool), 'pops-slot-1'));
    expect(git(path, 'branch', '--show-current')).toBe('feat/one');
    expect(git(path, 'rev-parse', 'HEAD')).toBe(git(f.repo, 'rev-parse', 'origin/main'));

    mkdirSync(join(path, 'target'));
    writeFileSync(join(path, 'target', 'artifact'), 'warm');

    const released = f.cli(['release', 'feat/one']);
    expect(released.status).toBe(0);
    expect(git(path, 'branch', '--show-current')).toBe('');
    git(f.repo, 'branch', '-d', 'feat/one');

    const second = f.cli(['acquire', 'feat/two'], live);
    expect(String(second.stdout).trim()).toBe(path);
    expect(existsSync(join(path, 'target', 'artifact'))).toBe(true);
    expect(git(path, 'branch', '--show-current')).toBe('feat/two');
  });

  it('refuses to release a slot with uncommitted or untracked changes', () => {
    const f = createFixture();
    const path = String(f.cli(['acquire', 'feat/dirty'], live).stdout).trim();
    writeFileSync(join(path, 'new.txt'), 'untracked');
    const result = f.cli(['release', 'feat/dirty']);
    expect(result.status).not.toBe(0);
    expect(String(result.stderr)).toContain('uncommitted or untracked');
    expect(git(path, 'branch', '--show-current')).toBe('feat/dirty');
  });

  it('never reuses a dirty slot and fails at the cap listing the slots', () => {
    const f = createFixture();
    const env = { POPS_WORKTREE_MAX_SLOTS: '1', POPS_WORKTREE_LEASE_GRACE_MS: '0' };
    const path = String(
      f.cli(['acquire', 'feat/a'], { ...env, POPS_WORKTREE_HOLDER_PID: String(deadPid()) }).stdout
    ).trim();
    writeFileSync(join(path, 'README.md'), 'edited');
    const result = f.cli(['acquire', 'feat/b'], { ...env, ...live });
    expect(result.status).not.toBe(0);
    expect(String(result.stderr)).toContain('cap of 1');
    expect(String(result.stderr)).toContain('pops-slot-1: dirty (feat/a)');
    expect(git(path, 'branch', '--show-current')).toBe('feat/a');
    expect(git(path, 'status', '--porcelain')).toContain('README.md');
  });

  it('removes an abandoned pool lock that has no pid file', () => {
    const f = createFixture();
    mkdirSync(f.pool, { recursive: true });
    const lock = join(f.pool, '.pops-slots.lock');
    mkdirSync(lock);
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    const result = f.cli(['acquire', 'feat/lock'], live);
    expect(result.status).toBe(0);
    expect(existsSync(lock)).toBe(false);
  });

  it('reclaims a clean slot whose holder is dead and refuses while the holder lives', () => {
    const f = createFixture();
    const env = { POPS_WORKTREE_MAX_SLOTS: '1', POPS_WORKTREE_LEASE_GRACE_MS: '0' };
    const path = String(
      f.cli(['acquire', 'feat/a'], { ...env, POPS_WORKTREE_HOLDER_PID: String(deadPid()) }).stdout
    ).trim();
    const reclaimed = f.cli(['acquire', 'feat/b'], { ...env, ...live });
    expect(reclaimed.status).toBe(0);
    expect(String(reclaimed.stdout).trim()).toBe(path);
    expect(git(path, 'branch', '--show-current')).toBe('feat/b');
    const blocked = f.cli(['acquire', 'feat/c'], { ...env, ...live });
    expect(blocked.status).not.toBe(0);
  });

  it('checks out an existing local branch instead of recreating it', () => {
    const f = createFixture();
    git(f.repo, 'branch', 'feat/existing', 'origin/main');
    const path = String(f.cli(['acquire', 'feat/existing'], live).stdout).trim();
    expect(git(path, 'branch', '--show-current')).toBe('feat/existing');
  });

  it('status lists slots with state and branch', () => {
    const f = createFixture();
    f.cli(['acquire', 'feat/s'], live);
    const result = f.cli(['status']);
    expect(result.status).toBe(0);
    expect(String(result.stdout)).toMatch(/pops-slot-1\tbusy\tclean\tfeat\/s/);
  });

  it('gc is a dry-run by default and deletes nothing', () => {
    const f = createFixture();
    git(f.repo, 'branch', 'merged-branch', 'origin/main');
    const result = f.cli(['gc']);
    expect(result.status).toBe(0);
    expect(String(result.stdout)).toContain('dry-run');
    expect(String(result.stdout)).toContain('delete branch merged-branch (merged)');
    expect(git(f.repo, 'branch', '--list', 'merged-branch')).not.toBe('');
  });

  it('gc --apply deletes merged branches but keeps checked-out and unmerged ones', () => {
    const f = createFixture();
    git(f.repo, 'branch', 'merged-branch', 'origin/main');
    git(f.repo, 'switch', '-c', 'unmerged');
    writeFileSync(join(f.repo, 'x.txt'), 'x');
    git(f.repo, 'add', 'x.txt');
    git(f.repo, 'commit', '-m', 'feat: x');
    git(f.repo, 'switch', 'main');
    const result = f.cli(['gc', '--apply']);
    expect(result.status).toBe(0);
    expect(git(f.repo, 'branch', '--list', 'merged-branch')).toBe('');
    expect(git(f.repo, 'branch', '--list', 'unmerged')).not.toBe('');
    expect(git(f.repo, 'branch', '--list', 'main')).not.toBe('');
  });

  it('gc rejects --dry-run together with --apply', () => {
    const f = createFixture();
    expect(f.cli(['gc', '--dry-run', '--apply']).status).not.toBe(0);
  });

  it('hook create acquires a slot and prints only its path; hook remove releases it', () => {
    const f = createFixture();
    const created = f.cli(['hook', 'create'], live, JSON.stringify({ name: 'bold-oak' }));
    expect(created.status).toBe(0);
    const path = String(created.stdout).trim();
    expect(git(path, 'branch', '--show-current')).toBe('worktree-bold-oak');
    const removed = f.cli(['hook', 'remove'], live, JSON.stringify({ worktree_path: path }));
    expect(removed.status).toBe(0);
    expect(git(path, 'branch', '--show-current')).toBe('');
  });
});
