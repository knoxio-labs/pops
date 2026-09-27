import { useCallback, useRef } from 'react';

import { commitWithProgress } from '../../inventory-web/batch-commit.js';
import { applyCommit, lastNonBlankIndex, workingPhase } from './bulk-entry-model.js';
import { asInventoryApiError, rowsToSend, toBatchDestination } from './bulk-entry-transport.js';

import type { BatchCreate } from '../../inventory-web/useBatchCreate.js';
import type { DeleteCreatedResult } from '../../inventory-web/useDeleteCreated.js';
import type { BulkEntryState } from './use-bulk-entry-state.js';
import type { BulkValidation } from './use-bulk-entry-validation.js';

interface CommitOptions {
  state: BulkEntryState;
  validation: BulkValidation;
  commit: BatchCreate['commit'];
  operationIdRef: { current: number };
}

async function commitRows(options: CommitOptions): Promise<void> {
  const { state, validation, commit, operationIdRef } = options;
  validation.cancel();
  validation.invalidate();
  const operationId = operationIdRef.current + 1;
  operationIdRef.current = operationId;
  const snapshot = state.rowsRef.current;
  const requestRows = rowsToSend(snapshot, state.typesRef.current, state.defaultTypeKeyRef.current);
  state.setValidationPending(false);
  state.setPhase('submitting');
  state.setProgress(null);
  state.setError(null);
  state.setCreatedIds([]);
  state.setCreatedCount(0);
  const destination = toBatchDestination(state.destinationRef.current);

  try {
    const run = await commitWithProgress(commit, requestRows, destination, (progress) => {
      if (operationIdRef.current === operationId) state.setProgress(progress);
    });
    if (operationIdRef.current !== operationId) return;
    const result = applyCommit(snapshot, run.outcomes);
    state.replaceRows(result.rows);
    state.setCreatedIds(result.createdIds);
    state.setCreatedCount(result.createdIds.length);
    state.setError(result.error);
    state.setPhase(commitPhase(result.createdIds.length, result.rows));
  } catch (reason: unknown) {
    if (operationIdRef.current !== operationId) return;
    state.setError(asInventoryApiError(reason));
    state.setPhase(workingPhase(snapshot));
  }
}

function commitPhase(
  created: number,
  rows: Parameters<typeof workingPhase>[0]
): 'created' | 'partial-created' | 'editing' | 'has-errors' {
  if (created === 0) return workingPhase(rows);
  return lastNonBlankIndex(rows) < 0 ? 'created' : 'partial-created';
}

/** Creates ready rows with progress while preserving partial outcomes. */
export function useBulkCreateAction(
  state: BulkEntryState,
  validation: BulkValidation,
  commit: BatchCreate['commit']
): { create: () => Promise<void>; invalidate: () => void } {
  const operationIdRef = useRef(0);
  const invalidate = useCallback((): void => {
    operationIdRef.current += 1;
  }, []);
  const create = useCallback(async () => {
    if (!state.onlineRef.current || state.phase === 'submitting' || state.validationPending) return;
    if (state.counts.ready === 0) return;
    await commitRows({ state, validation, commit, operationIdRef });
  }, [commit, state, validation]);
  return { create, invalidate };
}

/** Deletes the ids created by the most recent commit and reports partial deletion. */
export function useBulkUndoAction(
  state: BulkEntryState,
  deleteCreated: (ids: readonly string[]) => Promise<DeleteCreatedResult>
): () => Promise<DeleteCreatedResult> {
  return useCallback(async () => {
    if (state.createdIds.length === 0) return { removed: [], kept: [] };
    const result = await deleteCreated(state.createdIds);
    state.setCreatedIds([]);
    state.setCreatedCount(0);
    state.setProgress(null);
    state.setPhase(workingPhase(state.rowsRef.current));
    return result;
  }, [deleteCreated, state]);
}
