/**
 * Listing an item's documents resolves its pending uploads first; editing a
 * link syncs its title to Paperless; an upload can be dismissed. Driven
 * through the real app with only the documents client faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  documentIngestionsService,
  itemDocuments,
  type OpenedInventoryDb,
} from '../../db/index.js';
import {
  appWith,
  fakeUploads,
  taskTable,
  tempInventoryDb,
} from '../__tests__/document-uploads-fixture.js';
import { createTestTransport } from '../__tests__/test-http.js';
import { makeClient } from '../__tests__/test-utils.js';
import { LOST_TASK_REASON } from '../modules/documents/ingestions.js';

import type { DocumentUploadsClient, PaperlessTaskStatus } from '../documents/uploads-client.js';

const { requestOn } = createTestTransport();
const temp = tempInventoryDb();
let inventoryDb: OpenedInventoryDb;

beforeEach(() => {
  inventoryDb = temp.open();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  temp.close();
});

const done = (documentId: number): PaperlessTaskStatus => ({
  state: 'done',
  documentId,
  reason: null,
});

async function seedItem(): Promise<string> {
  const item = await makeClient(appWith(inventoryDb, fakeUploads())).items.create({
    itemName: 'Washing machine',
  });
  return item.data.id;
}

function upload(itemId: string, taskId: string, title: string | null = null) {
  return documentIngestionsService.create(inventoryDb.db, {
    itemId,
    taskId,
    documentType: 'warranty',
    title,
    fileName: `${taskId}.pdf`,
  });
}

function list(uploads: DocumentUploadsClient, itemId: string) {
  return requestOn(appWith(inventoryDb, uploads)).get(`/items/${itemId}/documents`);
}

describe('GET /items/:itemId/documents', () => {
  it('reports an upload pending, then linked once its task is done', async () => {
    const itemId = await seedItem();
    const ingestion = upload(itemId, 'task-1', 'Warranty card');
    const tasks = new Map<string, PaperlessTaskStatus | 'unreachable'>([
      ['task-1', { state: 'pending', documentId: null, reason: null }],
    ]);
    const uploads = fakeUploads({ taskStatus: taskTable(tasks) });

    const first = await list(uploads, itemId);
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual([]);
    expect(first.body.pending).toEqual([
      expect.objectContaining({ id: ingestion.id, taskId: 'task-1', state: 'pending' }),
    ]);
    expect(first.body.failed).toEqual([]);

    tasks.set('task-1', done(77));
    const second = await list(uploads, itemId);
    expect(second.body.pending).toEqual([]);
    expect(second.body.data).toEqual([
      expect.objectContaining({
        itemId,
        paperlessDocumentId: 77,
        documentType: 'warranty',
        title: 'Warranty card',
        missing: false,
      }),
    ]);
    expect(second.body.pagination).toMatchObject({ total: 1 });
  });

  it('links the existing document for a duplicate', async () => {
    const itemId = await seedItem();
    upload(itemId, 'task-1');
    const uploads = fakeUploads({
      taskStatus: taskTable(
        new Map([['task-1', { state: 'duplicate', documentId: 12, reason: 'Duplicate of 12' }]])
      ),
    });

    const res = await list(uploads, itemId);

    expect(res.body.data).toEqual([
      expect.objectContaining({ paperlessDocumentId: 12, title: 'task-1.pdf' }),
    ]);
    expect(res.body.pending).toEqual([]);
    expect(res.body.failed).toEqual([]);
  });

  it('drops a duplicate of a document the item already links without a second link', async () => {
    const itemId = await seedItem();
    inventoryDb.db
      .insert(itemDocuments)
      .values({ itemId, paperlessDocumentId: 12, documentType: 'receipt', title: 'Original' })
      .run();
    upload(itemId, 'task-1');
    const uploads = fakeUploads({
      taskStatus: taskTable(
        new Map([['task-1', { state: 'duplicate', documentId: 12, reason: null }]])
      ),
    });

    const res = await list(uploads, itemId);

    expect(res.body.data).toEqual([
      expect.objectContaining({ paperlessDocumentId: 12, title: 'Original' }),
    ]);
    expect(res.body.pending).toEqual([]);
    expect(res.body.failed).toEqual([]);
  });

  it('keeps a failed upload with its reason, and asks about it no more', async () => {
    const itemId = await seedItem();
    upload(itemId, 'task-1');
    const taskStatus = vi.fn(
      taskTable(new Map([['task-1', { state: 'failed', documentId: null, reason: 'Not a PDF' }]]))
    );
    const uploads = fakeUploads({ taskStatus });

    const first = await list(uploads, itemId);
    const second = await list(uploads, itemId);

    expect(first.body.failed).toEqual([
      expect.objectContaining({ taskId: 'task-1', state: 'failed', reason: 'Not a PDF' }),
    ]);
    expect(second.body.failed).toEqual(first.body.failed);
    expect(taskStatus).toHaveBeenCalledTimes(1);
  });

  it('fails an upload whose task documents does not know', async () => {
    const itemId = await seedItem();
    upload(itemId, 'task-lost');

    const res = await list(fakeUploads({ taskStatus: taskTable(new Map()) }), itemId);

    expect(res.body.failed).toEqual([
      expect.objectContaining({ taskId: 'task-lost', reason: LOST_TASK_REASON }),
    ]);
  });

  it('fails a finished task that names no document', async () => {
    const itemId = await seedItem();
    upload(itemId, 'task-1');
    const uploads = fakeUploads({
      taskStatus: taskTable(
        new Map([['task-1', { state: 'done', documentId: null, reason: null }]])
      ),
    });

    const res = await list(uploads, itemId);

    expect(res.body.failed).toEqual([expect.objectContaining({ state: 'failed' })]);
    expect(res.body.data).toEqual([]);
  });

  it('leaves uploads pending when documents cannot be reached', async () => {
    const itemId = await seedItem();
    upload(itemId, 'task-1');

    const res = await list(
      fakeUploads({ taskStatus: taskTable(new Map([['task-1', 'unreachable']])) }),
      itemId
    );

    expect(res.status).toBe(200);
    expect(res.body.pending).toEqual([
      expect.objectContaining({ taskId: 'task-1', state: 'pending' }),
    ]);
    expect(res.body.failed).toEqual([]);
  });

  it("only resolves the listed item's uploads", async () => {
    const itemId = await seedItem();
    const otherId = await seedItem();
    upload(otherId, 'task-other');
    const taskStatus = vi.fn(taskTable(new Map()));

    await list(fakeUploads({ taskStatus }), itemId);

    expect(taskStatus).not.toHaveBeenCalled();
  });
});

describe('PATCH /documents/:id', () => {
  function seedLink(itemId: string): number {
    const [row] = inventoryDb.db
      .insert(itemDocuments)
      .values({ itemId, paperlessDocumentId: 55, documentType: 'manual', title: 'Old title' })
      .returning()
      .all();
    if (!row) throw new Error('seed failed');
    return row.id;
  }

  function patch(uploads: DocumentUploadsClient, id: number, body: Record<string, unknown>) {
    return requestOn(appWith(inventoryDb, uploads)).patch(`/documents/${id}`).send(body);
  }

  function linkRow(id: number) {
    return inventoryDb.db
      .select()
      .from(itemDocuments)
      .all()
      .find((row) => row.id === id);
  }

  it('changes only the document type when only it is sent, without calling Paperless', async () => {
    const id = seedLink(await seedItem());
    const updateTitle = vi.fn<DocumentUploadsClient['updateTitle']>();

    const res = await patch(fakeUploads({ updateTitle }), id, { documentType: 'receipt' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id, documentType: 'receipt', title: 'Old title' });
    expect(updateTitle).not.toHaveBeenCalled();
  });

  it('syncs a title change to Paperless and then stores it, leaving the type', async () => {
    const id = seedLink(await seedItem());
    const updateTitle = vi.fn<DocumentUploadsClient['updateTitle']>(async () => ({ ok: true }));

    const res = await patch(fakeUploads({ updateTitle }), id, { title: 'New title' });

    expect(res.status).toBe(200);
    expect(updateTitle).toHaveBeenCalledWith(55, 'New title');
    expect(linkRow(id)).toMatchObject({ title: 'New title', documentType: 'manual' });
  });

  it.each([
    [{ kind: 'unavailable', pillar: 'documents' } as const, 503],
    [{ kind: 'refused', pillar: 'documents', status: 412 } as const, 412],
    [{ kind: 'not-found', pillar: 'documents' } as const, 404],
    [{ kind: 'contract-mismatch', pillar: 'documents', reason: 'x' } as const, 502],
  ])('leaves the link unchanged when the title sync fails (%o → %i)', async (failure, status) => {
    const id = seedLink(await seedItem());
    const uploads = fakeUploads({ updateTitle: async () => ({ ok: false, failure }) });

    const res = await patch(uploads, id, { title: 'New title', documentType: 'receipt' });

    expect(res.status).toBe(status);
    expect(linkRow(id)).toMatchObject({ title: 'Old title', documentType: 'manual' });
  });

  it('answers 404 for an unknown link without calling Paperless', async () => {
    const updateTitle = vi.fn<DocumentUploadsClient['updateTitle']>();

    const res = await patch(fakeUploads({ updateTitle }), 999, { title: 'x' });

    expect(res.status).toBe(404);
    expect(updateTitle).not.toHaveBeenCalled();
  });

  it.each([
    [{ documentType: 'photo' }],
    [{ title: '' }],
    [{ title: 'x'.repeat(129) }],
    [{ paperlessDocumentId: 3 }],
  ])('refuses %o', async (body) => {
    const id = seedLink(await seedItem());

    const res = await patch(fakeUploads(), id, body);

    expect(res.status).toBe(400);
    expect(linkRow(id)).toMatchObject({ title: 'Old title', documentType: 'manual' });
  });
});

describe('DELETE /document-ingestions/:id', () => {
  it('dismisses an upload and answers 404 the second time', async () => {
    const itemId = await seedItem();
    const ingestion = upload(itemId, 'task-1');
    const api = appWith(inventoryDb, fakeUploads());

    const first = await requestOn(api).delete(`/document-ingestions/${ingestion.id}`);
    const second = await requestOn(api).delete(`/document-ingestions/${ingestion.id}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(404);
    expect(documentIngestionsService.listForItem(inventoryDb.db, itemId)).toEqual([]);
  });
});
