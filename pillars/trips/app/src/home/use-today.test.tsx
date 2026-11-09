import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { toISODate } from '@pops/date';

import { useToday } from './use-today';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useToday', () => {
  it('changes on viewer-local midnight and schedules the following midnight', () => {
    const evening = new Date(2026, 10, 9, 23, 59, 59, 750);
    vi.setSystemTime(evening);
    const { result } = renderHook(useToday);
    expect(result.current).toBe(toISODate(evening));
    act(() => vi.advanceTimersByTime(249));
    expect(result.current).toBe(toISODate(evening));
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(toISODate(new Date(2026, 10, 10)));
    const followingMidnight = new Date(2026, 10, 11);
    act(() => vi.advanceTimersByTime(followingMidnight.getTime() - Date.now()));
    expect(result.current).toBe(toISODate(followingMidnight));
  });

  it('refreshes after a suspended tab resumes without waiting for its old timer', () => {
    vi.setSystemTime(new Date(2026, 10, 9, 12));
    const { result } = renderHook(useToday);
    const resumed = new Date(2026, 10, 12, 9);
    act(() => {
      vi.setSystemTime(resumed);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(toISODate(resumed));
  });

  it('removes its pending timer and visibility listener when unmounted', () => {
    vi.setSystemTime(new Date(2026, 10, 9, 12));
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const baseline = vi.getTimerCount();
    const { unmount } = renderHook(useToday);
    expect(vi.getTimerCount()).toBe(baseline + 1);
    unmount();
    expect(vi.getTimerCount()).toBe(baseline);
    expect(removeListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    removeListener.mockRestore();
  });
});
