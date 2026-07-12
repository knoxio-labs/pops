import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMemoryPersistStorage,
  type MemoryPersistStorage,
} from './import-persist.test-helpers';
import {
  IMPORT_PERSIST_KEY,
  IMPORT_PERSIST_VERSION,
  partializeImportState,
  type PersistedImportState,
} from './import-store-persistence';
import { useImportStore } from './importStore';

import type { StorageValue } from 'zustand/middleware';

import type { ParsedTransaction } from '@pops/finance';

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

function makeSnapshot(overrides: Partial<PersistedImportState>): PersistedImportState {
  return { ...partializeImportState(useImportStore.getState()), ...overrides };
}

function seed(
  storage: MemoryPersistStorage<PersistedImportState>,
  state: PersistedImportState,
  version = IMPORT_PERSIST_VERSION
): void {
  storage.setItem(IMPORT_PERSIST_KEY, { state, version });
}

function dumped(
  storage: MemoryPersistStorage<PersistedImportState>
): StorageValue<PersistedImportState> {
  const record = storage.dump();
  if (!record) throw new Error('expected a persisted record');
  return record;
}

let storage: MemoryPersistStorage<PersistedImportState>;

beforeEach(() => {
  useImportStore.getState().reset();
  storage = createMemoryPersistStorage();
  useImportStore.persist.setOptions({ storage });
});

describe('importStore persistence', () => {
  it('rehydrates a persisted snapshot with file left null', async () => {
    seed(
      storage,
      makeSnapshot({
        currentStep: 4,
        sourceFileName: 'jan.csv',
        headers: ['A'],
        rows: [{ A: '1' }],
        parsedTransactions: [makeParsed('a')],
        parsedTransactionsFingerprint: 'a',
        processSessionId: 'session-1',
      })
    );

    await useImportStore.persist.rehydrate();

    const state = useImportStore.getState();
    expect(state.currentStep).toBe(4);
    expect(state.sourceFileName).toBe('jan.csv');
    expect(state.rows).toEqual([{ A: '1' }]);
    expect(state.parsedTransactions).toEqual([makeParsed('a')]);
    expect(state.processSessionId).toBe('session-1');
    expect(state.file).toBeNull();
  });

  it('discards a snapshot with a mismatched version', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    seed(storage, makeSnapshot({ currentStep: 4, rows: [{ A: '1' }] }), 0);

    await useImportStore.persist.rehydrate();

    expect(useImportStore.getState().currentStep).toBe(1);
    expect(useImportStore.getState().rows).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('writes through to storage on every store update', () => {
    useImportStore.getState().setParsedTransactions([makeParsed('a'), makeParsed('b')]);

    const record = dumped(storage);
    expect(record.version).toBe(IMPORT_PERSIST_VERSION);
    expect(record.state.parsedTransactions).toHaveLength(2);
    expect(record.state.parsedTransactionsFingerprint).toBe('a|b');
    expect('file' in record.state).toBe(false);
  });

  it('persists, dedupes, and rehydrates manuallyResolvedChecksums', async () => {
    useImportStore.getState().markChecksumsResolved(['a', 'b']);
    useImportStore.getState().markChecksumsResolved(['b', 'c']);

    expect(useImportStore.getState().manuallyResolvedChecksums).toEqual(['a', 'b', 'c']);
    const record = dumped(storage);
    expect(record.state.manuallyResolvedChecksums).toEqual(['a', 'b', 'c']);

    useImportStore.getState().reset();
    seed(storage, { ...record.state, currentStep: 4, rows: [{ A: '1' }] });
    await useImportStore.persist.rehydrate();

    expect(useImportStore.getState().manuallyResolvedChecksums).toEqual(['a', 'b', 'c']);
  });

  it('clearStorage removes the persisted record entirely', () => {
    useImportStore.getState().setRows([{ A: '1' }]);
    expect(storage.dump()).not.toBeNull();

    useImportStore.persist.clearStorage();

    expect(storage.dump()).toBeNull();
  });

  it('a new file cascades downstreamReset over manuallyResolvedChecksums', () => {
    useImportStore.getState().markChecksumsResolved(['a']);

    useImportStore.getState().setFile(new File(['x'], 'new.csv', { lastModified: 1 }));

    expect(useImportStore.getState().manuallyResolvedChecksums).toEqual([]);
  });

  it('setFile records sourceFileName in both the same-file and cascade branches', () => {
    const first = new File(['x'], 'jan.csv', { lastModified: 42 });
    useImportStore.getState().setFile(first);
    expect(useImportStore.getState().sourceFileName).toBe('jan.csv');

    useImportStore.getState().setRows([{ A: '1' }]);
    useImportStore.getState().setFile(new File(['x'], 'jan.csv', { lastModified: 42 }));
    expect(useImportStore.getState().sourceFileName).toBe('jan.csv');
    expect(useImportStore.getState().rows).toEqual([{ A: '1' }]);

    useImportStore.getState().setFile(new File(['x'], 'feb.csv', { lastModified: 43 }));
    expect(useImportStore.getState().sourceFileName).toBe('feb.csv');
    expect(useImportStore.getState().rows).toEqual([]);
  });
});
