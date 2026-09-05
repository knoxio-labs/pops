import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { processMock, progressMock } = vi.hoisted(() => ({
  processMock: vi.fn(),
  progressMock: vi.fn(),
}));
vi.mock('../../../finance-api/index.js', () => ({
  importsProcessImport: (...args: unknown[]) => processMock(...args),
  importsGetImportProgress: (...args: unknown[]) => progressMock(...args),
}));

import { FinanceApiError } from '../../../finance-api-helpers.js';
import { useImportStore } from '../../../store/importStore';
import { isDeadSessionError, recoverImportSession } from './session-recovery';

import type { ParsedTransaction } from '@pops/finance';

function makeParsed(checksum: string): ParsedTransaction {
  return {
    date: '2026-01-15',
    description: `TXN ${checksum}`,
    amount: -10,
    account: 'ING',
    rawRow: `{"checksum":"${checksum}"}`,
    checksum,
  };
}

function progressResponse(status: 'processing' | 'completed' | 'failed') {
  return {
    data: {
      sessionId: 'recovered-1',
      status,
      startedAt: '2026-07-13T00:00:00Z',
      totalTransactions: 1,
      processedCount: status === 'processing' ? 0 : 1,
      currentBatch: [],
      errors: [],
      currentStep: 'matching',
    },
    error: undefined,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useImportStore.getState().reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isDeadSessionError', () => {
  it('accepts FinanceApiError 404 and 412 only', () => {
    expect(isDeadSessionError(new FinanceApiError('gone', 404))).toBe(true);
    expect(isDeadSessionError(new FinanceApiError('expired', 412))).toBe(true);
    expect(isDeadSessionError(new FinanceApiError('bad', 400))).toBe(false);
    expect(isDeadSessionError(new FinanceApiError('boom', 500))).toBe(false);
    expect(isDeadSessionError(new FinanceApiError('offline', undefined))).toBe(false);
  });

  it('rejects untyped errors even when the message mentions 404', () => {
    expect(isDeadSessionError(new Error('404 Not Found'))).toBe(false);
  });
});

describe('recoverImportSession', () => {
  it('re-processes the persisted parsed transactions, polls to completion, and stores the new session id', async () => {
    vi.useFakeTimers();
    const parsed = makeParsed('a');
    useImportStore.getState().setDialectId('ING');
    useImportStore.getState().setParsedTransactions([parsed]);
    processMock.mockResolvedValue({ data: { sessionId: 'recovered-1' }, error: undefined });
    progressMock
      .mockResolvedValueOnce(progressResponse('processing'))
      .mockResolvedValueOnce(progressResponse('completed'));

    const recovery = recoverImportSession();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(recovery).resolves.toBe('recovered-1');
    expect(processMock).toHaveBeenCalledExactlyOnceWith({
      body: { transactions: [parsed] },
    });
    expect(progressMock).toHaveBeenCalledTimes(2);
    expect(useImportStore.getState().processSessionId).toBe('recovered-1');
  });

  it('rejects when reprocessing fails server-side', async () => {
    useImportStore.getState().setParsedTransactions([makeParsed('a')]);
    processMock.mockResolvedValue({ data: { sessionId: 'recovered-1' }, error: undefined });
    progressMock.mockResolvedValue(progressResponse('failed'));

    await expect(recoverImportSession()).rejects.toThrow('Reprocessing the import failed');
  });

  it('rejects after more than ten consecutive unknown-session polls', async () => {
    vi.useFakeTimers();
    useImportStore.getState().setParsedTransactions([makeParsed('a')]);
    processMock.mockResolvedValue({ data: { sessionId: 'recovered-1' }, error: undefined });
    progressMock.mockResolvedValue({ data: null, error: undefined });

    const recovery = recoverImportSession();
    const expectation = expect(recovery).rejects.toThrow(
      'Recovered import session disappeared while reprocessing'
    );
    for (let i = 0; i < 11; i += 1) {
      await vi.advanceTimersByTimeAsync(1000);
    }

    await expectation;
    expect(progressMock).toHaveBeenCalledTimes(11);
  });

  it('rejects without a POST when there are no parsed transactions to replay', async () => {
    await expect(recoverImportSession()).rejects.toThrow('No parsed transactions available');
    expect(processMock).not.toHaveBeenCalled();
  });

  it('coalesces concurrent recoveries from independent callers into one process POST', async () => {
    useImportStore.getState().setParsedTransactions([makeParsed('a')]);
    processMock.mockResolvedValue({ data: { sessionId: 'recovered-1' }, error: undefined });
    progressMock.mockResolvedValue(progressResponse('completed'));

    const first = recoverImportSession();
    const second = recoverImportSession();

    expect(second).toBe(first);
    await expect(first).resolves.toBe('recovered-1');
    await expect(second).resolves.toBe('recovered-1');
    expect(processMock).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh recovery once the previous one has settled', async () => {
    useImportStore.getState().setParsedTransactions([makeParsed('a')]);
    processMock.mockResolvedValue({ data: { sessionId: 'recovered-1' }, error: undefined });
    progressMock.mockResolvedValue(progressResponse('completed'));

    await expect(recoverImportSession()).resolves.toBe('recovered-1');
    await expect(recoverImportSession()).resolves.toBe('recovered-1');

    expect(processMock).toHaveBeenCalledTimes(2);
  });
});
