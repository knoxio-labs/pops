import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  events: new Array<string>(),
  fingerprints: new Array<string>(),
  sources: new Array<string>(),
  cached: false,
  rootTypecheckStatus: 0,
  rootTestStatus: 0,
  docsStatus: 0,
  taskStatus: 0,
  discoverNoUnits: false,
  missingTypecheckTasks: false,
  changedPaths: ['libs/example/src/code.ts'],
}));
vi.mock('../local-dev/discovery.mjs', () => ({
  discoverUnits: vi.fn(async () =>
    state.discoverNoUnits
      ? []
      : [
          {
            unitPath: '/fixture/libs/example',
            packageName: 'example',
            dependencies: [],
            taskNames: ['typecheck', 'test'],
          },
          {
            unitPath: '/fixture/pillars/other',
            packageName: 'other',
            dependencies: [],
            taskNames: ['typecheck', 'test'],
          },
          {
            unitPath: '/fixture/clients/ios',
            packageName: undefined,
            dependencies: [],
            taskNames: ['typecheck', 'test'],
          },
        ]
  ),
  discoverLocalTasks: vi.fn(
    async ({ taskNames, unitPaths }: { taskNames: string[]; unitPaths: string[] }) =>
      state.missingTypecheckTasks && taskNames[0] === 'typecheck'
        ? []
        : unitPaths.map((unitPath) => ({ unitPath, taskName: taskNames[0] }))
  ),
  prepareTasks: vi.fn(async ({ descriptors }: { descriptors: unknown[] }) =>
    descriptors.length > 0 ? [{ unitPath: 'libs/example', taskName: 'build' }] : []
  ),
}));
vi.mock('../local-dev/affected.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../local-dev/affected.mjs')>();
  return { ...actual, changedFiles: () => state.changedPaths };
});
vi.mock('../local-dev/private-inputs.mjs', () => ({ privateInputs: () => [] }));
vi.mock('../local-dev/fingerprint.mjs', () => ({
  validationFingerprint: () =>
    state.fingerprints.length > 1 ? state.fingerprints.shift() : state.fingerprints[0],
}));
vi.mock('../local-dev/repository-inputs.mjs', () => ({
  repositoryFingerprint: vi.fn(() =>
    state.sources.length > 1 ? state.sources.shift() : state.sources[0]
  ),
}));
vi.mock('../local-dev/validation-cache.mjs', () => ({
  readReceipt: () => null,
  coversValidation: () => state.cached,
  invalidateReceipt: () => state.events.push('invalidate'),
  writeReceipt: () => {
    state.events.push('receipt');
    return true;
  },
}));
vi.mock('../local-dev/run-all.mjs', () => ({
  runTasks: async (tasks: { unitPath: string; taskName: string }[]) => {
    if (tasks.length === 0) throw new Error('runner received no tasks');
    for (const task of tasks) state.events.push(`${task.taskName}:${task.unitPath}`);
    return {
      status: tasks[0]?.taskName === 'typecheck' ? state.taskStatus : 0,
      count: tasks.length,
      failures: [],
    };
  },
}));
vi.mock('node:child_process', () => ({
  spawnSync: (command: string, args: string[]) => {
    state.events.push(args.join(' '));
    if (command === 'node') return { status: state.docsStatus };
    if (args.includes('typecheck:scripts')) return { status: state.rootTypecheckStatus };
    if (args.includes('test:scripts')) return { status: state.rootTestStatus };
    return { status: 0 };
  },
}));

import { discoverUnits, discoverLocalTasks, prepareTasks } from '../local-dev/discovery.mjs';
import { repositoryFingerprint } from '../local-dev/repository-inputs.mjs';
import { validate } from '../local-dev/validate.mjs';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CI', undefined);
  state.events = [];
  state.fingerprints = ['steady'];
  state.sources = ['source'];
  state.cached = false;
  state.rootTypecheckStatus = 0;
  state.rootTestStatus = 0;
  state.docsStatus = 0;
  state.taskStatus = 0;
  state.discoverNoUnits = false;
  state.missingTypecheckTasks = false;
  state.changedPaths = ['libs/example/src/code.ts'];
});

afterEach(() => vi.unstubAllEnvs());

