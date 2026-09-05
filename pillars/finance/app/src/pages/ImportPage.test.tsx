import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { processMock, progressMock, accountsListMock, institutionsListMock } = vi.hoisted(() => ({
  processMock: vi.fn(),
  progressMock: vi.fn(),
  accountsListMock: vi.fn(),
  institutionsListMock: vi.fn(),
}));
vi.mock('../finance-api/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../finance-api/index.js')>()),
  importsProcessImport: (...args: unknown[]) => processMock(...args),
  importsGetImportProgress: (...args: unknown[]) => progressMock(...args),
  accountsList: (...args: unknown[]) => accountsListMock(...args),
  institutionsList: (...args: unknown[]) => institutionsListMock(...args),
}));

import {
  createMemoryPersistStorage,
  type MemoryPersistStorage,
} from '../store/import-persist.test-helpers';
import { clearPersistedImport } from '../store/import-store-lifecycle';
import {
  IMPORT_PERSIST_KEY,
  IMPORT_PERSIST_VERSION,
  partializeImportState,
  type PersistedImportState,
} from '../store/import-store-persistence';
import { useImportStore } from '../store/importStore';
import { NO_BALANCE, NO_IMPORT_STATUS, NO_TRANSACTION_COUNT } from '../test-utils.js';
import { ImportPage } from './ImportPage';

import type { ParsedTransaction } from '@pops/finance';

import type { Account } from './accounts/types';

const ANZ_EVERYDAY: Account = {
  id: 'acc-1',
  name: 'ANZ Everyday',
  institutionId: null,
  kind: 'checking',
  currency: 'AUD',
  archivedAt: null,
  displayOrder: 0,
  entityId: null,
  entityDisplayName: null,
  entityDisplayNameStale: false,
  balance: NO_BALANCE,
  importStatus: NO_IMPORT_STATUS,
  transactionCount: NO_TRANSACTION_COUNT,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let storage: MemoryPersistStorage<PersistedImportState>;

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

function seedSnapshot(overrides: Partial<PersistedImportState>): void {
  storage.setItem(IMPORT_PERSIST_KEY, {
    state: {
      ...partializeImportState(useImportStore.getState()),
      sourceFileNames: ['jan.csv'],
      headers: ['Date', 'Amount'],
      rows: [{ Date: '01/01/2026', Amount: '-10.00' }],
      ...overrides,
    },
    version: IMPORT_PERSIST_VERSION,
  });
}

function seedResumableAtStepTwo(): void {
  seedSnapshot({ currentStep: 2 });
}

// The exact state a refresh during step-3 processing leaves behind: parsed
// transactions without current processed results, so clampResumeStep demotes
// the persisted step to 3 (Process) — the step whose mount auto-starts a
// server-side processing run.
function seedProcessingInterruptedRun(): void {
  seedSnapshot({
    currentStep: 6,
    accountId: 'acc-amex',
    accountName: 'Amex',
    parsedTransactions: [makeParsed('a')],
    parsedTransactionsFingerprint: 'a',
  });
}

function renderImportPage(url = '/finance/import') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <ImportPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  accountsListMock.mockResolvedValue({
    data: {
      data: [ANZ_EVERYDAY],
      pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
    },
    error: undefined,
  });
  institutionsListMock.mockResolvedValue({ data: { data: [] }, error: undefined });
  useImportStore.getState().reset();
  storage = createMemoryPersistStorage();
  useImportStore.persist.setOptions({ storage });
});

