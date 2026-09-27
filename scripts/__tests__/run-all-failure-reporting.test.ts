import { describe, expect, it } from 'vitest';

import { runTasks } from '../local-dev/run-all.mjs';

describe('run-all failure reporting', () => {
  it('attempts every descriptor and reports every failure', async () => {
    const attempted: string[] = [];
    const result = await runTasks(
      ['a-red', 'm-red', 'z-green'].map((unitPath) => ({
        unitPath,
        packageName: undefined,
        taskName: 'test',
        command: ['test'],
        source: 'package' as const,
        write: false,
      })),
      {
        execute: async (task) => {
          attempted.push(task.unitPath);
          return { task, code: task.unitPath === 'z-green' ? 0 : 1, signal: null };
        },
      }
    );
    expect(attempted.toSorted()).toEqual(['a-red', 'm-red', 'z-green']);
    expect(result.failures.toSorted()).toEqual(['a-red:test', 'm-red:test']);
    expect(result.status).toBe(1);
  });
});
