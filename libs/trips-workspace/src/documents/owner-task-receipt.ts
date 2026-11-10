import type { PaperlessTask } from './types';

/** Resolve an original only from a completed or explicit duplicate owner result. */
export function completedDocumentId(task: PaperlessTask | undefined): number | undefined {
  if (task?.state !== 'done' && task?.state !== 'duplicate') return undefined;
  return task.documentId ?? undefined;
}

/** Keep a verified original when another read supplies no canonical identity for that task. */
export function retainOwnerOriginal(
  known: PaperlessTask | undefined,
  received: PaperlessTask
): PaperlessTask {
  return known !== undefined &&
    completedDocumentId(known) !== undefined &&
    completedDocumentId(received) === undefined
    ? known
    : received;
}
