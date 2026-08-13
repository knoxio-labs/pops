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
 * Every code the pillar sends with a 409 for a receipt it already holds.
 *
 * `ALREADY_IMPORTED` comes from the two checks the receipt route makes before
 * it calls the model. `DUPLICATE_PURCHASE` comes from the write itself, when a
 * second upload of the same bytes gets past those checks because the first had
 * not committed yet — the concurrent case, which is the one a user hits by
 * submitting twice rather than by re-uploading later.
 */
const DUPLICATE_CODES = new Set(['ALREADY_IMPORTED', 'DUPLICATE_PURCHASE']);

/**
 * Read off the code rather than the status so the answer does not depend on a
 * `Response` the transport may not have kept.
 */
function duplicateOf(error: unknown): { message: string | null } | null {
  if (typeof error !== 'object' || error === null) return null;
  if (!('code' in error) || typeof error.code !== 'string') return null;
  if (!DUPLICATE_CODES.has(error.code)) return null;
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
