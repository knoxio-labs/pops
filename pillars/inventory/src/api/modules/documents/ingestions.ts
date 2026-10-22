/**
 * Resolving pending item document ingestions against their Paperless tasks.
 *
 * Shared by `GET /items/:itemId/documents`, which resolves that item's rows
 * before listing, and the five-minute cron, which sweeps every pending row
 * so an item nobody opens still settles. Both may run over the same row at
 * once; the db layer makes completing a row a single transaction that the
 * loser finds already gone.
 */
import { documentIngestionsService, type InventoryDb } from '../../../db/index.js';

import type { ItemDocumentIngestionRow } from '../../../db/index.js';
import type { DocumentUploadsClient, PaperlessTaskStatus } from '../../documents/uploads-client.js';

/** The reason recorded when documents answers 404 for a task it handed out. */
export const LOST_TASK_REASON = 'Paperless lost the task';
const FAILED_WITHOUT_REASON = 'Paperless could not consume the file';
const FINISHED_WITHOUT_DOCUMENT = 'Paperless finished the task without a document';

/** What one resolution pass did, row by row. */
export interface ResolveCounters {
  linked: number;
  alreadyLinked: number;
  failed: number;
  stillPending: number;
  unreachable: number;
}

function emptyCounters(): ResolveCounters {
  return { linked: 0, alreadyLinked: 0, failed: 0, stillPending: 0, unreachable: 0 };
}

function fail(
  db: InventoryDb,
  row: ItemDocumentIngestionRow,
  reason: string,
  c: ResolveCounters
): void {
  documentIngestionsService.markFailed(db, row.id, reason);
  c.failed += 1;
}

function applyStatus(
  db: InventoryDb,
  row: ItemDocumentIngestionRow,
  status: PaperlessTaskStatus,
  counters: ResolveCounters
): void {
  if (status.state === 'pending') {
    counters.stillPending += 1;
    return;
  }
  if (status.state === 'failed') {
    fail(db, row, status.reason ?? FAILED_WITHOUT_REASON, counters);
    return;
  }
  if (status.documentId === null) {
    fail(db, row, status.reason ?? FINISHED_WITHOUT_DOCUMENT, counters);
    return;
  }
  const outcome = documentIngestionsService.complete(db, row.id, status.documentId);
  if (outcome === 'linked') counters.linked += 1;
  if (outcome === 'already-linked') counters.alreadyLinked += 1;
}

/**
 * Ask documents about every pending ingestion (or only `itemId`'s) and settle
 * each: `done` and `duplicate` link the document, `failed` and an unknown task
 * mark the row failed, and `pending` or an unreachable documents pillar leave
 * it pending for the next pass. Idempotent.
 */
export async function resolveIngestions(
  db: InventoryDb,
  client: Pick<DocumentUploadsClient, 'taskStatus'>,
  itemId?: string
): Promise<ResolveCounters> {
  const counters = emptyCounters();
  for (const row of documentIngestionsService.listPending(db, itemId)) {
    const lookup = await client.taskStatus(row.taskId);
    if (lookup.kind === 'unreachable') counters.unreachable += 1;
    else if (lookup.kind === 'unknown') fail(db, row, LOST_TASK_REASON, counters);
    else applyStatus(db, row, lookup.status, counters);
  }
  return counters;
}
