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

import { describe, expect, it, vi } from 'vitest';

import { retryWithLockClear } from '../playwright-install-retry.mjs';

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
