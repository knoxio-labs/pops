import { spawn as nodeSpawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { signalProcessTree, superviseDevProcesses } from '../local-dev/dev.mjs';
import { discoverLocalTasks, discoverUnits } from '../local-dev/discovery.mjs';
import { runTasks } from '../local-dev/run-all.mjs';

const temporaryRoots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(process.cwd(), 'tmp', 'local-dev-runner-'));
  temporaryRoots.push(root);
  return root;
}

function unit(root: string, path: string, files: Record<string, string>): void {
  const directory = join(root, path);
  mkdirSync(directory, { recursive: true });
  for (const [name, contents] of Object.entries(files))
    writeFileSync(join(directory, name), contents);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('local development task discovery', () => {
  it('retains the unit mise environment for package-backed tasks', async () => {
    const root = fixtureRoot();
    unit(root, 'libs/configured', {
      'mise.toml': '[env]\nPOPS_DEV_FIXTURE = "unit"\n',
      'package.json': JSON.stringify({
        name: '@test/configured',
        scripts: { test: 'node verify.mjs' },
      }),
      'verify.mjs': 'process.exit(process.env.POPS_DEV_FIXTURE === "unit" ? 0 : 17);',
    });
    const [task] = await discoverLocalTasks({ cwd: root, taskNames: ['test'], verifyTrust: false });
    if (task === undefined || task.command[0] === undefined)
      throw new Error('Missing fixture task');
    const result = spawnSync(task.command[0], task.command.slice(1), {
      cwd: task.unitPath,
      env: { ...process.env, MISE_TRUSTED_CONFIG_PATHS: root },
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
  }, 60_000);

  it('reads only a unit-local task and never offers an inherited root task', async () => {
    const root = fixtureRoot();
    writeFileSync(join(root, 'mise.toml'), '[tasks.typecheck]\nrun = "false"\n');
    unit(root, 'pillars/local', { 'mise.toml': '[tasks.test]\nrun = "true"\n' });
    unit(root, 'libs/package', {
      'package.json': JSON.stringify({
        name: '@test/package',
        scripts: { typecheck: 'tsc --noEmit' },
      }),
    });

    const tasks = await discoverLocalTasks({
      cwd: root,
      taskNames: ['typecheck', 'test'],
      verifyTrust: false,
    });

    expect(tasks.map((task) => `${task.unitPath}:${task.taskName}`)).toEqual([
      `${join(root, 'libs/package')}:typecheck`,
      `${join(root, 'pillars/local')}:test`,
    ]);
  });

  it('fails explicitly on malformed local configuration', async () => {
    const root = fixtureRoot();
    unit(root, 'pillars/broken', { 'mise.toml': '[tasks.bad\n' });

    await expect(discoverUnits({ cwd: root, verifyTrust: false })).rejects.toThrow(
      'Unable to parse local task configuration'
    );
  });

  it('returns no descriptor for a task inherited only from the root config', async () => {
    const root = fixtureRoot();
    writeFileSync(join(root, 'mise.toml'), '[tasks.missing]\nrun = "false"\n');
    unit(root, 'pillars/local', { 'mise.toml': '[tasks.test]\nrun = "true"\n' });
    await expect(
      discoverLocalTasks({ cwd: root, taskNames: ['missing'], verifyTrust: false })
    ).resolves.toEqual([]);
  });
});

describe('bounded task runner', () => {
  it('limits read-only work while recording every failure', async () => {
    let active = 0;
    let peak = 0;
    const result = await runTasks(
      ['one', 'two', 'three'].map((name) => ({
        unitPath: name,
        packageName: undefined,
        taskName: 'typecheck',
        command: ['test'],
        source: 'package' as const,
        write: false,
      })),
      {
        concurrency: 2,
        execute: async (task) => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((done) => setTimeout(done, 5));
          active -= 1;
          return {
            task,
            code: task.unitPath === 'one' || task.unitPath === 'three' ? 1 : 0,
            signal: null,
          };
        },
      }
    );
    expect(peak).toBe(2);
    expect(result).toMatchObject({
      status: 1,
      count: 3,
      failures: ['one:typecheck', 'three:typecheck'],
    });
  });

  it('refuses a run with no local tasks', async () => {
    await expect(runTasks([])).rejects.toThrow('nothing ran');
  });

  it('serializes package test commands despite a wider read-only budget', async () => {
    let active = 0;
    let peak = 0;
    await runTasks(
      ['test', 'test:coverage'].map((taskName) => ({
        unitPath: taskName,
        packageName: undefined,
        taskName,
        command: ['test'],
        source: 'package' as const,
        write: false,
      })),
      {
        concurrency: 4,
        execute: async (task) => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          return { task, code: 0, signal: null };
        },
      }
    );
    expect(peak).toBe(1);
  });
});

describe('dev supervisor', { timeout: 60_000 }, () => {
  it('uses taskkill tree termination for Windows watchers', () => {
    const child = nodeSpawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    const calls: string[][] = [];
    signalProcessTree(child, 'SIGTERM', {
      platform: 'win32',
      treeKill: (command, args) => {
        calls.push([command, ...args]);
      },
    });
    child.kill('SIGKILL');
    expect(calls).toEqual([['taskkill', '/PID', String(child.pid), '/T']]);
  });

  it('terminates a sibling watcher process group and preserves the initial failure', async () => {
    const root = fixtureRoot();
    const grandchildPid = join(root, 'grandchild.pid');
    const sleeper = `const { spawn } = require('node:child_process'); const fs = require('node:fs'); const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"]); fs.writeFileSync(${JSON.stringify(grandchildPid)}, String(child.pid)); setInterval(() => {}, 1000);`;
    const result = superviseDevProcesses([
      {
        unitPath: root,
        packageName: undefined,
        taskName: 'dev:fail',
        command: [process.execPath, '-e', 'setTimeout(() => process.exit(1), 150)'],
        source: 'package' as const,
        write: false,
      },
      {
        unitPath: root,
        packageName: undefined,
        taskName: 'dev:wait',
        command: [process.execPath, '-e', sleeper],
        source: 'package' as const,
        write: false,
      },
    ]);
    await expect(result).resolves.toBe(1);
    expect(existsSync(grandchildPid)).toBe(true);
    const pid = Number(readFileSync(grandchildPid, 'utf8'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const state = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {
      encoding: 'utf8',
    }).stdout.trim();
    expect(state === '' || state.startsWith('Z')).toBe(true);
  }, 5_000);

  it('returns failure when spawning a watcher fails instead of waiting forever', async () => {
    const root = fixtureRoot();
    await expect(
      superviseDevProcesses([
        {
          unitPath: root,
          packageName: undefined,
          taskName: 'dev:missing',
          command: ['this-command-does-not-exist'],
          source: 'package',
          write: false,
        },
        {
          unitPath: root,
          packageName: undefined,
          taskName: 'dev:wait',
          command: [process.execPath, '-e', 'setInterval(() => {}, 1000)'],
          source: 'package',
          write: false,
        },
      ])
    ).resolves.toBe(1);
  }, 5_000);
});
