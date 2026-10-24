import { useRef, useState } from 'react';

import { ContactError } from '../errors';
import {
  StaleReviewError,
  type ReviewGateway,
  type ReviewOperation,
  type ReviewRequest,
} from './contracts';
import { selectedCandidates, type ReviewChoices, type ReviewItem } from './model';
import { useReviewData } from './useReviewData';

interface SubmissionState {
  saving: boolean;
  error: Error | null;
  success: boolean;
  stale: boolean;
  uncertain: boolean;
  generation: number;
  readyApplied: number | null;
  readyApplying: boolean;
}
const initialSubmission: SubmissionState = {
  saving: false,
  error: null,
  success: false,
  stale: false,
  uncertain: false,
  generation: 0,
  readyApplied: null,
  readyApplying: false,
};

function starting(state: SubmissionState, operation: ReviewOperation): SubmissionState {
  return {
    ...state,
    saving: true,
    readyApplying: operation.kind === 'ready',
    error: null,
    success: false,
    uncertain: true,
  };
}

function acknowledged(state: SubmissionState, readyApplied: number | null): SubmissionState {
  return {
    ...state,
    success: true,
    readyApplied,
    uncertain: false,
    generation: state.generation + 1,
  };
}

async function applyOperation(
  gateway: ReviewGateway,
  operation: ReviewOperation
): Promise<number | null> {
  if (operation.kind === 'ready') return (await gateway.applyReady(operation.request)).appliedRows;
  await gateway.save(operation.request);
  return null;
}

function useSubmission(
  gateway: ReviewGateway,
  refresh: () => Promise<unknown>,
  onSaved?: (operation: ReviewOperation) => void
) {
  const request = useRef<ReviewOperation | null>(null);
  const [state, setState] = useState(initialSubmission);
  async function send(pending: ReviewOperation) {
    request.current = pending;
    setState((value) => starting(value, pending));
    let saved = false;
    try {
      const readyApplied = await applyOperation(gateway, pending);
      saved = true;
      onSaved?.(pending);
      request.current = null;
      setState((value) => acknowledged(value, readyApplied));
      await refresh();
    } catch (failure) {
      const error =
        failure instanceof Error
          ? failure
          : new ContactError('saveFailed', 'contacts.review.save_failed');
      setState((value) => ({
        ...value,
        error,
        stale: error instanceof StaleReviewError,
        uncertain: !saved && !(error instanceof StaleReviewError),
      }));
    } finally {
      setState((value) => ({ ...value, saving: false, readyApplying: false }));
    }
  }
  async function reload() {
    if (state.saving) return;
    request.current = null;
    setState((value) => ({ ...initialSubmission, saving: true, generation: value.generation + 1 }));
    try {
      await refresh();
    } catch (failure) {
      const error =
        failure instanceof Error
          ? failure
          : new ContactError('network', 'contacts.review.reload_failed');
      setState((value) => ({ ...value, error, stale: error instanceof StaleReviewError }));
    } finally {
      setState((value) => ({ ...value, saving: false, readyApplying: false }));
    }
  }
  return {
    ...state,
    submit: (pending: ReviewOperation) => (request.current ? Promise.resolve() : send(pending)),
    reload,
    setError: (error: Error) => setState((value) => ({ ...value, error })),
    retry: () =>
      request.current && !state.stale && !state.saving ? send(request.current) : Promise.resolve(),
  };
}

/** Load consistent evidence and retain exact write intent across uncertain network outcomes. */
export function useReview(
  batchId: string,
  gateway: ReviewGateway,
  onSaved?: (operation: ReviewOperation) => void
) {
  const query = useReviewData(batchId, gateway);
  const submission = useSubmission(gateway, () => query.refresh(), onSaved);
  async function save(item: ReviewItem, choices: ReviewChoices) {
    if (!query.data || submission.saving || submission.stale || submission.uncertain) return;
    try {
      const pending: ReviewRequest = {
        batchId,
        batchRevision: query.data.batchRevision,
        directoryRevision: query.data.directoryRevision,
        rowId: item.id,
        proposalRevision: item.proposalRevision,
        idempotencyKey: crypto.randomUUID(),
        choices: structuredClone(choices),
        ...selectedCandidates(item, choices),
      };
      await submission.submit({ kind: 'row', request: pending });
    } catch (failure) {
      submission.setError(
        failure instanceof Error
          ? failure
          : new ContactError('invalidChoices', 'contacts.review.invalid_choices')
      );
    }
  }
  async function applyReady() {
    const snapshot = query.data;
    if (
      !snapshot ||
      snapshot.ready.eligibleRows === 0 ||
      submission.saving ||
      submission.stale ||
      submission.uncertain
    )
      return;
    await submission.submit({
      kind: 'ready',
      request: {
        batchId,
        batchRevision: snapshot.batchRevision,
        directoryRevision: snapshot.directoryRevision,
        proposalRevision: snapshot.ready.proposalRevision,
        idempotencyKey: crypto.randomUUID(),
      },
    });
  }

  return {
    ...query,
    ...submission,
    stale: submission.stale || query.error instanceof StaleReviewError,
    error: submission.error ?? query.error,
    save,
    applyReady,
  };
}
