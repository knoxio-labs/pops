import type { DurableUploadInput, DurableUploadRecord } from './durable-upload-api';

/** Canonical owner envelope for controlled fetch responses. */
export function uploadWireProof(record: DurableUploadRecord): Response {
  return Response.json({ data: record });
}

/** Admission proof containing only the immutable input actually received by the owner. */
export function awaitingUploadRecord(input: DurableUploadInput): DurableUploadRecord {
  return {
    input,
    ownerMatches: true,
    state: 'awaiting_content',
    contentAvailable: false,
    taskId: null,
    documentId: null,
    reason: null,
  };
}

/** Retained-byte proof after the controlled owner receives content. */
export function admittedUploadRecord(record: DurableUploadRecord): DurableUploadRecord {
  return {
    input: record.input,
    ownerMatches: record.ownerMatches,
    state: 'admitted',
    contentAvailable: true,
    taskId: null,
    documentId: null,
    reason: null,
  };
}

/** Accepted proof using the task identity explicitly supplied by this test owner. */
export function acceptedUploadRecord(
  record: DurableUploadRecord,
  taskId: string
): Extract<DurableUploadRecord, { state: 'accepted' }> {
  return {
    input: record.input,
    ownerMatches: record.ownerMatches,
    state: 'accepted',
    contentAvailable: true,
    taskId,
    documentId: null,
    reason: null,
  };
}

/** Pending task proof never invents an identity absent from the controlled owner's ledger. */
export function pendingUploadRecord(
  record: DurableUploadRecord
): Extract<DurableUploadRecord, { state: 'accepted' }> {
  if (record.taskId === null) throw new Error('The controlled owner has not accepted a task.');
  return acceptedUploadRecord(record, record.taskId);
}

/** Completion proof for the same accepted task and an explicit owner fixture original ID. */
export function completedUploadRecord(
  record: DurableUploadRecord,
  documentId: number
): Extract<DurableUploadRecord, { state: 'done' }> {
  return { ...pendingUploadRecord(record), state: 'done', documentId };
}

/** Lost dispatch acknowledgements retain uncertainty rather than restoring dispatch permission. */
export function unknownUploadRecord(record: DurableUploadRecord): DurableUploadRecord {
  return {
    input: record.input,
    ownerMatches: record.ownerMatches,
    state: 'outcome_unknown',
    contentAvailable: true,
    blockedBy: 'dispatch_unproven',
    taskId: null,
    documentId: null,
    reason: null,
  };
}
