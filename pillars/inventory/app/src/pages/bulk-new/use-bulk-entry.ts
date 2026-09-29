import { useBatchCreate } from '../../inventory-web/useBatchCreate.js';
import { useDeleteCreated } from '../../inventory-web/useDeleteCreated.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { useBulkCreateAction, useBulkUndoAction } from './use-bulk-entry-commit.js';
import { useBulkEntryEditing } from './use-bulk-entry-editing.js';
import { useBulkEntryState } from './use-bulk-entry-state.js';
import { useBulkValidation } from './use-bulk-entry-validation.js';

import type { FilterOption } from '../../foundation/list-page/list-filters.js';
import type { PlacementTarget } from '../../foundation/model/model.js';
import type { BulkEntry } from './bulk-entry-types.js';

export type {
  BulkCounts,
  BulkEntry,
  BulkIssue,
  BulkPhase,
  BulkRowState,
  BulkRowStatus,
} from './bulk-entry-types.js';

export { isBlankDraft } from './bulk-entry-model.js';
export { toBatchDestination } from './bulk-entry-transport.js';

/**
 * Owns editable bulk-entry rows, debounced server validation, partial commit,
 * progress reporting, and undo for the most recent commit.
 *
 * The hook deliberately accepts type filter options instead of reading the
 * catalogue itself so the page remains the owner of URL and catalogue state.
 */
export function useBulkEntry(
  initial: { destination: PlacementTarget; defaultTypeKey: string | null },
  types: readonly FilterOption[]
): BulkEntry {
  const online = useOnline();
  const state = useBulkEntryState(initial, types, online);
  const { validate, commit } = useBatchCreate();
  const deleteCreated = useDeleteCreated();
  const validation = useBulkValidation(state, online, validate);
  const commitActions = useBulkCreateAction(state, validation, commit);
  const editing = useBulkEntryEditing(state, validation, commitActions.invalidate);
  const undoCreated = useBulkUndoAction(state, deleteCreated);
  return { ...state, ...editing, create: commitActions.create, undoCreated };
}
