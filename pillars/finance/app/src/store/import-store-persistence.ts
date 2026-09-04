import { toast } from 'sonner';

import { createIdbPersistStorage } from './idb-persist-storage';

import type { PersistStorage } from 'zustand/middleware';

import type { ImportStore } from './import-store-types';

export const IMPORT_PERSIST_KEY = 'pops-finance-import-wizard';
/** Bump on ANY change to the persisted shape — a version mismatch silently discards the stored copy. */
export const IMPORT_PERSIST_VERSION = 4;
export const IMPORT_PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PersistedImportState = Pick<
  ImportStore,
  | 'currentStep'
  | 'sourceFileNames'
  | 'accountId'
  | 'accountName'
  | 'bankType'
  | 'headers'
  | 'rows'
  | 'columnMap'
  | 'parsedTransactions'
  | 'parsedTransactionsFingerprint'
  | 'processSessionId'
  | 'processedForFingerprint'
  | 'processedTransactions'
  | 'confirmedTransactions'
  | 'commitResult'
  | 'pendingEntities'
  | 'pendingChangeSets'
  | 'pendingTagRuleChangeSets'
  | 'manuallyResolvedChecksums'
>;

/**
 * Explicit field pick (never a spread-minus): the non-serializable `files` and
 * every action stay out, and a future field must be consciously added here —
 * the `PersistedImportState` return type makes the compiler flag drift.
 */
export function partializeImportState(state: ImportStore): PersistedImportState {
  return {
    currentStep: state.currentStep,
    sourceFileNames: state.sourceFileNames,
    accountId: state.accountId,
    accountName: state.accountName,
    bankType: state.bankType,
    headers: state.headers,
    rows: state.rows,
    columnMap: state.columnMap,
    parsedTransactions: state.parsedTransactions,
    parsedTransactionsFingerprint: state.parsedTransactionsFingerprint,
    processSessionId: state.processSessionId,
    processedForFingerprint: state.processedForFingerprint,
    processedTransactions: state.processedTransactions,
    confirmedTransactions: state.confirmedTransactions,
    commitResult: state.commitResult,
    pendingEntities: state.pendingEntities,
    pendingChangeSets: state.pendingChangeSets,
    pendingTagRuleChangeSets: state.pendingTagRuleChangeSets,
    manuallyResolvedChecksums: state.manuallyResolvedChecksums,
  };
}

/** The import wizard's IndexedDB persistence backend (7-day TTL, one-time write-failure toast). */
export function createImportPersistStorage(): PersistStorage<PersistedImportState> {
  return createIdbPersistStorage<PersistedImportState>({
    dbName: 'pops-finance',
    storeName: 'import-wizard',
    maxAgeMs: IMPORT_PERSIST_MAX_AGE_MS,
    onWriteError: () =>
      toast.warning(
        "Import progress can't be saved for recovery — the import itself still works normally"
      ),
  });
}

/**
 * A run is worth resuming when it is uncommitted, past step 1, and has parsed
 * CSV rows — `rows`, not `parsedTransactions`, so a run parked at step 2 with
 * no column map yet still qualifies.
 */
export function hasResumableImport(
  state: Pick<ImportStore, 'commitResult' | 'currentStep' | 'rows'>
): boolean {
  return state.commitResult === null && state.currentStep > 1 && state.rows.length > 0;
}

function hasCurrentProcessedResults(state: PersistedImportState): boolean {
  const { matched, uncertain, failed, skipped } = state.processedTransactions;
  return (
    matched.length + uncertain.length + failed.length + skipped.length > 0 &&
    state.processedForFingerprint !== null &&
    state.processedForFingerprint === state.parsedTransactionsFingerprint
  );
}

/**
 * The deepest wizard step whose prerequisites the persisted state still
 * satisfies; `currentStep` is never trusted past that cap.
 */
export function clampResumeStep(state: PersistedImportState): number {
  let cap = 1;
  if (state.confirmedTransactions.length > 0) cap = 7;
  else if (hasCurrentProcessedResults(state)) cap = 4;
  else if (state.parsedTransactions.length > 0) cap = 3;
  else if (state.rows.length > 0 && state.headers.length > 0) cap = 2;
  return Math.min(state.currentStep, cap);
}
