import { useCallback } from 'react';

import {
  BLANK_DRAFT,
  parsePaste,
  type BulkColumn,
} from '../../foundation/list-page/paste-parser.js';
import { samePlacement } from '../../foundation/model/placement-model.js';
import {
  lastNonBlankIndex,
  normalizeRows,
  resetRows,
  rowState,
  workingPhase,
} from './bulk-entry-model.js';
import { isTakenOverPaste, pasteNote } from './bulk-entry-transport.js';

import type { PlacementTarget } from '../../foundation/model/model.js';
import type { BulkEntryState } from './use-bulk-entry-state.js';
import type { BulkValidation } from './use-bulk-entry-validation.js';

function useGridEditing(state: BulkEntryState, validation: BulkValidation) {
  const setCell = useCallback(
    (rowIndex: number, column: BulkColumn, value: string): void => {
      validation.cancel();
      validation.invalidate();
      state.setValidationPending(false);
      state.setProgress(null);
      state.setPasteNote('');
      const nextRows = [...state.rowsRef.current];
      while (nextRows.length <= rowIndex) nextRows.push(rowState(BLANK_DRAFT));
      const current = nextRows[rowIndex];
      if (current === undefined) return;
      nextRows[rowIndex] = rowState({ ...current.draft, [column]: value });
      const normalized = normalizeRows(nextRows);
      state.replaceRows(normalized);
      state.setPhase(workingPhase(normalized));
      if (lastNonBlankIndex(normalized) >= 0) validation.schedule();
    },
    [state, validation]
  );

  const paste = useCallback(
    (text: string, rowIndex: number): boolean => {
      if (!isTakenOverPaste(text)) return false;
      validation.cancel();
      validation.invalidate();
      state.setValidationPending(false);
      state.setProgress(null);
      const parsed = parsePaste(text);
      const nextRows = [...state.rowsRef.current];
      const start = Math.max(0, rowIndex);
      while (nextRows.length < start) nextRows.push(rowState(BLANK_DRAFT));
      parsed.rows.forEach((draft, offset) => {
        nextRows[start + offset] = rowState(draft);
      });
      const normalized = normalizeRows(nextRows);
      state.replaceRows(normalized);
      state.setPasteNote(pasteNote(parsed.header, parsed.ignoredColumns));
      state.setPhase(workingPhase(normalized));
      if (lastNonBlankIndex(normalized) >= 0) validation.start(normalized, true);
      return true;
    },
    [state, validation]
  );

  return { setCell, paste };
}

function useDefaultEditing(state: BulkEntryState, validation: BulkValidation) {
  const recheckAfterSetting = useCallback(
    (nextRows: BulkEntryState['rows']): void => {
      validation.cancel();
      validation.invalidate();
      state.setValidationPending(false);
      const normalized = resetRows(nextRows);
      state.replaceRows(normalized);
      state.setPasteNote('');
      state.setProgress(null);
      state.setPhase(workingPhase(normalized));
      if (lastNonBlankIndex(normalized) >= 0) validation.start(normalized, false);
    },
    [state, validation]
  );
  const setDestination = useCallback(
    (next: PlacementTarget): void => {
      if (samePlacement(state.destinationRef.current, next)) return;
      state.updateDestination(next);
      recheckAfterSetting(state.rowsRef.current);
    },
    [recheckAfterSetting, state]
  );
  const setDefaultTypeKey = useCallback(
    (next: string | null): void => {
      if (state.defaultTypeKeyRef.current === next) return;
      state.updateDefaultTypeKey(next);
      recheckAfterSetting(state.rowsRef.current);
    },
    [recheckAfterSetting, state]
  );
  return { setDestination, setDefaultTypeKey };
}

function useClearEditing(
  state: BulkEntryState,
  validation: BulkValidation,
  invalidateCommit: () => void
) {
  return useCallback((): void => {
    validation.cancel();
    validation.invalidate();
    invalidateCommit();
    const emptyRows = normalizeRows([]);
    state.replaceRows(emptyRows);
    state.setValidationPending(false);
    state.setPasteNote('');
    state.setProgress(null);
    state.setError(null);
    state.setCreatedIds([]);
    state.setCreatedCount(0);
    state.setPhase('editing');
  }, [invalidateCommit, state, validation]);
}

/** Composes cell, paste, default-control, and clear-grid editing actions. */
export function useBulkEntryEditing(
  state: BulkEntryState,
  validation: BulkValidation,
  invalidateCommit: () => void
) {
  const grid = useGridEditing(state, validation);
  const defaults = useDefaultEditing(state, validation);
  const clear = useClearEditing(state, validation, invalidateCommit);
  return { ...grid, ...defaults, clear };
}
