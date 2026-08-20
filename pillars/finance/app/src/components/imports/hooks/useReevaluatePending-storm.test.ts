/**
 * Regression tests for accepting several suggestions in quick succession after
 * the server's import session has gone.
 *
 * Reported 2026-08-20: a deploy mid-import restarted the pillar, wiping the
 * in-memory, process-local progress store. The operator accepted five or six
 * suggestions without noticing, and the console filled with one 404 followed by
 * a run of 412s. With nothing in the UI saying a re-evaluation was in flight, it
 * read as the import having silently broken, and the import was abandoned.
 *
 * The 412 is `sessionNotReady`: recovery re-runs `POST /imports/process` and
 * publishes the new session id immediately, but that session is `processing`
 * until the reprocess finishes. Every accept in that window fired a request that
 * could only fail, and each failure was then misread as a *second* dead session,
 * starting the cycle again.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { reevaluateMock, processMock, progressMock } = vi.hoisted(() => ({
  reevaluateMock: vi.fn(),
  processMock: vi.fn(),
  progressMock: vi.fn(),
}));
vi.mock('../../../finance-api/index.js', () => ({
  importsReevaluateWithPendingRules: (...args: unknown[]) => reevaluateMock(...args),
  importsProcessImport: (...args: unknown[]) => processMock(...args),
  importsGetImportProgress: (...args: unknown[]) => progressMock(...args),
}));

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

import { useImportStore } from '../../../store/importStore';
import { useReevaluatePending } from './useReevaluatePending';

import type { ParsedTransaction } from '@pops/finance';

function makeParsed(checksum: string): ParsedTransaction {
  return {
    date: '2026-01-15',
    description: `TXN ${checksum}`,
    amount: -10,
    account: 'ANZ Credit Card',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
  };
}

function deadResponse(status: number) {
  return { data: undefined, error: { message: 'session gone' }, response: { status } };
}

function reevaluateSuccess() {
  return {
    data: { result: { matched: [], uncertain: [], failed: [], skipped: [] }, affectedCount: 1 },
    error: undefined,
  };
}

/** A session the server has forgotten, recoverable from persisted parsed rows. */
function seedDeadSession(): void {
  useImportStore.getState().setParsedTransactions([makeParsed('a')]);
  useImportStore.getState().setProcessSessionId('dead-session');
  processMock.mockResolvedValue({ data: { sessionId: 'fresh-id' }, error: undefined });
  progressMock.mockResolvedValue({
    data: {
      sessionId: 'fresh-id',
      status: 'completed',
      startedAt: '2026-08-20T00:00:00Z',
      totalTransactions: 1,
      processedCount: 1,
      currentBatch: [],
      errors: [],
      currentStep: 'matching',
    },
    error: undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useImportStore.getState().reset();
});

describe('rapid accepts against a dead session', () => {
  it('reprocesses once for six concurrent accepts rather than once each', async () => {
    seedDeadSession();
    reevaluateMock.mockImplementation((args: { body: { sessionId: string } }) =>
      Promise.resolve(args.body.sessionId === 'fresh-id' ? reevaluateSuccess() : deadResponse(404))
    );
    const { result } = renderHook(() => useReevaluatePending());

    const outcomes = await Promise.all(
      Array.from({ length: 6 }, () => result.current.runReevaluate())
    );

    expect(outcomes.every((o) => o !== null)).toBe(true);
    expect(processMock).toHaveBeenCalledTimes(1);
  });

  it('does not fire doomed requests at a session that is still being recovered', async () => {
    // The storm: accepts made while the reprocess is in flight used to each
    // send a request against the not-yet-ready session and collect a 412.
    seedDeadSession();
    reevaluateMock.mockImplementation((args: { body: { sessionId: string } }) =>
      Promise.resolve(args.body.sessionId === 'fresh-id' ? reevaluateSuccess() : deadResponse(404))
    );
    const { result } = renderHook(() => useReevaluatePending());

    const first = result.current.runReevaluate();
    // Everything after the first accept should wait for the recovery rather
    // than address the dead/not-ready session itself.
    const rest = Array.from({ length: 5 }, () => result.current.runReevaluate());
    await Promise.all([first, ...rest]);

    const againstDead = reevaluateMock.mock.calls.filter(
      (call) => (call[0] as { body: { sessionId: string } }).body.sessionId !== 'fresh-id'
    );
    expect(againstDead).toHaveLength(1);
  });

  it('tells the user once that the session expired, not once per accept', async () => {
    seedDeadSession();
    reevaluateMock.mockImplementation((args: { body: { sessionId: string } }) =>
      Promise.resolve(args.body.sessionId === 'fresh-id' ? reevaluateSuccess() : deadResponse(404))
    );
    const { result } = renderHook(() => useReevaluatePending());

    await Promise.all(Array.from({ length: 6 }, () => result.current.runReevaluate()));

    expect(toastMock.info).toHaveBeenCalledTimes(1);
  });

  it('surfaces no error toast when recovery ultimately succeeds', async () => {
    seedDeadSession();
    reevaluateMock.mockImplementation((args: { body: { sessionId: string } }) =>
      Promise.resolve(args.body.sessionId === 'fresh-id' ? reevaluateSuccess() : deadResponse(412))
    );
    const { result } = renderHook(() => useReevaluatePending());

    await Promise.all(Array.from({ length: 6 }, () => result.current.runReevaluate()));

    expect(toastMock.error).not.toHaveBeenCalled();
  });
});

describe('re-evaluation is visible while it runs', () => {
  it('reports isReevaluating for the duration of a run', async () => {
    useImportStore.getState().setProcessSessionId('live-session');
    let release: (v: unknown) => void = () => {};
    reevaluateMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const { result } = renderHook(() => useReevaluatePending());

    expect(result.current.isReevaluating).toBe(false);
    const run = result.current.runReevaluate();
    await waitFor(() => expect(result.current.isReevaluating).toBe(true));

    release(reevaluateSuccess());
    await run;
    await waitFor(() => expect(result.current.isReevaluating).toBe(false));
  });

  it('stays true until the last of several overlapping runs finishes', async () => {
    useImportStore.getState().setProcessSessionId('live-session');
    const releases: Array<(v: unknown) => void> = [];
    reevaluateMock.mockImplementation(() => new Promise((resolve) => releases.push(resolve)));
    const { result } = renderHook(() => useReevaluatePending());

    const runs = [result.current.runReevaluate(), result.current.runReevaluate()];
    await waitFor(() => expect(result.current.isReevaluating).toBe(true));

    releases[0]?.(reevaluateSuccess());
    await waitFor(() => expect(releases).toHaveLength(2));
    expect(result.current.isReevaluating).toBe(true);

    releases[1]?.(reevaluateSuccess());
    await Promise.all(runs);
    await waitFor(() => expect(result.current.isReevaluating).toBe(false));
  });

  it('clears isReevaluating when the run fails', async () => {
    useImportStore.getState().setProcessSessionId('live-session');
    reevaluateMock.mockResolvedValue(deadResponse(500));
    const { result } = renderHook(() => useReevaluatePending());

    await result.current.runReevaluate();

    await waitFor(() => expect(result.current.isReevaluating).toBe(false));
    expect(toastMock.error).toHaveBeenCalled();
  });
});
