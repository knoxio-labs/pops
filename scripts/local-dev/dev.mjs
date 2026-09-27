import { execFile, spawn as nodeSpawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { discoverSelectedTasks } from './discovery.mjs';
import { taskLabel } from './processes.mjs';

const execFileAsync = promisify(execFile);
const KILL_GRACE_MS = 2_000;
/** @type {(command: string, args: string[]) => void} */
const runTreeKill = (command, args) => {
  execFile(command, args, () => {});
};

/** @typedef {import('node:child_process').ChildProcess} ChildProcess */
/** @typedef {(command: string, args: string[], options: {cwd: string, stdio: 'inherit', shell: false, detached: boolean}) => ChildProcess} TaskSpawner */

/**
 * Terminates a watcher and all processes it started. Windows uses taskkill's
 * tree switch because Node signals target only the direct wrapper there.
 *
 * @param {ChildProcess} child
 * @param {NodeJS.Signals} signal
 * @param {{platform?: NodeJS.Platform, treeKill?: (command: string, args: string[]) => void}} [options]
 */
export function signalProcessTree(
  child,
  signal,
  { platform = process.platform, treeKill = runTreeKill } = {}
) {
  if (child.pid === undefined) return;
  if (platform === 'win32') {
    const args = ['/PID', String(child.pid), '/T'];
    if (signal === 'SIGKILL') args.push('/F');
    treeKill('taskkill', args);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
  }
}

/**
 * Runs selected development watchers in independent process groups. A child
 * exit, spawn failure, or incoming termination signal ends every group.
 *
 * @param {import('./discovery.mjs').LocalTask[]} descriptors
 * @param {{spawn?: TaskSpawner, processRef?: NodeJS.Process, graceMs?: number}} [options]
 * @returns {Promise<number>}
 */
export function superviseDevProcesses(
  descriptors,
  { spawn = nodeSpawn, processRef = process, graceMs = KILL_GRACE_MS } = {}
) {
  if (descriptors.length === 0)
    return Promise.reject(new Error('dev: no locally-defined tasks matched'));
  return new Promise((resolve) => {
    /** @type {ChildProcess[]} */
    const children = [];
    let remaining = descriptors.length;
    let status = 0;
    let stopping = false;
    let escalationComplete = true;
    const finish = () => {
      if (remaining !== 0 || !escalationComplete) return;
      processRef.removeListener('SIGINT', onInterrupt);
      processRef.removeListener('SIGTERM', onTerminate);
      resolve(status);
    };
    /** @param {NodeJS.Signals} signal */
    const stop = (signal) => {
      if (stopping) return;
      stopping = true;
      for (const child of children) signalProcessTree(child, signal);
      escalationComplete = false;
      setTimeout(() => {
        for (const child of children) signalProcessTree(child, 'SIGKILL');
        escalationComplete = true;
        finish();
      }, graceMs);
    };
    const onInterrupt = () => {
      status = 1;
      stop('SIGINT');
    };
    const onTerminate = () => {
      status = 1;
      stop('SIGTERM');
    };
    processRef.once('SIGINT', onInterrupt);
    processRef.once('SIGTERM', onTerminate);
    for (const descriptor of descriptors) {
      const command = descriptor.command[0];
      if (command === undefined) {
        status = 1;
        remaining -= 1;
        stop('SIGTERM');
        continue;
      }
      try {
        const child = spawn(command, descriptor.command.slice(1), {
          cwd: descriptor.unitPath,
          stdio: 'inherit',
          shell: false,
          detached: process.platform !== 'win32',
        });
        children.push(child);
        let settled = false;
        /** @param {number | null} code */
        const settledExit = (code) => {
          if (settled) return;
          settled = true;
          remaining -= 1;
          if (code !== 0) status = 1;
          if (!stopping) {
            console.error(`dev: ${taskLabel(descriptor)} exited; stopping sibling processes`);
            stop('SIGTERM');
          }
          finish();
        };
        child.once('error', () => settledExit(1));
        child.once('exit', (code) => settledExit(code));
      } catch {
        status = 1;
        remaining -= 1;
        stop('SIGTERM');
      }
    }
    finish();
  });
}

async function main() {
  await execFileAsync('mise', ['run', 'build'], { cwd: process.cwd() });
  const descriptors = await discoverSelectedTasks({
    cwd: process.cwd(),
    selectors: process.argv.slice(2),
    taskName: 'dev',
  });
  process.exitCode = await superviseDevProcesses(descriptors);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
