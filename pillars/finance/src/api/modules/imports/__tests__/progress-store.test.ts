/**
 * Unit tests for the import progress store's idle-based TTL (#3619 / CF013).
 * The expiry must be a sliding window re-armed by activity, not a fixed
 * cliff from session creation, so a slow-but-active import never gets
 * reaped mid-flight while an abandoned session still gets cleaned up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearProgress,
  getProgress,
  setProgress,
  updateProgress,
  type ImportProgress,
} from '../progress-store.js';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

function makeProgress(overrides: Partial<ImportProgress> = {}): ImportProgress {
  return {
    sessionId: 'session-1',
    status: 'processing',
    currentStep: 'matching',
    totalTransactions: 10,
    processedCount: 0,
    currentBatch: [],
    errors: [],
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  clearProgress();
});

afterEach(() => {
  clearProgress();
  vi.useRealTimers();
});

describe('progress-store idle TTL', () => {
  it('expires a session after 5 minutes of no activity', () => {
    setProgress('session-1', makeProgress());
    vi.advanceTimersByTime(FIVE_MINUTES_MS + 1);
    expect(getProgress('session-1')).toBeNull();
  });

  it('re-arms the expiry on updateProgress, surviving past the original 5-minute cliff', () => {
    setProgress('session-1', makeProgress());

    vi.advanceTimersByTime(4 * 60 * 1000);
    updateProgress('session-1', { processedCount: 5 });

    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(getProgress('session-1')?.processedCount).toBe(5);

    vi.advanceTimersByTime(FIVE_MINUTES_MS + 1);
    expect(getProgress('session-1')).toBeNull();
  });

  it('delivers a terminal completed+result write even after the original TTL would have fired', () => {
    setProgress('session-1', makeProgress());

    vi.advanceTimersByTime(4 * 60 * 1000);
    updateProgress('session-1', { processedCount: 5 });

    vi.advanceTimersByTime(4 * 60 * 1000);
    const result: ImportProgress['result'] = {
      matched: [],
      uncertain: [],
      failed: [],
      skipped: [],
    };
    updateProgress('session-1', {
      status: 'completed',
      processedCount: 10,
      result,
    });

    const progress = getProgress('session-1');
    expect(progress?.status).toBe('completed');
    expect(progress?.result).toBeDefined();
  });

  it('does not re-arm expiry for an unknown session (no-op update)', () => {
    updateProgress('missing-session', { processedCount: 1 });
    expect(getProgress('missing-session')).toBeNull();
  });

  it('an untouched session still expires — TTL is idle-based, not infinite', () => {
    setProgress('session-1', makeProgress());
    setProgress('session-2', makeProgress({ sessionId: 'session-2' }));

    vi.advanceTimersByTime(4 * 60 * 1000);
    updateProgress('session-1', { processedCount: 5 });

    vi.advanceTimersByTime(FIVE_MINUTES_MS + 1);
    expect(getProgress('session-2')).toBeNull();
  });
});
