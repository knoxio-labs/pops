import { DurableUploadRecoveryRequired } from './durable-upload-operation';

import type { DurableUploadRecord } from './durable-upload-api';
import type { PaperlessTask } from './types';
import type { UploadFields } from './useUploadFields';

/** Project only task/original facts actually present in a validated durable owner record. */
export function durableUploadTask(record: DurableUploadRecord): PaperlessTask | undefined {
  if (record.state === 'accepted') return { state: 'pending', documentId: null, reason: null };
  if (record.state === 'done' || record.state === 'duplicate' || record.state === 'failed')
    return { state: record.state, documentId: record.documentId, reason: record.reason };
  return undefined;
}

/** Deliver late proof only to the originating immutable File intent, retaining previously known original identity. */
export function receiveDurableUpload(
  record: DurableUploadRecord | null,
  fields: UploadFields
): void {
  fields.setUncertain(record?.state === 'outcome_unknown');
  if (record?.taskId !== undefined && record.taskId !== null) {
    fields.setTaskId(record.taskId);
    const task = durableUploadTask(record);
    if (task !== undefined) fields.setTaskReceipt(record.taskId, task);
  }
}

/** A mutation succeeds with an actual accepted task ID; unsent or unknown records never fabricate one. */
export function acceptedDurableTask(record: DurableUploadRecord): string {
  if (record.taskId === null) throw new DurableUploadRecoveryRequired();
  return record.taskId;
}
