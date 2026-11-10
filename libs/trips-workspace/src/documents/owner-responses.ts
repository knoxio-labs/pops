import type { PaperlessTask } from './types';

/** Read the identity using the published Documents /paperless/tasks/{taskId} OpenAPI grammar (1–72 characters). */
export function readAcceptedTaskId(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw new Error('Documents did not return a valid upload task identity.');
  }
  const data = payload.data;
  if (
    typeof data !== 'object' ||
    data === null ||
    !('taskId' in data) ||
    typeof data.taskId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,72}$/.test(data.taskId)
  ) {
    throw new Error('Documents did not return a valid upload task identity.');
  }
  return data.taskId;
}

/** Reject malformed owner task states while retaining the accepted task for a status-only retry. */
export function readPaperlessTask(payload: unknown): PaperlessTask {
  if (!isPaperlessTask(payload)) throw new Error('Documents returned an invalid task status.');
  return payload;
}

function isPaperlessTask(value: unknown): value is PaperlessTask {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'state' in value &&
    taskState(value.state) &&
    'documentId' in value &&
    documentIdentity(value.documentId) &&
    'reason' in value &&
    (value.reason === null || typeof value.reason === 'string')
  );
}

function taskState(value: unknown): value is PaperlessTask['state'] {
  return value === 'pending' || value === 'done' || value === 'duplicate' || value === 'failed';
}

function documentIdentity(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
}
