import { describe, expect, it, vi } from 'vitest';

import { uploadInventoryDocument } from './inventory-documents.js';

import type { DocumentUploadDeps } from './inventory-documents.js';
import type { DocumentUploadTarget } from './upload-tokens.js';

const TARGET: DocumentUploadTarget = {
  kind: 'document',
  itemId: 'item_1',
  documentType: 'manual',
  fileName: 'm.pdf',
  maxBytes: 8,
  allowedMimeTypes: ['application/pdf'],
};

async function* body(...chunks: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const chunk of chunks) yield chunk;
}

function deps(overrides: Partial<DocumentUploadDeps> = {}): DocumentUploadDeps {
  return {
    discovery: { lookup: () => Promise.resolve({ baseUrl: 'http://inventory-api:3002/' }) },
    apiKey: () => 'sa_mcp',
    fetchImpl: vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ data: { id: 1 } }), { status: 202 }))
    ),
    ...overrides,
  };
}

const request = { body: body(new Uint8Array([1, 2])), contentType: 'application/pdf' };

describe('uploadInventoryDocument', () => {
  it('omits title from the query when there is none', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify({ data: { id: 1 } }), { status: 202 }))
    );
    await uploadInventoryDocument(request, TARGET, deps({ fetchImpl }));
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://inventory-api:3002/items/item_1/documents/upload?documentType=manual&fileName=m.pdf'
    );
  });

  it('is unavailable when inventory is not discoverable', async () => {
    const result = await uploadInventoryDocument(
      request,
      TARGET,
      deps({ discovery: { lookup: () => Promise.resolve(undefined) } })
    );
    expect(result).toEqual({ kind: 'unavailable', message: 'inventory is not discoverable' });
  });

  it('is unavailable without a service-account key', async () => {
    const result = await uploadInventoryDocument(
      request,
      TARGET,
      deps({ apiKey: () => undefined })
    );
    expect(result.kind).toBe('unavailable');
  });

  it('is unavailable when inventory does not answer', async () => {
    const result = await uploadInventoryDocument(
      request,
      TARGET,
      deps({ fetchImpl: vi.fn<typeof fetch>(() => Promise.reject(new TypeError('fetch failed'))) })
    );
    expect(result).toEqual({ kind: 'unavailable', message: 'inventory did not answer' });
  });

  it('is unavailable when a 202 carries no ingestion', async () => {
    const result = await uploadInventoryDocument(
      request,
      TARGET,
      deps({
        fetchImpl: vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 202 }))),
      })
    );
    expect(result.kind).toBe('unavailable');
  });

  it('reports too-large once the streamed body passes the cap', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      await new Response(init?.body).arrayBuffer();
      return new Response('{}', { status: 202 });
    });
    const result = await uploadInventoryDocument(
      { body: body(new Uint8Array(5), new Uint8Array(5)), contentType: 'application/pdf' },
      TARGET,
      deps({ fetchImpl })
    );
    expect(result).toEqual({ kind: 'too-large' });
  });

  it('forwards a body exactly at the cap', async () => {
    let received = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      received = (await new Response(init?.body).arrayBuffer()).byteLength;
      return new Response(JSON.stringify({ data: { id: 1 } }), { status: 202 });
    });
    const result = await uploadInventoryDocument(
      { body: body(new Uint8Array(4), new Uint8Array(4)), contentType: 'application/pdf' },
      TARGET,
      deps({ fetchImpl })
    );
    expect(result).toEqual({ kind: 'accepted', ingestion: { id: 1 } });
    expect(received).toBe(8);
  });
});
