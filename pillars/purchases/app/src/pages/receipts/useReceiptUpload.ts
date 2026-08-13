import { useMutation, useQueryClient } from '@tanstack/react-query';

import { unwrap } from '../../purchases-api-helpers.js';
import { receiptUpload } from '../../purchases-api/index.js';
import { RECONCILE_QUEUE_QUERY_KEY } from '../reconcile/useReconcileQueue.js';

import type { ReceiptOutcome, ReceiptPart } from './types.js';

/**
 * What one upload came back as.
 *
 * A union rather than the 200 body alone, because two of the answers this
 * endpoint gives are not the 200 body: a receipt already recorded comes back
 * 409 and is not a failure, and everything else that refuses the upload is.
 */
export type ReceiptSubmission =
  | { state: 'idle' }
  | { state: 'uploading' }
  | { state: 'read'; outcome: ReceiptOutcome }
  | { state: 'duplicate'; message: string | null }
  | { state: 'refused'; failure: Error };

type UploadResult =
  | { kind: 'outcome'; outcome: ReceiptOutcome }
  | { kind: 'duplicate'; message: string | null };

/**
 * The 409 the pillar sends for a receipt it already holds, from either of its
 * two duplicate checks. Read off the code rather than the status so the answer
 * does not depend on a `Response` the transport may not have kept.
 */
function duplicateOf(error: unknown): { message: string | null } | null {
  if (typeof error !== 'object' || error === null) return null;
  if (!('code' in error) || error.code !== 'ALREADY_IMPORTED') return null;
  const message = 'message' in error && typeof error.message === 'string' ? error.message : null;
  return { message };
}

async function upload(parts: ReceiptPart[]): Promise<UploadResult> {
  const result = await receiptUpload({ body: { parts } });

  const duplicate = duplicateOf(result.error);
  if (duplicate !== null) return { kind: 'duplicate', message: duplicate.message };

  return { kind: 'outcome', outcome: unwrap(result) };
}

export interface ReceiptUpload {
  submission: ReceiptSubmission;
  submit: (parts: ReceiptPart[]) => void;
}

/**
 * Send one receipt — every part of it in one call, because the parts are one
 * purchase and the gate can only judge them together.
 */
export function useReceiptUpload(): ReceiptUpload {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: upload,
    onSuccess: async (result) => {
      // A created purchase brings its charges with it, and those are exactly
      // what the reconcile queue lists. Nothing else here writes.
      if (result.kind !== 'outcome' || result.outcome.kind !== 'created') return;
      await queryClient.invalidateQueries({ queryKey: RECONCILE_QUEUE_QUERY_KEY });
    },
  });

  return {
    submission: submissionOf(mutation.isPending, mutation.error, mutation.data),
    submit: (parts) => {
      if (parts.length === 0) return;
      mutation.mutate(parts);
    },
  };
}

function submissionOf(
  isPending: boolean,
  failure: Error | null,
  result: UploadResult | undefined
): ReceiptSubmission {
  if (isPending) return { state: 'uploading' };
  if (failure !== null) return { state: 'refused', failure };
  if (result === undefined) return { state: 'idle' };
  return result.kind === 'duplicate'
    ? { state: 'duplicate', message: result.message }
    : { state: 'read', outcome: result.outcome };
}
