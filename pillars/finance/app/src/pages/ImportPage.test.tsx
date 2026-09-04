import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { processMock, progressMock } = vi.hoisted(() => ({
  processMock: vi.fn(),
  progressMock: vi.fn(),
}));
vi.mock('../finance-api/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../finance-api/index.js')>()),
  importsProcessImport: (...args: unknown[]) => processMock(...args),
  importsGetImportProgress: (...args: unknown[]) => progressMock(...args),
}));

import {
  createMemoryPersistStorage,
  type MemoryPersistStorage,
} from '../store/import-persist.test-helpers';
import {
  IMPORT_PERSIST_KEY,
  IMPORT_PERSIST_VERSION,
  partializeImportState,
  type PersistedImportState,
} from '../store/import-store-persistence';
import { useImportStore } from '../store/importStore';
import { ImportPage } from './ImportPage';

import type { ParsedTransaction } from '@pops/finance';

let storage: MemoryPersistStorage<PersistedImportState>;

function makeParsed(checksum: string): ParsedTransaction {
  return {
    date: '2026-01-15',
    description: `TXN ${checksum}`,
    amount: -10,
    account: 'Amex',
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

function renderImportPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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
        account: 'Amex',
      },
    });
  });
});
