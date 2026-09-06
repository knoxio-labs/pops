/**
 * `retryWithLockClear` is the orchestration `.github/workflows/fe-test-e2e.yml`
 * delegates its Playwright install retries to. The bug it replaces (a bounded
 * retry that abandons a stalled attempt instead of killing it, so the next
 * attempt races the orphan for the same dpkg lock and dies instantly) only
 * reproduces on a real Ubuntu runner with real apt/dpkg processes — not
 * something a unit test can stand up. What a unit test CAN pin is the
 * ordering contract that fixes it: kill the stale holder, wait for the lock to
 * actually clear, only then retry — and that the wait itself stays bounded so
 * a lock that never clears cannot turn "bounded retry" into a hang.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { load } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  CLI_DEFAULTS,
  retryWithLockClear,
  worstCaseSeconds,
} from '../playwright-install-retry.mjs';

describe('retryWithLockClear', () => {
  it('returns success on the first attempt without touching the lock machinery', async () => {
    const isLockHeld = vi.fn();
    const killStaleHolders = vi.fn();

    const result = await retryWithLockClear({
      attempts: 3,
      run: async () => true,
      isLockHeld,
      killStaleHolders,
      sleep: async () => {},
      backoffMs: () => 0,
    });

    expect(result).toEqual({ success: true, attempt: 1 });
    expect(isLockHeld).not.toHaveBeenCalled();
    expect(killStaleHolders).not.toHaveBeenCalled();
  });

  it('kills the stale holder and waits for the lock to clear before the retry runs', async () => {
    // Simulates the real failure: attempt 1 "times out" but leaves a process
    // behind holding the lock. Attempt 2 only succeeds once that lock is gone
    // — tying the retry's success directly to the lock state, the way the real
    // dpkg-lock error does.
    let lockHeld = true;
    const events: string[] = [];

    const isLockHeld = vi.fn(async () => lockHeld);
    const killStaleHolders = vi.fn(async () => {
      lockHeld = false;
    });
    const run = vi.fn(async (attempt: number) => {
      events.push(`run:${attempt}`);
      if (attempt === 1) return false;
      return !lockHeld;
    });

    const result = await retryWithLockClear({
      attempts: 3,
      run,
      isLockHeld,
      killStaleHolders,
      sleep: async () => {
        events.push('sleep');
      },
      backoffMs: () => 0,
      onEvent: (e) => events.push(e.type),
    });

    expect(result).toEqual({ success: true, attempt: 2 });
    expect(killStaleHolders).toHaveBeenCalledTimes(1);
    expect(isLockHeld).toHaveBeenCalled();

    // The load-bearing assertion: kill, then a lock check that returns false,
    // then (and only then) the second run. A regression that retries
    // immediately after killing — without confirming the lock actually
    // cleared — would still pass this repo's real CI most of the time, since
    // `pkill -9` is usually fast; this ordering check catches it even when the
    // kill hasn't taken effect yet.
    expect(events).toEqual(['run:1', 'attempt-failed', 'lock-cleared', 'sleep', 'run:2']);
  });

  it('never lets a lock that will not clear turn the retry into an unbounded wait', async () => {
    const isLockHeld = vi.fn(async () => true);
    const killStaleHolders = vi.fn(async () => {});
    const run = vi.fn(async () => false);
    const sleep = vi.fn(async () => {});

    const result = await retryWithLockClear({
      attempts: 2,
      run,
      isLockHeld,
      killStaleHolders,
      sleep,
      backoffMs: () => 0,
      lockPollMs: 1,
      maxLockWaitPolls: 5,
    });

    expect(result).toEqual({ success: false, attempt: 2 });
    expect(run).toHaveBeenCalledTimes(2);
    // One wait-for-clear cycle happens between the two attempts, bounded by
    // maxLockWaitPolls — never an unbounded spin.
    expect(isLockHeld.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it('gives up after the configured attempt count even when the command never succeeds', async () => {
    const run = vi.fn(async () => false);

    const result = await retryWithLockClear({
      attempts: 3,
      run,
      isLockHeld: async () => false,
      killStaleHolders: async () => {},
      sleep: async () => {},
      backoffMs: () => 0,
    });

    expect(result).toEqual({ success: false, attempt: 3 });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('rejects a non-positive attempt bound rather than silently no-op-ing', async () => {
    await expect(
      retryWithLockClear({
        attempts: 0,
        run: async () => true,
        isLockHeld: async () => false,
        killStaleHolders: async () => {},
        sleep: async () => {},
        backoffMs: () => 0,
      })
    ).rejects.toThrow(RangeError);
  });
});

/**
 * The retry budget and the step timeout are two numbers in two files that only
 * work if they are held against each other. Before POPS-2302's fix they were
 * not: three 300s attempts plus two gaps came to 1155s inside a step capped at
 * 900s, so a genuinely starved mirror never reached the script's own
 * `::error::` — GitHub killed the step first and the log ended on a bare
 * `The operation was canceled`. That is the failure the ticket describes,
 * relocated from the job timeout to the step timeout rather than fixed.
 *
 * These read the real workflow, including the flags on the real command line,
 * so overriding `--attempts` in the YAML is covered too.
 */
