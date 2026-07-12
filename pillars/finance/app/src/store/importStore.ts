import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  buildNavigation,
  buildPendingChangeSetActions,
  buildPendingEntityActions,
  buildPendingTagRuleActions,
  buildSetters,
  buildTransactionActions,
} from './import-store-actions';
import {
  createImportPersistStorage,
  IMPORT_PERSIST_KEY,
  IMPORT_PERSIST_VERSION,
  partializeImportState,
} from './import-store-persistence';
import { type ImportStore, initialState } from './import-store-types';

export type {
  AddPendingChangeSetInput,
  AddPendingEntityInput,
  AddPendingTagRuleChangeSetInput,
  BankType,
  ChangeSet,
  EntityType,
  ImportStore,
  PendingChangeSet,
  PendingEntity,
  PendingTagRuleChangeSet,
  ProcessedTransaction,
} from './import-store-types';

// No `migrate`: zustand discards the stored state on a version mismatch, which
// is exactly the wanted behaviour — a discarded resume is just a fresh wizard.
// `skipHydration` keeps module load side-effect free (no IDB reads in tests);
// `useImportResume` calls `rehydrate()` explicitly on the import page.
export const useImportStore = create<ImportStore>()(
  persist(
    (set, get) => ({
      ...initialState,
      ...buildSetters(set),
      ...buildNavigation(set),
      ...buildPendingEntityActions(set, get),
      ...buildPendingChangeSetActions(set, get),
      ...buildPendingTagRuleActions(set, get),
      ...buildTransactionActions(set, get),
    }),
    {
      name: IMPORT_PERSIST_KEY,
      version: IMPORT_PERSIST_VERSION,
      storage: createImportPersistStorage(),
      partialize: partializeImportState,
      skipHydration: true,
    }
  )
);
