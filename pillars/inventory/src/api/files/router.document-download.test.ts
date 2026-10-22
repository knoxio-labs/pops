/**
 * `GET /api/inventory/documents/:id/file` through the real app and the real
 * download leg, with only `fetch` and discovery faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { itemDocuments, type OpenedInventoryDb } from '../../db/index.js';
import {
  appWith,
  DOCUMENTS_BASE_URL,
  documentsError,
  jsonResponse,
  realByteLegs,
  tempInventoryDb,
} from '../__tests__/document-uploads-fixture.js';
import { createTestTransport } from '../__tests__/test-http.js';
import { makeClient } from '../__tests__/test-utils.js';

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

async function seedLink(fetchImpl: typeof fetch): Promise<number> {
  const item = await makeClient(appWith(inventoryDb, realByteLegs(fetchImpl))).items.create({
    itemName: 'Oven',
  });
  const [row] = inventoryDb.db
    .insert(itemDocuments)
    .values({
      itemId: item.data.id,
      paperlessDocumentId: 314,
      documentType: 'manual',
      title: 'Oven',
    })
    .returning()
    .all();
  if (!row) throw new Error('seed failed');
  return row.id;
}

function get(fetchImpl: typeof fetch, path: string) {
  return requestOn(appWith(inventoryDb, realByteLegs(fetchImpl))).get(path);
}

describe('GET /api/inventory/documents/:id/file', () => {
  it('forwards Range and passes a 206 back with its headers and bytes', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response('PDF', {
          status: 206,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': '3',
            'Content-Range': 'bytes 0-2/10',
            'Content-Disposition': 'attachment; filename="oven.pdf"',
            'Accept-Ranges': 'bytes',
            'X-Paperless-Internal': 'not passed',
          },
        })
    );
    const id = await seedLink(fetchImpl);

    const res = await get(fetchImpl, `/api/inventory/documents/${id}/file`)
      .set('Range', 'bytes=0-2')
      .buffer(true);

    expect(fetchImpl).toHaveBeenCalledWith(
      `${DOCUMENTS_BASE_URL}/paperless/documents/314/download`,
      expect.objectContaining({ headers: { Range: 'bytes=0-2' } })
    );
    expect(res.status).toBe(206);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-length']).toBe('3');
    expect(res.headers['content-range']).toBe('bytes 0-2/10');
    expect(res.headers['content-disposition']).toBe('attachment; filename="oven.pdf"');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['x-paperless-internal']).toBeUndefined();
    expect(Buffer.from(res.body as Buffer).toString()).toBe('PDF');
  });

  it('sends no Range when none was asked for, and passes the whole file back', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response('whole', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    );
    const id = await seedLink(fetchImpl);

    const res = await get(fetchImpl, `/api/inventory/documents/${id}/file`);

    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ headers: {} });
    expect(res.status).toBe(200);
    expect(res.text).toBe('whole');
  });

  it('passes a 416 back', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */10' } })
    );
    const id = await seedLink(fetchImpl);

    const res = await get(fetchImpl, `/api/inventory/documents/${id}/file`).set(
      'Range',
      'bytes=99-'
    );

    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe('bytes */10');
  });

  it('answers 404 for an unknown link without asking documents', async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    const res = await get(fetchImpl, '/api/inventory/documents/999/file');

    expect(res.status).toBe(404);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-1'])('answers 400 for link id %s', async (id) => {
    const fetchImpl = vi.fn<typeof fetch>();

    const res = await get(fetchImpl, `/api/inventory/documents/${id}/file`);

    expect(res.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [404, 'documents.paperless.not_found'],
    [412, 'documents.paperless.not_configured'],
    [503, 'documents.paperless.unavailable'],
  ])('relays documents %i', async (status, code) => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse(status, documentsError(code, 'm'))
    );
    const id = await seedLink(fetchImpl);

    const res = await get(fetchImpl, `/api/inventory/documents/${id}/file`);

    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
  });

  it('answers 503 when documents cannot be reached', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    const id = await seedLink(fetchImpl);

    const res = await get(fetchImpl, `/api/inventory/documents/${id}/file`);

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('inventory.documents.unavailable');
  });
});
