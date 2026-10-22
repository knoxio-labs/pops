/**
 * `POST /items/:itemId/documents/upload` through the real app and the real
 * upload leg, with only `fetch` and discovery faked: what reaches documents,
 * what documents' answers become, and what is written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { itemDocumentIngestions, type OpenedInventoryDb } from '../../db/index.js';
import {
  appWith,
  DOCUMENTS_BASE_URL,
  documentsError,
  fakeUploads,
  jsonResponse,
  realByteLegs,
  tempInventoryDb,
} from '../__tests__/document-uploads-fixture.js';
import { createTestTransport } from '../__tests__/test-http.js';
import { makeClient } from '../__tests__/test-utils.js';
import {
  createDocumentUploadsClient,
  type DocumentUploadsClient,
} from '../documents/uploads-client.js';

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

const PDF = Buffer.from('%PDF-1.7 a small receipt');

interface Captured {
  url: string;
  headers: Headers;
  body: Buffer;
}

/** A fetch that drains the streamed body, records it, and answers `answer`. */
function capturingFetch(answer: () => Response) {
  const calls: Captured[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
    const body = init?.body;
    const bytes = body instanceof ReadableStream ? await new Response(body).arrayBuffer() : null;
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: Buffer.from(bytes ?? new ArrayBuffer(0)),
    });
    return answer();
  });
  return { fetchImpl, calls };
}

async function itemId(uploads: DocumentUploadsClient): Promise<string> {
  const item = await makeClient(appWith(inventoryDb, uploads)).items.create({ itemName: 'Kettle' });
  return item.data.id;
}

function ingestionRows() {
  return inventoryDb.db.select().from(itemDocumentIngestions).all();
}

function post(uploads: DocumentUploadsClient, path: string, contentType = 'application/pdf') {
  return requestOn(appWith(inventoryDb, uploads))
    .post(path)
    .set('Content-Type', contentType)
    .send(PDF);
}

describe('an accepted upload', () => {
  it('streams the bytes to documents and answers 202 with the pending ingestion it wrote', async () => {
    const { fetchImpl, calls } = capturingFetch(() =>
      jsonResponse(202, { data: { taskId: 'task-1' } })
    );
    const uploads = realByteLegs(fetchImpl);
    const id = await itemId(uploads);

    const res = await post(
      uploads,
      `/items/${id}/documents/upload?documentType=receipt&fileName=receipt.pdf&title=Kettle%20receipt`
    );

    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({
      itemId: id,
      taskId: 'task-1',
      documentType: 'receipt',
      title: 'Kettle receipt',
      fileName: 'receipt.pdf',
      state: 'pending',
      reason: null,
    });
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(
      `${DOCUMENTS_BASE_URL}/paperless/documents?fileName=receipt.pdf&title=Kettle+receipt`
    );
    expect(call?.headers.get('content-type')).toBe('application/pdf');
    expect(call?.headers.get('content-length')).toBe(String(PDF.length));
    expect(call?.body.equals(PDF)).toBe(true);
    expect(ingestionRows()).toEqual([
      expect.objectContaining({ id: res.body.data.id, taskId: 'task-1', state: 'pending' }),
    ]);
  });

  it('records no title when none was given, and sends none to documents', async () => {
    const { fetchImpl, calls } = capturingFetch(() =>
      jsonResponse(202, { data: { taskId: 'task-2' } })
    );
    const uploads = realByteLegs(fetchImpl);
    const id = await itemId(uploads);

    const res = await post(
      uploads,
      `/items/${id}/documents/upload?documentType=manual&fileName=m.pdf`
    );

    expect(res.status).toBe(202);
    expect(res.body.data.title).toBeNull();
    expect(new URL(calls[0]?.url ?? '').searchParams.has('title')).toBe(false);
  });
});

