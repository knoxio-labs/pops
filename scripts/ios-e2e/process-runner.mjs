import { spawn as spawnProcess } from 'node:child_process';

const DEFAULT_GRACE_MS = 5_000;

/**
 * Runs commands in owned process groups and lets the caller finish cleanup after a signal.
 *
 * @param {{ graceMs?: number }} [options]
 * @returns {{ run: (command: string, args: string[], options?: { cwd?: string, env?: NodeJS.ProcessEnv }) => Promise<{ code: number | null, signal: NodeJS.Signals | null }>, signal: () => NodeJS.Signals | null, close: () => Promise<void> }}
 */
export function createProcessRunner({ graceMs = DEFAULT_GRACE_MS } = {}) {
  /** @type {Set<import('node:child_process').ChildProcess>} */
  const children = new Set();
  /** @type {Map<import('node:child_process').ChildProcess, NodeJS.Timeout>} */
  const escalationTimers = new Map();
  /** @type {NodeJS.Signals | null} */
  let receivedSignal = null;
  let closed = false;

  /** @param {import('node:child_process').ChildProcess} child @param {NodeJS.Signals} signal */
  const signalTree = (child, signal) => {
    if (child.pid === undefined) return;
    if (process.platform === 'win32') {
      child.kill(signal);
      return;
    }
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ESRCH') throw error;
    }
  };

  /** @param {number | undefined} pid */
  const processGroupExists = (pid) => {
    if (pid === undefined || process.platform === 'win32') return false;
    try {
      process.kill(-pid, 0);
      return true;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error)) throw error;
      if (error.code === 'ESRCH') return false;
      if (error.code === 'EPERM') return true;
      throw error;
    }
  };

  /** @param {number | undefined} pid */
  const waitForProcessGroup = async (pid) => {
    while (processGroupExists(pid)) await new Promise((resolve) => setTimeout(resolve, 25));
  };

  /** @param {import('node:child_process').ChildProcess} child @param {NodeJS.Signals} signal */
  const stop = (child, signal) => {
    if (escalationTimers.has(child)) return;
    signalTree(child, signal);
    if (signal === 'SIGKILL') return;
    const timer = setTimeout(() => signalTree(child, 'SIGKILL'), graceMs);
    timer.unref();
    escalationTimers.set(child, timer);
  };

  /** @param {NodeJS.Signals} signal */
  const requestStop = (signal) => {
    if (receivedSignal !== null) return;
    receivedSignal = signal;
    for (const child of children) stop(child, signal);
  };

  const onInterrupt = () => requestStop('SIGINT');
  const onTerminate = () => requestStop('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);

  /** @param {string} command @param {string[]} args @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [options] */
  const run = (command, args, options = {}) => {
    if (closed) return Promise.reject(new Error('process runner is closed'));
    if (receivedSignal !== null) return Promise.resolve({ code: null, signal: receivedSignal });
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawnProcess(command, args, {
          ...options,
          detached: process.platform !== 'win32',
          stdio: 'inherit',
        });
      } catch (error) {
        reject(error);
        return;
      }

      children.add(child);
      let settled = false;
      const cleanUp = () => {
        children.delete(child);
        const timer = escalationTimers.get(child);
        if (timer !== undefined) clearTimeout(timer);
        escalationTimers.delete(child);
      };
      /** @param {unknown} error */
      const fail = (error) => {
        if (settled) return;
        settled = true;
        cleanUp();
        reject(error);
      };
      /** @param {number | null} code @param {NodeJS.Signals | null} signal */
      const finish = async (code, signal) => {
        if (settled) return;
        try {
          if (processGroupExists(child.pid)) {
            stop(child, receivedSignal ?? 'SIGTERM');
            await waitForProcessGroup(child.pid);
          }
          if (settled) return;
          settled = true;
          cleanUp();
          resolve({ code, signal });
        } catch (error) {
          fail(error);
        }
      };
      child.once('error', fail);
      child.once('close', (code, signal) => void finish(code, signal));
      if (receivedSignal !== null) stop(child, receivedSignal);
    });
  };

  const close = async () => {
    if (closed) return;
    closed = true;
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    const running = [...children];
    for (const child of running) stop(child, 'SIGTERM');
    await Promise.all(
      running.map(async (child) => {
        if (child.exitCode === null && child.signalCode === null) {
          await new Promise((resolve) => child.once('close', resolve));
        }
        await waitForProcessGroup(child.pid);
      })
    );
  };

  return { run, signal: () => receivedSignal, close };
}
