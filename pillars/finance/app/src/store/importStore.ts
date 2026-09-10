import { create } from 'zustand';

import {
  buildNavigation,
  buildPendingChangeSetActions,
  buildPendingEntityActions,
  buildPendingTagRuleActions,
  buildSetters,
  buildTransactionActions,
} from './import-store-actions';
import { type ImportStore, initialState } from './import-store-types';

export type {
  AddPendingChangeSetInput,
  AddPendingEntityInput,
  AddPendingTagRuleChangeSetInput,
  BankDialectId,
  ChangeSet,
  EntityType,
  ImportStore,
  PendingChangeSet,
  PendingEntity,
  PendingTagRuleChangeSet,
  ProcessedTransaction,
} from './import-store-types';

/**
 * In-memory only. What survives a reload is the server draft (finance
 * ADR-005): `useDraftWriteThrough` mirrors this store into it and
 * `useDraftHydration` fills the store from it, so nothing here needs a
 * browser-side persistence layer and nothing here has one.
 */
export const useImportStore = create<ImportStore>()((set, get) => ({
  ...initialState,
  ...buildSetters(set),
  ...buildNavigation(set),
  ...buildPendingEntityActions(set, get),
  ...buildPendingChangeSetActions(set, get),
  ...buildPendingTagRuleActions(set, get),
  ...buildTransactionActions(set, get),
}));
