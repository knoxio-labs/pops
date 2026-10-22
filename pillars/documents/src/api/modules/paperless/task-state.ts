/**
 * Paperless-ngx 3.x consumption tasks, reduced to the four states a consumer
 * acts on.
 *
 * Read from `GET /api/tasks/?task_id=` at API version 10 (Paperless 3.2.1's
 * default). The fields used, and why each state maps the way it does, come
 * from Paperless's own task bookkeeping (`documents/signals/handlers.py`):
 *
 * - `pending` / `started` are still running.
 * - `success` with `result_data.document_id` created a document.
 * - A duplicate is recorded as `failure` with `result_data.duplicate_of`
 *   (the post-run handler flips the status), so it is checked before the
 *   generic failure.
 * - `success` without a `document_id` is a consume a plugin stopped (barcode
 *   split, workflow deletion): no document exists for this upload.
 * - `revoked` was cancelled before it ran.
 */
import { z } from 'zod';

/** What a consumer does next with an upload. */
export type PaperlessTaskState = 'pending' | 'done' | 'duplicate' | 'failed';

/** One consumption task as this pillar reports it. */
export interface PaperlessTaskStatus {
  readonly state: PaperlessTaskState;
  /** The created document on `done`, the existing one on `duplicate`, otherwise `null`. */
  readonly documentId: number | null;
  /** Why the task did not produce a new document, when Paperless says. */
  readonly reason: string | null;
}

const REASON_MAX_LENGTH = 500;

const RawTaskSchema = z.object({
  task_id: z.string(),
  status: z.enum(['pending', 'started', 'success', 'failure', 'revoked']),
  result_data: z.record(z.string(), z.unknown()).nullable(),
});

/** The paginated v10 task list, of which a `task_id` filter yields zero or one row. */
export const RawTaskPageSchema = z.object({ results: z.array(RawTaskSchema) });

type RawTask = z.infer<typeof RawTaskSchema>;

function positiveInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value.slice(0, REASON_MAX_LENGTH) : null;
}

function failed(reason: string): PaperlessTaskStatus {
  return { state: 'failed', documentId: null, reason };
}

function mapFailure(result: Record<string, unknown>): PaperlessTaskStatus {
  const duplicateOf = positiveInt(result['duplicate_of']);
  if (duplicateOf !== null) {
    return {
      state: 'duplicate',
      documentId: duplicateOf,
      reason:
        result['duplicate_in_trash'] === true
          ? 'The existing document is in the Paperless trash.'
          : null,
    };
  }
  return failed(text(result['error_message']) ?? 'Paperless could not consume the document.');
}

/** Reduce one raw Paperless task to the state a consumer acts on. */
export function mapPaperlessTask(raw: RawTask): PaperlessTaskStatus {
  const result = raw.result_data ?? {};
  switch (raw.status) {
    case 'pending':
    case 'started':
      return { state: 'pending', documentId: null, reason: null };
    case 'success': {
      const documentId = positiveInt(result['document_id']);
      if (documentId !== null) return { state: 'done', documentId, reason: null };
      return failed(text(result['reason']) ?? 'Paperless finished without creating a document.');
    }
    case 'failure':
      return mapFailure(result);
    case 'revoked':
      return failed('The Paperless task was cancelled.');
  }
}
