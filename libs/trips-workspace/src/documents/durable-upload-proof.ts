import type { DurableUploadRecord } from './durable-upload-api';

/** Retain actual task/original proof when a later read omits it; contradictory identities are refused. */
export function retainDurableRecord(
  known: DurableUploadRecord | null,
  record: DurableUploadRecord
): DurableUploadRecord {
  if (known === null || known.taskId === null) return record;
  if (record.taskId !== null && record.taskId !== known.taskId)
    throw new Error('Documents returned another task for this upload operation.');
  if (
    known.documentId !== null &&
    record.documentId !== null &&
    known.documentId !== record.documentId
  )
    throw new Error('Documents returned another original for this accepted upload task.');
  if (
    record.taskId === null ||
    ((known.state === 'done' || known.state === 'duplicate') && record.documentId === null)
  )
    return known;
  return record;
}
