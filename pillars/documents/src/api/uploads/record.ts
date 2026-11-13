import { PaperlessTaskStatusSchema } from '../../contract/task-schemas.js';
import { UploadRecordSchema } from '../../contract/upload-schemas.js';
import { uploadOwner } from './owner.js';

import type { UploadRecord } from '../../contract/upload-schemas.js';
import type { UploadRow } from '../../db/schema.js';
import type { PaperlessClient } from '../modules/paperless/client.js';
import type { DispatchGuard } from './dispatch-guard.js';
import type { UploadLedger } from './ledger.js';

function uncertainty(
  guard: 'clear' | 'claimed' | 'unavailable'
): 'guard_unavailable' | 'restored_history' | 'dispatch_unproven' {
  if (guard === 'unavailable') return 'guard_unavailable';
  if (guard === 'claimed') return 'restored_history';
  return 'dispatch_unproven';
}

/** Present retained proof without treating a rolled-back or interrupted claim as unsent. */
export function projectUploadRecord(
  row: UploadRow,
  guard: DispatchGuard,
  client: PaperlessClient | null
): UploadRecord {
  const status =
    row.state === 'awaiting_content' || row.state === 'admitted' ? guard.status(row) : 'clear';
  const state = row.state === 'dispatching' || status !== 'clear' ? 'outcome_unknown' : row.state;
  return UploadRecordSchema.parse({
    input: JSON.parse(row.input),
    state,
    ...(state === 'outcome_unknown' ? { blockedBy: uncertainty(status) } : {}),
    taskId: row.taskId,
    documentId: row.documentId,
    reason: row.reason,
    contentAvailable: row.contentAvailable,
    ownerMatches: uploadOwner(client) === row.owner,
  });
}

/** Settle only the retained task through its original owner; unavailable task reads preserve the receipt. */
export async function refreshUploadTask(
  ledger: UploadLedger,
  row: UploadRow,
  client: PaperlessClient | null
): Promise<UploadRow> {
  if (
    row.state !== 'accepted' ||
    row.taskId === null ||
    client === null ||
    uploadOwner(client) !== row.owner
  )
    return row;
  try {
    const result = PaperlessTaskStatusSchema.safeParse(await client.getTask(row.taskId));
    if (!result.success) return row;
    const task = result.data;
    if (task.state === 'pending') return row;
    if (task.state !== 'failed' && task.documentId === null) return row;
    return ledger.complete(row, {
      state: task.state,
      documentId: task.documentId,
      reason: task.reason,
    });
  } catch {
    return row;
  }
}
