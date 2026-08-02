import { findSimilarTransactions } from '../lib/transaction-utils';
import {
  type AddPendingChangeSetInput,
  type AddPendingEntityInput,
  type AddPendingTagRuleChangeSetInput,
  downstreamReset,
  fingerprintParsedTransactions,
  type ImportStore,
  initialState,
  isSameFileSet,
  type PendingChangeSet,
  type PendingEntity,
  type PendingTagRuleChangeSet,
  type ProcessedTransaction,
} from './import-store-types';

type StoreSet = (
  partial: Partial<ImportStore> | ((state: ImportStore) => Partial<ImportStore>)
) => void;
type StoreGet = () => ImportStore;

export function buildSetters(set: StoreSet) {
  return {
    setFiles: (files: File[]) =>
      set((state) => {
        const sourceFileNames = files.map((f) => f.name);
        return isSameFileSet(state.files, files)
          ? { files, sourceFileNames }
          : { ...downstreamReset, files, sourceFileNames };
      }),
    setBankType: (bankType: ImportStore['bankType']) => set({ bankType }),
    setHeaders: (headers: string[]) => set({ headers }),
    setRows: (rows: Record<string, string>[]) => set({ rows }),
    setColumnMap: (columnMap: ImportStore['columnMap']) => set({ columnMap }),
    setParsedTransactions: (parsedTransactions: ImportStore['parsedTransactions']) =>
      set((state) => {
        const nextFingerprint = fingerprintParsedTransactions(parsedTransactions);
        if (nextFingerprint === state.parsedTransactionsFingerprint) {
          return { parsedTransactions };
        }
        return {
          ...downstreamReset,
          parsedTransactions,
          parsedTransactionsFingerprint: nextFingerprint,
        };
      }),
    setProcessSessionId: (processSessionId: string | null) => set({ processSessionId }),
    setProcessedTransactions: (processedTransactions: ImportStore['processedTransactions']) =>
      set((state) => ({
        processedTransactions,
        processedForFingerprint: state.parsedTransactionsFingerprint,
      })),
    setConfirmedTransactions: (confirmedTransactions: ImportStore['confirmedTransactions']) =>
      set({ confirmedTransactions }),
    setCommitResult: (commitResult: ImportStore['commitResult']) => set({ commitResult }),
  };
}

export function buildNavigation(set: StoreSet) {
  return {
    nextStep: () => set((state) => ({ currentStep: Math.min(state.currentStep + 1, 8) })),
    prevStep: () => set((state) => ({ currentStep: Math.max(state.currentStep - 1, 1) })),
    goToStep: (step: number) => set({ currentStep: Math.min(Math.max(step, 1), 8) }),
    reset: () => set(initialState),
  };
}

export function buildPendingEntityActions(set: StoreSet, get: StoreGet) {
  return {
    addPendingEntity: (
      input: AddPendingEntityInput,
      dbEntities: Array<{ name: string }> = []
    ): PendingEntity => {
      const nameLower = input.name.toLowerCase();
      const state = get();
      if (state.pendingEntities.some((e) => e.name.toLowerCase() === nameLower)) {
        throw new Error(`Entity with name "${input.name}" already exists in pending list`);
      }
      if (dbEntities.some((e) => e.name.toLowerCase() === nameLower)) {
        throw new Error(`Entity with name "${input.name}" already exists in the database`);
      }
      const entity: PendingEntity = {
        tempId: `temp:entity:${globalThis.crypto.randomUUID()}`,
        name: input.name,
        type: input.type,
      };
      set((prev) => ({ pendingEntities: [...prev.pendingEntities, entity] }));
      return entity;
    },
    listPendingEntities: (): PendingEntity[] => get().pendingEntities,
    removePendingEntity: (tempId: string) =>
      set((state) => ({
        pendingEntities: state.pendingEntities.filter((e) => e.tempId !== tempId),
      })),
  };
}

export function buildPendingChangeSetActions(set: StoreSet, get: StoreGet) {
  return {
    addPendingChangeSet: (input: AddPendingChangeSetInput): PendingChangeSet => {
      const entry: PendingChangeSet = {
        tempId: `temp:changeset:${globalThis.crypto.randomUUID()}`,
        changeSet: input.changeSet,
        appliedAt: new Date().toISOString(),
        source: input.source,
      };
      set((prev) => ({ pendingChangeSets: [...prev.pendingChangeSets, entry] }));
      return entry;
    },
    listPendingChangeSets: (): PendingChangeSet[] => get().pendingChangeSets,
    removePendingChangeSet: (tempId: string) =>
      set((state) => ({
        pendingChangeSets: state.pendingChangeSets.filter((c) => c.tempId !== tempId),
      })),
  };
}

export function buildPendingTagRuleActions(set: StoreSet, get: StoreGet) {
  return {
    addPendingTagRuleChangeSet: (
      input: AddPendingTagRuleChangeSetInput
    ): PendingTagRuleChangeSet => {
      const entry: PendingTagRuleChangeSet = {
        tempId: `temp:tagrules:${crypto.randomUUID()}`,
        changeSet: input.changeSet,
        appliedAt: new Date().toISOString(),
        source: input.source,
      };
      set((prev) => ({ pendingTagRuleChangeSets: [...prev.pendingTagRuleChangeSets, entry] }));
      return entry;
    },
    listPendingTagRuleChangeSets: (): PendingTagRuleChangeSet[] => get().pendingTagRuleChangeSets,
    removePendingTagRuleChangeSet: (tempId: string) =>
      set((state) => ({
        pendingTagRuleChangeSets: state.pendingTagRuleChangeSets.filter((c) => c.tempId !== tempId),
      })),
  };
}

export function buildTransactionActions(set: StoreSet, get: StoreGet) {
  return {
    /**
     * Siblings a correction on `transaction` would also cover.
     *
     * `matched` counts: a rule born from this correction re-decides those rows
     * too, and a wrong auto-match lands its whole merchant in `matched`, so
     * scanning only uncertain/failed reported "no similar rows" for exactly the
     * case where the rule matters most.
     */
    findSimilar: (transaction: ProcessedTransaction): ProcessedTransaction[] => {
      const state = get();
      const allTransactions: ProcessedTransaction[] = [
        ...state.processedTransactions.matched,
        ...state.processedTransactions.uncertain,
        ...state.processedTransactions.failed,
      ];
      return findSimilarTransactions(transaction, allTransactions);
    },
    updateTransactionTags: (checksum: string, tags: string[]) => {
      set((state) => ({
        confirmedTransactions: state.confirmedTransactions.map((t) =>
          t.checksum === checksum ? { ...t, tags } : t
        ),
      }));
    },
    markChecksumsResolved: (checksums: string[]) =>
      set((state) => ({
        manuallyResolvedChecksums: [...new Set([...state.manuallyResolvedChecksums, ...checksums])],
      })),
  };
}
