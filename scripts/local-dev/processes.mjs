import { spawn as nodeSpawn } from 'node:child_process';

/** @typedef {import('node:child_process').ChildProcess} ChildProcess */
/** @typedef {(command: string, args: string[], options: {cwd: string, stdio: 'inherit', shell: false}) => ChildProcess} TaskSpawner */

/** @param {import('./discovery.mjs').LocalTask} task */
export function taskLabel(task) {
  return `${task.unitPath}:${task.taskName}`;
}

/**
 * Starts one task without a shell. The returned promise always resolves so a
 * caller can aggregate every task failure instead of leaking a rejection.
 *
 * @param {import('./discovery.mjs').LocalTask} task
 * @param {{spawn?: TaskSpawner}} [options]
 * @returns {Promise<{task: import('./discovery.mjs').LocalTask, code: number | null, signal: NodeJS.Signals | null, error?: Error}>}
 */
export function executeTask(task, { spawn = nodeSpawn } = {}) {
  return new Promise((resolve) => {
    const command = task.command[0];
    const args = task.command.slice(1);
    if (command === undefined) throw new Error(`Task ${taskLabel(task)} has no command`);
    const child = spawn(command, args, { cwd: task.unitPath, stdio: 'inherit', shell: false });
    let settled = false;
    /** @param {{code: number | null, signal: NodeJS.Signals | null, error?: Error}} result */
    const settle = (result) => {
      if (!settled) {
        settled = true;
        resolve({ task, ...result });
      }
    };
    child.once('error', (error) => settle({ code: null, signal: null, error }));
    child.once('exit', (code, signal) => settle({ code, signal }));
  });
}

/** @param {{code: number | null, signal: NodeJS.Signals | null, error?: Error}} outcome */
export function failedOutcome(outcome) {
  return outcome.error !== undefined || outcome.code !== 0 || outcome.signal !== null;
}
