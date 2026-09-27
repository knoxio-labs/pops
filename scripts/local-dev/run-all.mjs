import { fileURLToPath } from 'node:url';

import { discoverLocalTasks, prepareTasks } from './discovery.mjs';
import { executeTask, failedOutcome, taskLabel } from './processes.mjs';

/**
 * Runs all descriptors, bounded for read-only checks and serial for tasks
 * that write generated output or build artifacts.
 *
 * @param {import('./discovery.mjs').LocalTask[]} descriptors
 * @param {{concurrency?: number, execute?: typeof executeTask}} [options]
 * @returns {Promise<{status: number, count: number, failures: string[]}>}
 */
export async function runTasks(descriptors, { concurrency = 4, execute = executeTask } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1)
    throw new RangeError('concurrency must be a positive integer');
  if (descriptors.length === 0)
    throw new Error('run-all: no locally-defined tasks matched — nothing ran');
  /** @type {string[]} */
  const failures = [];
  /** @param {import('./discovery.mjs').LocalTask} task */
  const run = async (task) => {
    const outcome = await execute(task);
    if (failedOutcome(outcome)) failures.push(taskLabel(task));
  };
  for (const task of descriptors.filter((descriptor) => descriptor.write)) await run(task);
  const readOnly = descriptors.filter((descriptor) => !descriptor.write);
  const tests = readOnly.filter(
    (descriptor) => descriptor.taskName === 'test' || descriptor.taskName.startsWith('test:')
  );
  const queue = readOnly.filter(
    (descriptor) => descriptor.taskName !== 'test' && !descriptor.taskName.startsWith('test:')
  );
  for (const task of tests) await run(task);
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const task = queue.shift();
        if (task !== undefined) await run(task);
      }
    })
  );
  return { status: failures.length === 0 ? 0 : 1, count: descriptors.length, failures };
}

async function main() {
  const [taskName] = process.argv.slice(2);
  if (taskName === undefined) throw new Error('Usage: node scripts/local-dev/run-all.mjs <task>');
  const descriptors = await discoverLocalTasks({ cwd: process.cwd(), taskNames: [taskName] });
  const prerequisites = await prepareTasks({ cwd: process.cwd(), descriptors });
  if (prerequisites.length > 0) {
    const preparation = await runTasks(prerequisites, { concurrency: 1 });
    if (preparation.status !== 0) {
      console.error(
        `run-all: ${taskName} prerequisite FAILED in: ${preparation.failures.join(', ')}`
      );
      process.exitCode = preparation.status;
      return;
    }
  }
  const result = await runTasks(descriptors, {
    concurrency: Number(process.env.RUN_ALL_CONCURRENCY ?? '4'),
  });
  if (result.status !== 0) {
    console.error(`run-all: ${taskName} FAILED in: ${result.failures.join(', ')}`);
    process.exitCode = result.status;
    return;
  }
  console.log(`run-all: ${taskName} passed in all ${result.count} locally-defined unit(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
