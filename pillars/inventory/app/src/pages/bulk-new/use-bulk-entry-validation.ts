import { useCallback, useEffect, useRef } from 'react';

import {
  applyValidation,
  hasRefusedRows,
  lastNonBlankIndex,
  resetRows,
  workingPhase,
} from './bulk-entry-model.js';
import { asInventoryApiError, rowsToSend, toBatchDestination } from './bulk-entry-transport.js';

import type { BatchCreate } from '../../inventory-web/useBatchCreate.js';
import type { BulkEntryState } from './use-bulk-entry-state.js';
import type { BulkPhase } from './use-bulk-entry.js';
import type { BulkRowState } from './use-bulk-entry.js';

const VALIDATION_DELAY_MS = 200;

function validationPhase(rows: readonly BulkRowState[], fromPaste: boolean): BulkPhase {
  if (hasRefusedRows(rows)) return 'has-errors';
  if (fromPaste) return 'pasted';
  return 'editing';
}

/** Controls debounced and immediate server validation for the editable grid. */
export interface BulkValidation {
  cancel: () => void;
  invalidate: () => void;
  start: (snapshot: readonly BulkRowState[], fromPaste: boolean) => void;
  schedule: () => void;
}

interface ValidationRunOptions {
  snapshot: readonly BulkRowState[];
  fromPaste: boolean;
  requestId: number;
  validationIdRef: { current: number };
  state: BulkEntryState;
  validate: BatchCreate['validate'];
}

function runValidation({
  snapshot,
  fromPaste,
  requestId,
  validationIdRef,
  state,
  validate,
}: ValidationRunOptions): void {
  if (!state.onlineRef.current) return;
  const requestRows = rowsToSend(snapshot, state.typesRef.current, state.defaultTypeKeyRef.current);
  if (requestRows.length === 0) {
    state.setValidationPending(false);
    state.setError(null);
    state.setPhase('editing');
    return;
  }

  state.setValidationPending(true);
  state.setPhase('validating');
  void validate(requestRows, toBatchDestination(state.destinationRef.current))
    .then((run) => {
      if (validationIdRef.current !== requestId) return;
      state.setValidationPending(false);
      const nextRows = applyValidation(snapshot, run.outcomes);
      state.replaceRows(nextRows);
      const failure = run.outcomes.find((outcome) => outcome.status === 'not-sent');
      state.setError(failure?.status === 'not-sent' ? failure.error : null);
      state.setPhase(validationPhase(nextRows, fromPaste));
    })
    .catch((reason: unknown) => {
      if (validationIdRef.current !== requestId) return;
      state.setValidationPending(false);
      const nextRows = resetRows(snapshot);
      state.replaceRows(nextRows);
      state.setError(asInventoryApiError(reason));
      state.setPhase(workingPhase(nextRows));
    });
}

function useValidationLifecycle(
  online: boolean,
  state: BulkEntryState,
  validation: Pick<BulkValidation, 'start' | 'cancel' | 'invalidate'>
): void {
  const previousOnlineRef = useRef(online);
  useEffect(() => {
    const wasOnline = previousOnlineRef.current;
    previousOnlineRef.current = online;
    if (!online) {
      validation.cancel();
      validation.invalidate();
      return;
    }
    if (!wasOnline && lastNonBlankIndex(state.rowsRef.current) >= 0) {
      validation.start(state.rowsRef.current, false);
    }
  }, [online, state.rowsRef, validation]);
}

/** Connects the validation lifecycle to the bulk-entry state and request function. */
export function useBulkValidation(
  state: BulkEntryState,
  online: boolean,
  validate: BatchCreate['validate']
): BulkValidation {
  const validationIdRef = useRef(0);
  const validationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invalidate = useCallback((): void => {
    validationIdRef.current += 1;
  }, []);
  const cancel = useCallback((): void => {
    if (validationTimerRef.current === null) return;
    clearTimeout(validationTimerRef.current);
    validationTimerRef.current = null;
  }, []);
  const start = useCallback(
    (snapshot: readonly BulkRowState[], fromPaste: boolean): void => {
      const requestId = validationIdRef.current + 1;
      validationIdRef.current = requestId;
      runValidation({ snapshot, fromPaste, requestId, validationIdRef, state, validate });
    },
    [state, validate]
  );
  const schedule = useCallback((): void => {
    cancel();
    if (!state.onlineRef.current) return;
    validationTimerRef.current = setTimeout(() => {
      validationTimerRef.current = null;
      start(state.rowsRef.current, false);
    }, VALIDATION_DELAY_MS);
  }, [cancel, start, state.onlineRef, state.rowsRef]);

  useValidationLifecycle(online, state, { start, cancel, invalidate });
  useEffect(
    () => () => {
      cancel();
      invalidate();
    },
    [cancel, invalidate]
  );

  return { cancel, invalidate, start, schedule };
}
