/**
 * Unit tests for the cron timer primitives: cron-driven delays with an
 * interval fallback, and the hopping `setTimeout` that survives a target
 * further out than one timer can express.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MAX_TIMEOUT_MS, resolveArmDelayMs, scheduleAt } from '../cron-timer.js';

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
