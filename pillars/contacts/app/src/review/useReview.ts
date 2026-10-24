import { useRef, useState } from 'react';

import { ContactError } from '../errors';
import { StaleReviewError, type ReviewGateway, type ReviewRequest } from './contracts';
import { selectedCandidates, type ReviewChoices, type ReviewItem } from './model';
import { useReviewData } from './useReviewData';

interface SubmissionState {
  saving: boolean;
  error: Error | null;
  success: boolean;
  stale: boolean;
  uncertain: boolean;
  generation: number;
}
const initialSubmission: SubmissionState = {
  saving: false,
  error: null,
  success: false,
  stale: false,
  uncertain: false,
  generation: 0,
};

function useSubmission(gateway: ReviewGateway, refresh: () => Promise<unknown>) {
  const request = useRef<ReviewRequest | null>(null);
  const [state, setState] = useState(initialSubmission);
  async function send(pending: ReviewRequest) {
    request.current = pending;
    setState((value) => ({ ...value, saving: true, error: null, success: false, uncertain: true }));
    let saved = false;
    try {
      await gateway.save(pending);
      saved = true;
      request.current = null;
      setState((value) => ({
        ...value,
        success: true,
        uncertain: false,
        generation: value.generation + 1,
      }));
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
      setState((value) => ({ ...value, saving: false }));
    }
  }
  async function reload() {
    if (state.saving) return;
    request.current = null;
    setState((value) => ({ ...initialSubmission, generation: value.generation + 1 }));
    try {
      await refresh();
    } catch (failure) {
      const error =
        failure instanceof Error
          ? failure
          : new ContactError('network', 'contacts.review.reload_failed');
      setState((value) => ({ ...value, error, stale: error instanceof StaleReviewError }));
    }
  }
  return {
    ...state,
    submit: (pending: ReviewRequest) => (request.current ? Promise.resolve() : send(pending)),
    reload,
    setError: (error: Error) => setState((value) => ({ ...value, error })),
    retry: () =>
      request.current && !state.stale && !state.saving ? send(request.current) : Promise.resolve(),
  };
}

/** Load consistent evidence and retain exact write intent across uncertain network outcomes. */
export function useReview(batchId: string, gateway: ReviewGateway) {
  const query = useReviewData(batchId, gateway);
  const submission = useSubmission(gateway, () => query.refresh());
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
      await submission.submit(pending);
    } catch (failure) {
      submission.setError(
        failure instanceof Error
          ? failure
          : new ContactError('invalidChoices', 'contacts.review.invalid_choices')
      );
    }
  }
  return {
    ...query,
    ...submission,
    stale: submission.stale || query.error instanceof StaleReviewError,
    error: submission.error ?? query.error,
    save,
  };
}