describe('the retry budget fits the step timeout it runs under', () => {
  const StepSchema = z.object({
    name: z.string().optional(),
    run: z.string().optional(),
    'timeout-minutes': z.number().optional(),
  });
  const WorkflowSchema = z.object({
    jobs: z.record(z.string(), z.object({ steps: z.array(StepSchema) })),
  });

  const workflowPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    '.github',
    'workflows',
    'fe-test-e2e.yml'
  );

  /** Every step whose `run` invokes this script, with the flags it passes. */
  function invokingSteps(): { name: string; timeoutMinutes: number | undefined; run: string }[] {
    const workflow = WorkflowSchema.parse(load(readFileSync(workflowPath, 'utf8')));
    return Object.values(workflow.jobs)
      .flatMap((job) => job.steps)
      .filter((step) => step.run?.includes('playwright-install-retry.mjs'))
      .map((step) => ({
        name: step.name ?? '(unnamed)',
        timeoutMinutes: step['timeout-minutes'],
        run: step.run ?? '',
      }));
  }

  function flagNumber(run: string, flag: string, fallback: number): number {
    const match = new RegExp(`${flag}\\s+(\\d+)`).exec(run);
    return match ? Number(match[1]) : fallback;
  }

  it('finds the steps that actually invoke it, so the assertions below are not vacuous', () => {
    expect(invokingSteps().map((s) => s.name)).toEqual([
      'Install Playwright browsers',
      'Install Playwright system dependencies',
    ]);
  });

  it.each(invokingSteps())(
    '$name leaves the script room to report its own failure',
    ({ timeoutMinutes, run }) => {
      expect(timeoutMinutes, 'the step must carry its own timeout-minutes').toBeTypeOf('number');

      const budget = worstCaseSeconds({
        ...CLI_DEFAULTS,
        attempts: flagNumber(run, '--attempts', CLI_DEFAULTS.attempts),
        timeoutSeconds: flagNumber(run, '--timeout-seconds', CLI_DEFAULTS.timeoutSeconds),
      });

      expect(
        budget,
        `the retry can burn ${String(budget)}s but the step is capped at ` +
          `${String((timeoutMinutes ?? 0) * 60)}s. The runner would kill it mid-loop and the ` +
          'script would never print why it gave up — the POPS-2302 signature. Shrink attempts, ' +
          'the per-attempt timeout or the backoff; do not raise the step, the job has no room.'
      ).toBeLessThan((timeoutMinutes ?? 0) * 60);
    }
  );
});

describe('worstCaseSeconds', () => {
  const backoffMs = (attempt: number): number => attempt * 45_000;

  it('is just the attempt timeout when there is no retry to pay for', () => {
    expect(worstCaseSeconds({ attempts: 1, timeoutSeconds: 300, backoffMs })).toBe(300);
  });

  it('charges each gap the full bounded lock wait as well as its backoff', () => {
    // 2×300 attempts + (60 polls × 1s lock wait) + 45s backoff.
    expect(worstCaseSeconds({ attempts: 2, timeoutSeconds: 300, backoffMs })).toBe(705);
  });

  it('grows the backoff per gap, not per attempt', () => {
    // Third attempt adds 300 + 60 + 90 (backoff(2)), not 300 + 60 + 45.
    expect(worstCaseSeconds({ attempts: 3, timeoutSeconds: 300, backoffMs })).toBe(1155);
  });

  it('counts a lock wait that never clears at its full bounded cost', () => {
    expect(
      worstCaseSeconds({
        attempts: 2,
        timeoutSeconds: 10,
        backoffMs: () => 0,
        lockPollMs: 500,
        maxLockWaitPolls: 4,
      })
    ).toBe(22);
  });
});
