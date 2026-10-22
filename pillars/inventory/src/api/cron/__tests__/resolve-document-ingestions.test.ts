import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedInventoryItem } from '../../../db/__tests__/item-fixture.js';
import { openMigratedTestDb } from '../../../db/__tests__/migrated-db.js';
import { documentIngestionsService, itemDocuments } from '../../../db/index.js';
import { taskTable } from '../../__tests__/document-uploads-fixture.js';
import {
  DOCUMENT_INGESTION_SWEEP_MS,
  startDocumentIngestionSweep,
  sweepDocumentIngestions,
} from '../resolve-document-ingestions.js';

import type { InventoryDb } from '../../../db/index.js';
import type { PaperlessTaskStatus } from '../../documents/uploads-client.js';

let db: InventoryDb;

beforeEach(() => {
  ({ db } = openMigratedTestDb());
});

afterEach(() => {
  vi.useRealTimers();
});

function seedUploads(): void {
  for (const [name, taskId] of [
    ['Toaster', 'task-done'],
    ['Blender', 'task-failed'],
    ['Mixer', 'task-waiting'],
  ] as const) {
    const itemId = seedInventoryItem(db, { name }).id;
    documentIngestionsService.create(db, {
      itemId,
      taskId,
      documentType: 'manual',
      title: null,
      fileName: `${taskId}.pdf`,
    });
  }
}

const tasks = new Map<string, PaperlessTaskStatus | 'unreachable'>([
  ['task-done', { state: 'done', documentId: 9, reason: null }],
  ['task-failed', { state: 'failed', documentId: null, reason: 'Corrupt' }],
  ['task-waiting', { state: 'pending', documentId: null, reason: null }],
]);

describe('sweepDocumentIngestions', () => {
  it('settles every item and leaves the same state on a second run', async () => {
    seedUploads();
    const uploads = { taskStatus: vi.fn(taskTable(tasks)) };

    const first = await sweepDocumentIngestions({ db, uploads });
    const afterFirst = {
      links: db.select().from(itemDocuments).all(),
      ingestions: documentIngestionsService.listPending(db),
    };
    const second = await sweepDocumentIngestions({ db, uploads });

    expect(first).toEqual({
      linked: 1,
      alreadyLinked: 0,
      failed: 1,
      stillPending: 1,
      unreachable: 0,
    });
    expect(second).toEqual({
      linked: 0,
      alreadyLinked: 0,
      failed: 0,
      stillPending: 1,
      unreachable: 0,
    });
    expect(db.select().from(itemDocuments).all()).toEqual(afterFirst.links);
    expect(afterFirst.links).toEqual([expect.objectContaining({ paperlessDocumentId: 9 })]);
    expect(documentIngestionsService.listPending(db)).toEqual(afterFirst.ingestions);
    expect(uploads.taskStatus).toHaveBeenCalledTimes(4);
  });

  it('changes nothing while documents is unreachable', async () => {
    seedUploads();
    const before = documentIngestionsService.listPending(db);

    const counters = await sweepDocumentIngestions({
      db,
      uploads: { taskStatus: async () => ({ kind: 'unreachable' }) },
    });

    expect(counters.unreachable).toBe(3);
    expect(documentIngestionsService.listPending(db)).toEqual(before);
    expect(db.select().from(itemDocuments).all()).toEqual([]);
  });
});

describe('startDocumentIngestionSweep', () => {
  it('sweeps at once, then every five minutes after each sweep settles, until stopped', async () => {
    vi.useFakeTimers();
    const taskStatus = vi.fn(taskTable(tasks));
    seedUploads();

    const sweep = startDocumentIngestionSweep({ db, uploads: { taskStatus } });
    await vi.advanceTimersByTimeAsync(0);
    expect(taskStatus).toHaveBeenCalledTimes(3);

    await vi.advanceTimersByTimeAsync(DOCUMENT_INGESTION_SWEEP_MS - 1);
    expect(taskStatus).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(taskStatus).toHaveBeenCalledTimes(4);

    sweep.stop();
    await vi.advanceTimersByTimeAsync(DOCUMENT_INGESTION_SWEEP_MS * 3);
    expect(taskStatus).toHaveBeenCalledTimes(4);
  });

  it('keeps sweeping after a sweep throws', async () => {
    vi.useFakeTimers();
    const warn = vi.fn();
    seedUploads();
    const taskStatus = vi.fn(taskTable(tasks)).mockRejectedValueOnce(new Error('boom'));

    const sweep = startDocumentIngestionSweep({ db, uploads: { taskStatus }, logger: { warn } });
    await vi.advanceTimersByTimeAsync(0);
    expect(warn).toHaveBeenCalledWith('inventory document ingestion sweep failed', {
      error: 'boom',
    });

    await vi.advanceTimersByTimeAsync(DOCUMENT_INGESTION_SWEEP_MS);
    expect(db.select().from(itemDocuments).all()).toHaveLength(1);
    sweep.stop();
  });
});