describe('ImportPage', () => {
  it('never mounts the wizard while hydration or the resume prompt is pending', async () => {
    seedResumableAtStepTwo();

    renderImportPage();

    // Synchronously after mount the async rehydrate has not resolved: the
    // wizard must be absent — rendering it now would show (or reset to) step 1.
    expect(screen.queryByText('Upload CSV')).not.toBeInTheDocument();

    expect(await screen.findByText('Resume import?')).toBeInTheDocument();
    expect(screen.queryByText('Map Columns')).not.toBeInTheDocument();
    expect(screen.queryByText('Upload CSV')).not.toBeInTheDocument();
  });

  it('resume mounts the wizard at the restored step', async () => {
    seedResumableAtStepTwo();
    renderImportPage();
    await screen.findByText('Resume import?');

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

    expect(screen.queryByText('Resume import?')).not.toBeInTheDocument();
    expect(screen.getByText('Map Columns')).toBeInTheDocument();
    expect(useImportStore.getState().currentStep).toBe(2);
  });

  it('discard starts a fresh wizard at step 1', async () => {
    seedResumableAtStepTwo();
    renderImportPage();
    await screen.findByText('Resume import?');

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(screen.queryByText('Resume import?')).not.toBeInTheDocument();
    expect(screen.getByText('Upload CSV')).toBeInTheDocument();
    expect(useImportStore.getState().currentStep).toBe(1);
    expect(storage.dump()).toBeNull();
  });

  it('renders a fresh wizard directly when nothing is persisted', async () => {
    renderImportPage();

    expect(await screen.findByText('Upload CSV')).toBeInTheDocument();
    expect(screen.queryByText('Resume import?')).not.toBeInTheDocument();
  });

  it('a resume clamped to the processing step fires no processing while the prompt is open or on discard', async () => {
    seedProcessingInterruptedRun();
    renderImportPage();

    await screen.findByText('Resume import?');
    expect(useImportStore.getState().currentStep).toBe(3);
    expect(processMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(await screen.findByText('Upload CSV')).toBeInTheDocument();
    expect(processMock).not.toHaveBeenCalled();
    expect(storage.dump()).toBeNull();
  });

  it('restarts processing only after the user chooses Resume', async () => {
    seedProcessingInterruptedRun();
    processMock.mockReturnValue(new Promise(() => {}));
    renderImportPage();
    await screen.findByText('Resume import?');
    expect(processMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

    await waitFor(() => expect(processMock).toHaveBeenCalledTimes(1));
    expect(processMock).toHaveBeenCalledWith({
      body: {
        transactions: [expect.objectContaining({ checksum: 'a' })],
      },
    });
  });

  describe('?account= pre-scope (POPS-2875)', () => {
    it('pre-selects the named account in a fresh wizard', async () => {
      renderImportPage('/finance/import?account=acc-1');

      expect(await screen.findByText('Upload CSV')).toBeInTheDocument();
      await waitFor(() => expect(useImportStore.getState().accountId).toBe('acc-1'));
      expect(useImportStore.getState().accountName).toBe('ANZ Everyday');
    });

    it('leaves a resumed run’s own account alone', async () => {
      seedProcessingInterruptedRun();
      processMock.mockReturnValue(new Promise(() => {}));
      renderImportPage('/finance/import?account=acc-1');
      await screen.findByText('Resume import?');

      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

      await waitFor(() => expect(processMock).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(accountsListMock).toHaveBeenCalled());
      expect(useImportStore.getState().accountId).toBe('acc-amex');
      expect(useImportStore.getState().accountName).toBe('Amex');
    });

    it('stays out of a resumed run with no account yet', async () => {
      seedResumableAtStepTwo();
      renderImportPage('/finance/import?account=acc-1');
      await screen.findByText('Resume import?');

      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

      expect(screen.getByText('Map Columns')).toBeInTheDocument();
      await waitFor(() => expect(accountsListMock).toHaveBeenCalled());
      await new Promise((res) => setTimeout(res, 20));
      expect(useImportStore.getState().accountId).toBeNull();
    });

    it('applies once another tab clears the resumed run, since what is left is fresh', async () => {
      seedResumableAtStepTwo();
      renderImportPage('/finance/import?account=acc-1');
      await screen.findByText('Resume import?');
      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
      await waitFor(() => expect(accountsListMock).toHaveBeenCalled());
      expect(useImportStore.getState().accountId).toBeNull();

      clearPersistedImport(true);

      await waitFor(() => expect(useImportStore.getState().accountId).toBe('acc-1'));
      expect(useImportStore.getState().currentStep).toBe(1);
    });

    it('applies after a persisted run is discarded, since that starts fresh', async () => {
      seedProcessingInterruptedRun();
      renderImportPage('/finance/import?account=acc-1');
      await screen.findByText('Resume import?');

      fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

      await waitFor(() => expect(useImportStore.getState().accountId).toBe('acc-1'));
    });

    it('ignores an id the accounts list does not know', async () => {
      renderImportPage('/finance/import?account=acc-nope');

      expect(await screen.findByText('Upload CSV')).toBeInTheDocument();
      await waitFor(() => expect(accountsListMock).toHaveBeenCalled());
      await new Promise((res) => setTimeout(res, 20));
      expect(useImportStore.getState().accountId).toBeNull();
    });
  });
});
