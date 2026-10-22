import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { InventoryApiError } from '../../inventory-api-helpers.js';
import { client } from '../../inventory-api/client.gen.js';
import { uploadItemDocument } from './document-upload-api';

const ingestion = {
  id: 7,
  itemId: 'item 1',
  taskId: 'task-1',
  documentType: 'receipt',
  title: null,
  fileName: 'till slip.pdf',
  state: 'pending',
  reason: null,
  createdAt: '2026-10-01T00:00:00Z',
};

function respond(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

function sentRequest(fetchSpy: ReturnType<typeof respond>): Request {
  const request = fetchSpy.mock.calls[0]?.[0];
  if (!(request instanceof Request)) throw new Error('fetch was not called with a Request');
  return request;
}

// Node's Request needs an absolute URL; a browser resolves `/inventory-api` against the page.
beforeEach(() => {
  client.setConfig({ baseUrl: 'http://shell.test/inventory-api' });
});

afterEach(() => {
  client.setConfig({ baseUrl: '/inventory-api' });
  vi.restoreAllMocks();
});

describe('uploadItemDocument', () => {
  it('sends the file bytes as the raw body with its MIME type and the naming query', async () => {
    const fetchSpy = respond(202, { data: ingestion });
    const file = new File(['%PDF-1.7 raw'], 'till slip.pdf', { type: 'application/pdf' });

    const result = await uploadItemDocument({
      itemId: 'item 1',
      file,
      documentType: 'receipt',
      title: '  Hardware store  ',
    });

    expect(result).toEqual(ingestion);
    const request = sentRequest(fetchSpy);
    const url = new URL(request.url);
    expect(request.method).toBe('POST');
    expect(url.pathname).toBe('/inventory-api/items/item%201/documents/upload');
    expect(url.searchParams.get('documentType')).toBe('receipt');
    expect(url.searchParams.get('fileName')).toBe('till slip.pdf');
    expect(url.searchParams.get('title')).toBe('Hardware store');
    expect(request.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('hands the File itself to the client with no body serializer', async () => {
    const post = vi.spyOn(client, 'post');
    respond(202, { data: ingestion });
    const file = new File(['%PDF-1.7 raw'], 'till slip.pdf', { type: 'application/pdf' });

    await uploadItemDocument({ itemId: 'item-1', file, documentType: 'receipt' });

    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ body: file, bodySerializer: null })
    );
  });

  it('leaves a blank title out of the query', async () => {
    const fetchSpy = respond(202, { data: ingestion });

    await uploadItemDocument({
      itemId: 'item-1',
      file: new File(['a'], 'a.txt', { type: 'text/plain' }),
      documentType: 'other',
      title: '   ',
    });

    const url = new URL(sentRequest(fetchSpy).url);
    expect(url.searchParams.has('title')).toBe(false);
  });

  it('throws the relayed documents refusal', async () => {
    respond(413, {
      error: { code: 'documents.upload.too_large', message: 'The file is over 100 MB' },
    });

    const upload = uploadItemDocument({
      itemId: 'item-1',
      file: new File(['a'], 'a.pdf', { type: 'application/pdf' }),
      documentType: 'manual',
    });

    await expect(upload).rejects.toBeInstanceOf(InventoryApiError);
    await expect(upload).rejects.toMatchObject({ status: 413 });
  });
});
