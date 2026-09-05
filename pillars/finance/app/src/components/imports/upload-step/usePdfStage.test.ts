/**
 * The PDF stage asks finance what the account already covers before planning
 * the import (POPS-2917), so the overlap guard in `planAnzPdfImport` runs on
 * the real span rather than being skipped.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../../store/importStore';
import { NO_BALANCE, NO_IMPORT_STATUS } from '../../../test-utils.js';
import { usePdfStage } from './usePdfStage';

import type { AccountCoverage, PdfUploadDecision } from '../pdf/anz-pdf-import';

const mockAccountsGet = vi.fn();
const mockReadAnzPdfUpload =
  vi.fn<
    (
      files: readonly File[],
      coverage: AccountCoverage,
      accountId: string
    ) => Promise<PdfUploadDecision>
  >();

vi.mock('../../../finance-api/index.js', () => ({
  accountsGet: (...args: unknown[]) => mockAccountsGet(...args),
}));

vi.mock('../pdf/anz-pdf-import', () => ({
  readAnzPdfUpload: (files: readonly File[], coverage: AccountCoverage, accountId: string) =>
    mockReadAnzPdfUpload(files, coverage, accountId),
}));

const ACCOUNT = {
  id: 'acc-1',
  name: 'Card',
  institutionId: null,
  kind: 'credit-card',
  currency: 'AUD',
  archivedAt: null,
  displayOrder: 0,
  entityId: null,
  entityDisplayName: null,
  entityDisplayNameStale: false,
  balance: NO_BALANCE,
  importStatus: NO_IMPORT_STATUS,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function accountResolvesWithSpan(span: { from: string; to: string } | null) {
  mockAccountsGet.mockResolvedValue({
    data: { data: { ...ACCOUNT, importStatus: { ...NO_IMPORT_STATUS, span } } },
    error: undefined,
  });
}

async function runOnce() {
  const setError = vi.fn();
  const setIsProcessing = vi.fn();
  const { result } = renderHook(() => usePdfStage(setError, setIsProcessing));
  await act(() => result.current.run([new File(['%PDF'], 'statement.pdf')]));
  return { setError, setIsProcessing };
}

function coveragePassed(): AccountCoverage {
  const call = mockReadAnzPdfUpload.mock.calls[0];
  if (call === undefined) throw new Error('readAnzPdfUpload was not called');
  return call[1];
}

beforeEach(() => {
  vi.clearAllMocks();
  useImportStore.getState().reset();
  useImportStore.getState().setAccount('acc-1', 'Card');
  mockReadAnzPdfUpload.mockResolvedValue({ kind: 'error', message: 'stop here' });
});

describe('usePdfStage coverage', () => {
  it("passes the account's transaction span as known coverage", async () => {
    accountResolvesWithSpan({ from: '2026-01-01', to: '2026-06-30' });

    await runOnce();

    expect(mockAccountsGet).toHaveBeenCalledWith({ path: { id: 'acc-1' } });
    expect(coveragePassed()).toEqual({
      known: true,
      interval: { from: '2026-01-01', to: '2026-06-30' },
    });
  });

  it('says coverage is known but empty for an account with no transactions', async () => {
    accountResolvesWithSpan(null);

    await runOnce();

    expect(coveragePassed()).toEqual({ known: true });
  });

  it('says coverage is unknown when the account cannot be read, rather than empty', async () => {
    mockAccountsGet.mockResolvedValue({
      data: undefined,
      error: { message: 'finance is down' },
      response: new Response(null, { status: 503 }),
    });

    const { setError } = await runOnce();

    expect(coveragePassed()).toEqual({ known: false });
    expect(setError).toHaveBeenLastCalledWith('stop here');
  });

  it('does not ask finance anything when no account is picked', async () => {
    useImportStore.getState().reset();

    const { setError } = await runOnce();

    expect(mockAccountsGet).not.toHaveBeenCalled();
    expect(mockReadAnzPdfUpload).not.toHaveBeenCalled();
    expect(setError).toHaveBeenLastCalledWith(expect.stringContaining('No account selected'));
  });
});
