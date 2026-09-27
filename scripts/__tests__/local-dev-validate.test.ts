import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  events: new Array<string>(),
  fingerprints: new Array<string>(),
  sources: new Array<string>(),
  cached: false,
  scriptsStatus: 0,
  taskStatus: 0,
}));
vi.mock('../local-dev/discovery.mjs', () => ({
  discoverUnits: async () => [
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
  ],
  discoverLocalTasks: async ({
    taskNames,
    unitPaths,
  }: {
    taskNames: string[];
    unitPaths: string[];
  }) => unitPaths.map((unitPath) => ({ unitPath, taskName: taskNames[0] })),
  prepareTasks: async () => [{ unitPath: 'libs/example', taskName: 'build' }],
}));
vi.mock('../local-dev/affected.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../local-dev/affected.mjs')>();
  return { ...actual, changedFiles: () => ['libs/example/src/code.ts'] };
});
vi.mock('../local-dev/private-inputs.mjs', () => ({ privateInputs: () => [] }));
vi.mock('../local-dev/fingerprint.mjs', () => ({
  validationFingerprint: () =>
    state.fingerprints.length > 1 ? state.fingerprints.shift() : state.fingerprints[0],
}));
vi.mock('../local-dev/repository-inputs.mjs', () => ({
  repositoryFingerprint: () =>
    state.sources.length > 1 ? state.sources.shift() : state.sources[0],
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
    for (const task of tasks) state.events.push(`${task.taskName}:${task.unitPath}`);
    return {
      status: tasks[0]?.taskName === 'typecheck' ? state.taskStatus : 0,
      count: tasks.length,
      failures: [],
    };
  },
}));
vi.mock('node:child_process', () => ({
  spawnSync: (_command: string, args: string[]) => {
    state.events.push(args.join(' '));
    return { status: args.includes('typecheck:scripts') ? state.scriptsStatus : 0 };
  },
}));

import { validate } from '../local-dev/validate.mjs';

beforeEach(() => {
  vi.stubEnv('CI', undefined);
  state.events = [];
  state.fingerprints = ['steady'];
  state.sources = ['source'];
  state.cached = false;
  state.scriptsStatus = 0;
  state.taskStatus = 0;
});

afterEach(() => vi.unstubAllEnvs());

describe('validation orchestration', () => {
  it('normalizes discovered absolute paths and excludes clients and unrelated units', async () => {
    expect(await validate({ cwd: '/fixture', typecheckOnly: true })).toBe(0);
    expect(state.events).toContain('typecheck:libs/example');
    expect(state.events).not.toContain('typecheck:pillars/other');
    expect(state.events).not.toContain('typecheck:clients/ios');
  });
  it('builds before root scripts on a full cold check', async () => {
    expect(await validate({ cwd: '/fixture', all: true, typecheckOnly: true })).toBe(0);
    expect(state.events.indexOf('build')).toBeLessThan(
      state.events.indexOf('run typecheck:scripts')
    );
    expect(state.events).toContain('typecheck:pillars/other');
  });
  it('does not check units or publish success after prerequisite failure', async () => {
    state.scriptsStatus = 2;
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
