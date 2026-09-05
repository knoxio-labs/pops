import { renderHook } from '@testing-library/react';
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

import { useImportStore, type ChangeSet } from '../../../store/importStore';
import { useReevaluatePending } from './useReevaluatePending';

import type { ParsedTransaction } from '@pops/finance';

const ERROR_TOAST = 'Failed to re-evaluate transactions against updated rules';
const EXPIRED_TOAST = 'Import session expired — reprocessing transactions…';

const pendingChangeSet: ChangeSet = {
  source: 'correction-proposal',
  reason: 'user approved rule',
  ops: [
    {
      op: 'add',
      data: { descriptionPattern: 'COLES', matchType: 'exact', tags: [], transactionType: null },
    },
  ],
};

const restPendingChangeSets = [
  {
    changeSet: {
      source: 'correction-proposal',
      reason: 'user approved rule',
      ops: [{ op: 'add', data: { descriptionPattern: 'COLES', matchType: 'exact', tags: [] } }],
    },
  },
];

function makeParsed(checksum: string): ParsedTransaction {
  return {
    date: '2026-01-15',
    description: `TXN ${checksum}`,
    amount: -10,
    dialectAccountLabel: 'Amex',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
  };
}

function deadResponse(status: number) {
  return { data: undefined, error: { message: 'session not found' }, response: { status } };
}

function reevaluateSuccess(affectedCount: number) {
  return {
    data: {
      result: { matched: [], uncertain: [], failed: [], skipped: [] },
      affectedCount,
    },
    error: undefined,
  };
}

function seedRecoverableSession(): void {
  // Order matters: setParsedTransactions cascades downstreamReset, which nulls the session id.
  useImportStore.getState().setParsedTransactions([makeParsed('a')]);
  useImportStore.getState().setProcessSessionId('dead-session');
  processMock.mockResolvedValue({ data: { sessionId: 'fresh-id' }, error: undefined });
  progressMock.mockResolvedValue({
    data: {
      sessionId: 'fresh-id',
      status: 'completed',
      startedAt: '2026-07-13T00:00:00Z',
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

describe('useReevaluatePending', () => {
  it('returns null without calling the API when no session id exists', async () => {
    const { result } = renderHook(() => useReevaluatePending());

    expect(await result.current.runReevaluate()).toBeNull();
    expect(reevaluateMock).not.toHaveBeenCalled();
  });

  it('sends the store pending change sets converted to the REST shape in the request body', async () => {
    useImportStore.getState().setProcessSessionId('live-session');
    useImportStore
      .getState()
      .addPendingChangeSet({ changeSet: pendingChangeSet, source: 'correction-proposal' });
    reevaluateMock.mockResolvedValue(reevaluateSuccess(1));

    const { result } = renderHook(() => useReevaluatePending());
    const outcome = await result.current.runReevaluate();

    expect(outcome?.affectedCount).toBe(1);
    // Exact body match: `transactionType: null` must be normalized away by
    // toRestCorrectionChangeSet — sending the raw store ChangeSet (or an empty
    // pendingChangeSets list) must fail this assertion.
    expect(reevaluateMock).toHaveBeenCalledExactlyOnceWith({
      body: {
        sessionId: 'live-session',
        minConfidence: 0.7,
        pendingChangeSets: restPendingChangeSets,
      },
    });
  });

  it.each([404, 412])(
    'recovers a dead session (%i), retries once with the new id, and returns the result',
    async (status) => {
      seedRecoverableSession();
      useImportStore
        .getState()
        .addPendingChangeSet({ changeSet: pendingChangeSet, source: 'correction-proposal' });
      reevaluateMock
        .mockResolvedValueOnce(deadResponse(status))
        .mockResolvedValueOnce(reevaluateSuccess(2));

      const { result } = renderHook(() => useReevaluatePending());
      const outcome = await result.current.runReevaluate();

      expect(outcome?.affectedCount).toBe(2);
      expect(reevaluateMock).toHaveBeenCalledTimes(2);
      expect(reevaluateMock).toHaveBeenLastCalledWith({
        body: {
          sessionId: 'fresh-id',
          minConfidence: 0.7,
          pendingChangeSets: restPendingChangeSets,
        },
      });
      expect(processMock).toHaveBeenCalledTimes(1);
      expect(toastMock.info).toHaveBeenCalledWith(EXPIRED_TOAST);
      expect(toastMock.error).not.toHaveBeenCalled();
      expect(useImportStore.getState().processSessionId).toBe('fresh-id');
    }
  );

  it('coalesces concurrent dead-session recoveries across hook instances into one re-process', async () => {
    seedRecoverableSession();
    reevaluateMock.mockImplementation((input: { body: { sessionId: string } }) =>
      Promise.resolve(
        input.body.sessionId === 'fresh-id' ? reevaluateSuccess(1) : deadResponse(404)
      )
    );

    const first = renderHook(() => useReevaluatePending());
    const second = renderHook(() => useReevaluatePending());
    const [a, b] = await Promise.all([
      first.result.current.runReevaluate(),
      second.result.current.runReevaluate(),
    ]);

    expect(a?.affectedCount).toBe(1);
    expect(b?.affectedCount).toBe(1);
    expect(processMock).toHaveBeenCalledTimes(1);
    // Three, not four: runs are serialized, so the second caller does not
    // repeat the first's doomed attempt at the dead session. One dead attempt,
    // one retry against the recovered session, one queued run — and a queued
    // run reads the current pending change sets, so it covers both callers.
    expect(reevaluateMock).toHaveBeenCalledTimes(3);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it.each([400, 500])('never recovers on a %i: one error toast, null result', async (status) => {
    seedRecoverableSession();
    reevaluateMock.mockResolvedValue(deadResponse(status));

    const { result } = renderHook(() => useReevaluatePending());

    expect(await result.current.runReevaluate()).toBeNull();
    expect(reevaluateMock).toHaveBeenCalledTimes(1);
    expect(processMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(ERROR_TOAST);
  });

  it('does not misfire recovery on an untyped error whose message mentions 404', async () => {
    seedRecoverableSession();
    reevaluateMock.mockRejectedValue(new Error('404 Not Found'));

    const { result } = renderHook(() => useReevaluatePending());

    expect(await result.current.runReevaluate()).toBeNull();
    expect(processMock).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(ERROR_TOAST);
  });

  it('surfaces a recovery failure as the error toast and null', async () => {
    seedRecoverableSession();
    reevaluateMock.mockResolvedValue(deadResponse(404));
    processMock.mockResolvedValue({
      data: undefined,
      error: { message: 'boom' },
      response: { status: 500 },
    });

    const { result } = renderHook(() => useReevaluatePending());

    expect(await result.current.runReevaluate()).toBeNull();
    expect(reevaluateMock).toHaveBeenCalledTimes(1);
    expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(ERROR_TOAST);
  });

  it('gives up after a single retry when the recovered session is dead again — no loop', async () => {
    seedRecoverableSession();
    reevaluateMock.mockResolvedValue(deadResponse(404));

    const { result } = renderHook(() => useReevaluatePending());

    expect(await result.current.runReevaluate()).toBeNull();
    expect(reevaluateMock).toHaveBeenCalledTimes(2);
    expect(processMock).toHaveBeenCalledTimes(1);
    expect(toastMock.error).toHaveBeenCalledExactlyOnceWith(ERROR_TOAST);
  });
});
