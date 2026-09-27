import { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';
import { useItemVerbs } from '../../inventory-web/item-verbs.js';
import { useBatchCreate } from '../../inventory-web/useBatchCreate.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { useStoreHereCommands } from './store-here-commands.js';
import { useStoreHereState } from './store-here-state.js';

import type { ItemRowModel, PlacementWorld, StoreHereTarget } from '../model/contracts.js';
import type { StoreCandidate } from './store-here-model.js';

/** The delay between the last search keystroke and the server request. */
export const STORE_SEARCH_DEBOUNCE_MS = 200;

/** The live state and commands owned by one open Store here sheet. */
export interface StoreHereData {
  status: 'pending' | 'error' | 'success';
  /** Refetches only failed placement and blank-query reads. */
  retry: () => void;
  world: PlacementWorld;
  candidates: StoreCandidate[];
  query: string;
  setQuery: (query: string) => void;
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  /** Names created in this sheet, newest first. */
  created: string[];
  createError: string | null;
  /** True while a store or create request is in flight. */
  busy: boolean;
  /** Creates one untyped item in the target and reports whether it was created. */
  create: (name: string) => Promise<boolean>;
  /** Stores the supplied rows with one bulk request. */
  store: (items: readonly ItemRowModel[]) => Promise<void>;
  /** Opens a closed container, or does nothing when offline or on a place target. */
  openTarget: () => Promise<void>;
}

/**
 * Loads Store here candidates from live inventory reads and coordinates its
 * search, selection, create, bulk-store, closed-target, retry, and Undo flows.
 */
export function useStoreHere(target: StoreHereTarget): StoreHereData {
  const online = useOnline();
  const state = useStoreHereState(target, STORE_SEARCH_DEBOUNCE_MS);
  const commands = useStoreHereCommands({
    target,
    online,
    bulk: useBulkItemVerbs(),
    itemVerbs: useItemVerbs(),
    batch: useBatchCreate(),
    removeSelected: state.removeSelected,
  });

  return {
    status: state.status,
    retry: state.retry,
    world: state.world,
    candidates: state.candidates,
    query: state.query,
    setQuery: state.setQuery,
    selected: state.selected,
    toggle: state.toggle,
    created: commands.created,
    createError: commands.createError,
    busy: commands.busy,
    create: commands.create,
    store: commands.store,
    openTarget: commands.openTarget,
  };
}
