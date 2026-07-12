import { act, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

import {
  createMemoryPersistStorage,
  type MemoryPersistStorage,
} from '../../../store/import-persist.test-helpers';
import {
  IMPORT_PERSIST_KEY,
  IMPORT_PERSIST_VERSION,
  partializeImportState,
  type PersistedImportState,
} from '../../../store/import-store-persistence';
import { useImportStore } from '../../../store/importStore';
import { useImportResume } from './useImportResume';

import type { CommitResult, ParsedTransaction } from '@pops/finance';

const CHANNEL_NAME = 'pops-finance-import';

type MessageListener = (event: MessageEvent) => void;
const channelRegistry = new Map<string, Set<FakeBroadcastChannel>>();

class FakeBroadcastChannel {
  onmessage: MessageListener | null = null;
  constructor(readonly name: string) {
    const peers = channelRegistry.get(name) ?? new Set();
    peers.add(this);
    channelRegistry.set(name, peers);
  }
  postMessage(data: unknown): void {
    for (const peer of channelRegistry.get(this.name) ?? []) {
      if (peer === this) continue;
      queueMicrotask(() => peer.onmessage?.(new MessageEvent('message', { data })));
    }
  }
  close(): void {
    channelRegistry.get(this.name)?.delete(this);
  }
}

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

function makeCommitResult(): CommitResult {
  return {
    entitiesCreated: 0,
    rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
    tagRulesApplied: 0,
    transactionsImported: 1,
    transactionsFailed: 0,
    failedDetails: [],
    retroactiveReclassifications: 0,
  };
}

let storage: MemoryPersistStorage<PersistedImportState>;

function seedStorage(overrides: Partial<PersistedImportState>): void {
  storage.setItem(IMPORT_PERSIST_KEY, {
    state: { ...partializeImportState(useImportStore.getState()), ...overrides },
    version: IMPORT_PERSIST_VERSION,
  });
}

function seedResumableAtStepSix(): void {
  seedStorage({
    currentStep: 6,
    sourceFileName: 'jan.csv',
    headers: ['A'],
    rows: [{ A: '1' }],
    parsedTransactions: [makeParsed('a')],
    parsedTransactionsFingerprint: 'a',
  });
}

function listenForClears(): unknown[] {
  const received: unknown[] = [];
  const observer = new FakeBroadcastChannel(CHANNEL_NAME);
  observer.onmessage = (event) => received.push(event.data);
  return received;
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  useImportStore.getState().reset();
  storage = createMemoryPersistStorage();
  useImportStore.persist.setOptions({ storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  channelRegistry.clear();
});

describe('useImportResume', () => {
  it('starts pending, then resolves ready with a normalized store when nothing is persisted', async () => {
    const { result } = renderHook(() => useImportResume());

    expect(result.current.status).toBe('pending');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(useImportStore.getState().currentStep).toBe(1);
  });

  it('prompts for a resumable snapshot with the step already clamped', async () => {
    // Step 6 persisted, but no processed results — prerequisites only cover step 3.
    seedResumableAtStepSix();

    const { result } = renderHook(() => useImportResume());

    await waitFor(() => expect(result.current.status).toBe('prompt'));
    expect(useImportStore.getState().currentStep).toBe(3);
    expect(useImportStore.getState().sourceFileName).toBe('jan.csv');
  });

  it('discard resets the store, clears storage, and broadcasts', async () => {
    seedResumableAtStepSix();
    const received = listenForClears();
    const { result } = renderHook(() => useImportResume());
    await waitFor(() => expect(result.current.status).toBe('prompt'));

    act(() => result.current.discard());

    expect(result.current.status).toBe('ready');
    expect(useImportStore.getState().currentStep).toBe(1);
    expect(useImportStore.getState().rows).toEqual([]);
    expect(storage.dump()).toBeNull();
    await waitFor(() => expect(received).toEqual(['cleared']));
  });

  it('keeps live in-memory state on same-session remount: ready immediately, no rehydrate, no prompt', async () => {
    useImportStore.getState().setRows([{ A: '1' }]);
    useImportStore.getState().goToStep(4);
    seedStorage({ currentStep: 2, rows: [{ A: 'stale' }], headers: ['A'] });
    const rehydrateSpy = vi.spyOn(useImportStore.persist, 'rehydrate');

    const { result } = renderHook(() => useImportResume());

    expect(result.current.status).toBe('ready');
    expect(rehydrateSpy).not.toHaveBeenCalled();
    expect(useImportStore.getState().currentStep).toBe(4);
    await flushMicrotasks();
    expect(result.current.status).toBe('ready');
  });

  it('silently clears a committed leftover snapshot without broadcasting', async () => {
    seedStorage({ currentStep: 8, rows: [{ A: '1' }], commitResult: makeCommitResult() });
    const received = listenForClears();

    const { result } = renderHook(() => useImportResume());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(useImportStore.getState().currentStep).toBe(1);
    expect(storage.dump()).toBeNull();
    await flushMicrotasks();
    expect(received).toEqual([]);
  });

  it('resets a resumable wizard when another tab broadcasts a clear', async () => {
    useImportStore.getState().setRows([{ A: '1' }]);
    useImportStore.getState().goToStep(4);
    const { result } = renderHook(() => useImportResume());
    expect(result.current.status).toBe('ready');

    const otherTab = new FakeBroadcastChannel(CHANNEL_NAME);
    await act(async () => {
      otherTab.postMessage('cleared');
      await Promise.resolve();
    });

    expect(useImportStore.getState().currentStep).toBe(1);
    expect(toastMock.info).toHaveBeenCalledWith(
      'This import was completed or discarded in another tab.'
    );
  });

  it('ignores a clear broadcast when nothing resumable is in memory', async () => {
    const { result } = renderHook(() => useImportResume());
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const otherTab = new FakeBroadcastChannel(CHANNEL_NAME);
    await act(async () => {
      otherTab.postMessage('cleared');
      await Promise.resolve();
    });

    expect(toastMock.info).not.toHaveBeenCalled();
  });

  it('survives a StrictMode double-mount and still prompts at the clamped step', async () => {
    seedResumableAtStepSix();
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;

    const { result } = renderHook(() => useImportResume(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('prompt'));
    expect(useImportStore.getState().currentStep).toBe(3);
  });
});