describe('a refused upload', () => {
  it.each([
    [413, 'documents.upload.too_large'],
    [415, 'documents.upload.unsupported_type'],
    [412, 'documents.paperless.not_configured'],
    [422, 'documents.upload.rejected'],
    [503, 'documents.paperless.unavailable'],
  ])(
    'passes documents %i through as documents worded it and writes nothing',
    async (status, code) => {
      const { fetchImpl } = capturingFetch(() =>
        jsonResponse(
          status,
          documentsError(code, `documents said ${status}`, { from: 'documents' })
        )
      );
      const uploads = realByteLegs(fetchImpl);
      const id = await itemId(uploads);

      const res = await post(
        uploads,
        `/items/${id}/documents/upload?documentType=receipt&fileName=r.pdf`
      );

      expect(res.status).toBe(status);
      expect(res.body).toMatchObject({
        code,
        message: `documents said ${status}`,
        details: { from: 'documents' },
      });
      expect(ingestionRows()).toEqual([]);
    }
  );

  it('turns a status documents does not define for uploads into a 502', async () => {
    const { fetchImpl } = capturingFetch(() =>
      jsonResponse(404, documentsError('pillar.route.not_found', 'no such route'))
    );
    const uploads = realByteLegs(fetchImpl);
    const id = await itemId(uploads);

    const res = await post(
      uploads,
      `/items/${id}/documents/upload?documentType=receipt&fileName=r.pdf`
    );

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('inventory.documents.upstream_failure');
    expect(ingestionRows()).toEqual([]);
  });

  it('turns a 202 without a task id into a 502 and writes nothing', async () => {
    const { fetchImpl } = capturingFetch(() => jsonResponse(202, { data: {} }));
    const uploads = realByteLegs(fetchImpl);
    const id = await itemId(uploads);

    const res = await post(
      uploads,
      `/items/${id}/documents/upload?documentType=receipt&fileName=r.pdf`
    );

    expect(res.status).toBe(502);
    expect(ingestionRows()).toEqual([]);
  });
});

describe('an upload refused before any byte is forwarded', () => {
  it('answers 404 for an unknown item', async () => {
    const { fetchImpl } = capturingFetch(() => jsonResponse(202, { data: { taskId: 't' } }));

    const res = await post(
      realByteLegs(fetchImpl),
      '/items/no-such-item/documents/upload?documentType=receipt&fileName=r.pdf'
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('inventory.documents.item_not_found');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown document type', 'documentType=photo&fileName=r.pdf'],
    ['no document type', 'fileName=r.pdf'],
    ['no file name', 'documentType=receipt'],
    ['an empty file name', 'documentType=receipt&fileName='],
  ])('answers 400 for %s', async (_case, query) => {
    const { fetchImpl } = capturingFetch(() => jsonResponse(202, { data: { taskId: 't' } }));
    const uploads = realByteLegs(fetchImpl);
    const id = await itemId(uploads);

    const res = await post(uploads, `/items/${id}/documents/upload?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('inventory.documents.invalid_upload');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(ingestionRows()).toEqual([]);
  });
});

describe('an upload documents never answers', () => {
  it('answers 503 when the connection fails within the cap documents states', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    const uploads = realByteLegs(fetchImpl, { maxUploadBytes: async () => 1024 });
    const id = await itemId(uploads);

    const res = await post(
      uploads,
      `/items/${id}/documents/upload?documentType=receipt&fileName=r.pdf`
    );

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('inventory.documents.unavailable');
    expect(ingestionRows()).toEqual([]);
  });

  it('answers 413 when documents cut a body that passed the cap it states', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const body = init?.body;
      if (body instanceof ReadableStream) await new Response(body).arrayBuffer();
      throw new TypeError('fetch failed', { cause: { code: 'EPIPE' } });
    });
    const uploads = realByteLegs(fetchImpl, { maxUploadBytes: async () => PDF.length - 1 });
    const id = await itemId(uploads);

    const res = await post(
      uploads,
      `/items/${id}/documents/upload?documentType=receipt&fileName=r.pdf`
    );

    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({
      code: 'inventory.documents.too_large',
      details: { maxUploadBytes: PDF.length - 1 },
    });
    expect(ingestionRows()).toEqual([]);
  });

  it('answers 503 when documents is not registered', async () => {
    const unregistered = createDocumentUploadsClient({
      lookupDocumentsPillar: () => Promise.resolve(undefined),
      fetchImpl: vi.fn<typeof fetch>(),
    });
    const uploads = fakeUploads({
      upload: unregistered.upload,
      maxUploadBytes: async () => null,
    });
    const id = await itemId(uploads);

    const res = await post(
      uploads,
      `/items/${id}/documents/upload?documentType=receipt&fileName=r.pdf`
    );

    expect(res.status).toBe(503);
    expect(ingestionRows()).toEqual([]);
  });
});

describe('a deleted item', () => {
  it('refuses an upload for an item that has been deleted, forwarding nothing', async () => {
    const { fetchImpl } = capturingFetch(() => jsonResponse(202, { data: { taskId: 't' } }));
    const uploads = realByteLegs(fetchImpl);
    const id = await itemId(uploads);
    await makeClient(appWith(inventoryDb, uploads)).items.delete(id);

    const res = await post(
      uploads,
      `/items/${id}/documents/upload?documentType=receipt&fileName=r.pdf`
    );

    expect(res.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
