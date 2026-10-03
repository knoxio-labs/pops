/**
 * Unit tests for the cron timer primitives: cron-driven delays with an
 * interval fallback, and the hopping `setTimeout` that survives a target
 * further out than one timer can express.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { isRunOverdue, MAX_TIMEOUT_MS, resolveArmDelayMs, scheduleAt } from '../cron-timer.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('resolveArmDelayMs', () => {
  it('measures the delay to the next cron occurrence', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T10:00:00Z'));
    const delay = resolveArmDelayMs('0 * * * *', 60_000);
    const next = new Date(Date.now() + delay);
    expect(next.getMinutes()).toBe(0);
    expect(delay).toBeGreaterThan(0);
    expect(delay).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('falls back to the interval on an unparseable expression', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveArmDelayMs('every third blue moon', 12_345)).toBe(12_345);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('falls back to the interval on a blank expression rather than reading it as every-minute', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveArmDelayMs('', 777)).toBe(777);
    expect(resolveArmDelayMs('   ', 777)).toBe(777);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never returns a negative delay', () => {
    expect(resolveArmDelayMs('* * * * *', 1_000)).toBeGreaterThanOrEqual(0);
  });
});

describe('scheduleAt', () => {
  it('runs the callback once the target is reached', async () => {
    vi.useFakeTimers();
    const onDue = vi.fn();
    scheduleAt(Date.now() + 5_000, onDue);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(onDue).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onDue).toHaveBeenCalledOnce();
  });

  it('hops rather than firing early when the target exceeds the timeout ceiling', async () => {
    vi.useFakeTimers();
    const onDue = vi.fn();
    const target = Date.now() + MAX_TIMEOUT_MS * 2 + 5_000;
    scheduleAt(target, onDue);

    await vi.advanceTimersByTimeAsync(MAX_TIMEOUT_MS);
    expect(onDue).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(MAX_TIMEOUT_MS);
    expect(onDue).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(onDue).toHaveBeenCalledOnce();
  });

  it('cancel stops a run pending across a hop', async () => {
    vi.useFakeTimers();
    const onDue = vi.fn();
    const run = scheduleAt(Date.now() + MAX_TIMEOUT_MS + 5_000, onDue);

    await vi.advanceTimersByTimeAsync(MAX_TIMEOUT_MS);
    run.cancel();
    await vi.advanceTimersByTimeAsync(MAX_TIMEOUT_MS);
    expect(onDue).not.toHaveBeenCalled();
  });

  it('fires immediately for a target already in the past', async () => {
    vi.useFakeTimers();
    const onDue = vi.fn();
    scheduleAt(Date.now() - 10_000, onDue);
    await vi.advanceTimersByTimeAsync(0);
    expect(onDue).toHaveBeenCalledOnce();
  });
});

describe('isRunOverdue', () => {
  /** Local-time constructor: the cron is evaluated in the process timezone. */
  const local = (hour: number, minute = 0, day = 28): Date => new Date(2026, 7, day, hour, minute);

  it('is overdue when nothing has ever run', () => {
    expect(isRunOverdue('0 3 * * *', 60_000, null)).toBe(true);
  });

  it('is not overdue when the last run served the most recent occurrence', () => {
    vi.useFakeTimers();
    vi.setSystemTime(local(10));
    expect(isRunOverdue('0 3 * * *', 60_000, local(3, 0).getTime() + 1_000)).toBe(false);
    expect(isRunOverdue('0 3 * * *', 60_000, local(9, 30).getTime())).toBe(false);
  });

  it('is overdue when an occurrence passed after the last run', () => {
    vi.useFakeTimers();
    vi.setSystemTime(local(10));
    expect(isRunOverdue('0 3 * * *', 60_000, local(22, 0, 27).getTime())).toBe(true);
    expect(isRunOverdue('0 3 * * *', 60_000, local(2, 30).getTime())).toBe(true);
  });

  it('counts a run stamped just ahead of its occurrence as having served it', () => {
    vi.useFakeTimers();
    vi.setSystemTime(local(10));
    expect(isRunOverdue('0 3 * * *', 60_000, local(3, 0).getTime() - 40)).toBe(false);
  });

  it('judges a blank or unparseable expression against the fallback interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T10:00:00Z'));
    const now = Date.now();
    for (const expression of ['', '   ', 'every third blue moon']) {
      expect(isRunOverdue(expression, 60_000, now - 59_999)).toBe(false);
      expect(isRunOverdue(expression, 60_000, now - 60_000)).toBe(true);
    }
  });
});