describe('validation orchestration', () => {
  it('plans without reading source snapshots or running checks', async () => {
    expect(await validate({ cwd: '/fixture', planOnly: true })).toBe(0);
    expect(discoverUnits).toHaveBeenCalledOnce();
    expect(repositoryFingerprint).not.toHaveBeenCalled();
    expect(discoverLocalTasks).not.toHaveBeenCalled();
    expect(state.events).toEqual([]);
  });
  it('shares the trusted discovery result across checks, prerequisites and tests', async () => {
    expect(await validate({ cwd: '/fixture' })).toBe(0);
    expect(discoverUnits).toHaveBeenCalledOnce();
    const units = await vi.mocked(discoverUnits).mock.results[0]?.value;
    expect(units).toHaveLength(3);
    expect(discoverLocalTasks).toHaveBeenCalledTimes(2);
    for (const [options] of vi.mocked(discoverLocalTasks).mock.calls)
      expect(options.units).toBe(units);
    expect(vi.mocked(prepareTasks).mock.calls[0]?.[0].units).toBe(units);
  });
  it('normalizes discovered absolute paths and excludes clients and unrelated units', async () => {
    expect(await validate({ cwd: '/fixture', typecheckOnly: true })).toBe(0);
    expect(state.events).toContain('typecheck:libs/example');
    expect(state.events).not.toContain('typecheck:pillars/other');
    expect(state.events).not.toContain('typecheck:clients/ios');
  });
  it('builds and prepares generated inputs before checking root tooling', async () => {
    expect(await validate({ cwd: '/fixture', all: true, typecheckOnly: true })).toBe(0);
    expect(state.events.indexOf('build')).toBeLessThan(
      state.events.indexOf('run typecheck:scripts')
    );
    expect(state.events).toContain('typecheck:pillars/other');
  });
  it('typechecks standalone root tooling when no product unit is selected', async () => {
    state.discoverNoUnits = true;
    state.changedPaths = ['scripts/ci/integration-promote.mjs'];
    expect(await validate({ cwd: '/fixture', typecheckOnly: true })).toBe(0);
    expect(await vi.mocked(discoverUnits).mock.results[0]?.value).toEqual([]);
    expect(state.events).toContain('run typecheck:scripts');
    expect(state.events).not.toContain('typecheck:libs/example');
    expect(state.events).not.toContain('typecheck:pillars/other');
  });
  it('runs standalone root tooling tests and returns their failure', async () => {
    state.discoverNoUnits = true;
    state.changedPaths = ['scripts/ci/integration-promote.mjs'];
    state.rootTestStatus = 3;
    expect(await validate({ cwd: '/fixture' })).toBe(3);
    expect(state.events).toContain('run typecheck:scripts');
    expect(state.events).toContain('run test:scripts');
  });
  it('rejects a selected unit whose typecheck task is missing', async () => {
    state.missingTypecheckTasks = true;
    await expect(validate({ cwd: '/fixture', typecheckOnly: true })).rejects.toThrow(
      'runner received no tasks'
    );
    expect(state.events).toContain('build');
    expect(state.events).not.toContain('receipt');
  });
  it('stops documentation-only validation after lint, format and the docs guard', async () => {
    state.changedPaths = ['README.md', 'pillars/other/README.md'];
    expect(await validate({ cwd: '/fixture' })).toBe(0);
    expect(state.events).toEqual([
      'lint',
      'exec -- pnpm format:check',
      'scripts/ci/check-docs-model.mjs',
    ]);
  });
  it('returns a documentation guard failure before typechecking', async () => {
    state.docsStatus = 4;
    expect(await validate({ cwd: '/fixture' })).toBe(4);
    expect(state.events).not.toContain('typecheck:libs/example');
  });
  it('does not check units or publish success after prerequisite failure', async () => {
    state.rootTypecheckStatus = 2;
    expect(await validate({ cwd: '/fixture', all: true, typecheckOnly: true })).toBe(2);
    expect(state.events).not.toContain('typecheck:libs/example');
    expect(state.events).not.toContain('receipt');
  });
  it('revokes an older receipt before a forced check fails', async () => {
    state.cached = true;
    state.taskStatus = 1;
    expect(await validate({ cwd: '/fixture', force: true, typecheckOnly: true })).toBe(1);
    expect(state.events.indexOf('invalidate')).toBeLessThan(
      state.events.indexOf('typecheck:libs/example')
    );
    expect(state.events).not.toContain('receipt');
  });
  it('rejects edits during planning before any typecheck is accepted', async () => {
    state.sources = ['before', 'after'];
    expect(await validate({ cwd: '/fixture', typecheckOnly: true })).toBe(1);
    expect(state.events).not.toContain('typecheck:libs/example');
    expect(state.events).not.toContain('receipt');
  });
  it('rechecks inputs before accepting cached evidence', async () => {
    state.cached = true;
    state.fingerprints = ['before', 'after'];
    expect(await validate({ cwd: '/fixture', typecheckOnly: true })).toBe(1);
    expect(state.events).toContain('invalidate');
    expect(state.events).not.toContain('receipt');
  });
  it('reuses exact evidence without repeating build prerequisites or typechecks', async () => {
    state.cached = true;
    expect(await validate({ cwd: '/fixture', all: true, typecheckOnly: true })).toBe(0);
    expect(state.events).toEqual([]);
  });
  it('still runs tests when exact typecheck evidence is reused', async () => {
    state.cached = true;
    expect(await validate({ cwd: '/fixture', all: true })).toBe(0);
    expect(state.events).toEqual([
      'lint',
      'exec -- pnpm format:check',
      'scripts/ci/check-docs-model.mjs',
      'run test:scripts',
      'test:libs/example',
      'test:pillars/other',
    ]);
  });
  it('reruns typechecks in CI even when local evidence matches', async () => {
    vi.stubEnv('CI', 'true');
    state.cached = true;
    expect(await validate({ cwd: '/fixture', all: true, typecheckOnly: true })).toBe(0);
    expect(state.events).toContain('run typecheck:scripts');
    expect(state.events).toContain('typecheck:libs/example');
  });
});
