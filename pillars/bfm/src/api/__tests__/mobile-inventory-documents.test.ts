/**
 * `/mobile/inventory/items/:id/documents`, `/mobile/inventory/documents/:id`
 * (+ `/file`) and `/mobile/inventory/document-ingestions/:id`.
 *
 * The contract routes run through a real gateway over a fake inventory
 * handle; the raw upload and file run through the real bytes client over a
 * recording `fetch`, so the upstream path, method and headers are asserted
 * as inventory would receive them.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { SERVICE_ACCOUNT_HEADER, type CallResult } from '@pops/pillar-sdk/server';
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import { createMobileInventoryDocumentBytesClient } from '../inventory/document-bytes-client.js';
import { createMobileInventoryDocumentsClient } from '../inventory/documents-client.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { closeOpenedApps, openWithOptions } from './mobile-inventory-app.js';
import { requestOn } from './test-http.js';

import type { MobileCapability } from '../../contract/capabilities.js';
import type { PillarHandleFactory } from '../pillars/gateway.js';

afterEach(closeOpenedApps);

const KEY = 'pops_sa_TESTTEST.testsecret_not_a_real_key_000000';
const INVENTORY_URL = 'http://inventory.test';

const linkRow = (id: number) => ({
  id,
  itemId: 'item-1',
  paperlessDocumentId: 100 + id,
  documentType: 'receipt',
  title: `Doc ${String(id)}`,
  createdAt: '2026-10-01T00:00:00.000Z',
  missing: false,
});

const ingestionRow = (id: number, state: 'pending' | 'failed') => ({
  id,
  itemId: 'item-1',
  taskId: `task-${String(id)}`,
  documentType: 'manual',
  title: null,
  fileName: 'manual.pdf',
  state,
  reason: state === 'failed' ? 'Paperless refused it' : null,
  createdAt: '2026-10-02T00:00:00.000Z',
});

const envelope = (code: string, status: number, details?: Record<string, unknown>) => ({
  code,
  message: `upstream ${String(status)}`,
  requestId: 'req-upstream',
  retryable: status === 503,
  ...(details === undefined ? {} : { details }),
});

type Procedure = (input: unknown) => Promise<CallResult<unknown>>;

interface Recorded {
  path: string;
  input: unknown;
}

function documentsFactory(
  routes: Partial<Record<'listForItem' | 'update' | 'unlink' | 'dismissIngestion', Procedure>>,
  calls: Recorded[]
): PillarHandleFactory {
  const recorded = Object.fromEntries(
    Object.entries(routes).map(([name, procedure]) => [
      name,
      (input: unknown) => {
        calls.push({ path: `documents.${name}`, input });
        return procedure(input);
      },
    ])
  );
  return <TRouter>(pillarId: string) =>
    fakePillarHandle<TRouter>(pillarId, { documents: recorded });
}

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

function recordingFetch(respond: (call: FetchCall) => Response): {
  fetchImpl: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const body = init?.body instanceof ReadableStream ? await new Response(init.body).text() : null;
    const call: FetchCall = {
      url: input instanceof Request ? input.url : String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(headers.entries()),
      body,
    };
    calls.push(call);
    return respond(call);
  };
  return { fetchImpl, calls };
}

function open(
  options: {
    factory?: PillarHandleFactory;
    fetchImpl?: typeof fetch;
    discoverable?: boolean;
  },
  capabilities?: readonly MobileCapability[]
) {
  return openWithOptions(
    {
      ...(options.factory === undefined
        ? {}
        : {
            inventoryDocuments: createMobileInventoryDocumentsClient(
              createPillarGateway(options.factory)
            ),
          }),
      inventoryDocumentBytes: createMobileInventoryDocumentBytesClient({
        discovery: {
          lookup: () =>
            Promise.resolve(
              options.discoverable === false ? undefined : { baseUrl: `${INVENTORY_URL}/` }
            ),
        },
        apiKey: () => KEY,
        ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
      }),
    },
    capabilities
  );
}

describe('GET /mobile/inventory/items/:id/documents', () => {
  it('maps data/pending/failed to linked/pending/failed', async () => {
    const calls: Recorded[] = [];
    const factory = documentsFactory(
      {
        listForItem: () =>
          Promise.resolve({
            kind: 'ok',
            value: {
              data: [linkRow(1)],
              pending: [ingestionRow(7, 'pending')],
              failed: [ingestionRow(8, 'failed')],
              pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
            },
          }),
      },
      calls
    );
    const { app, token } = open({ factory });

    const res = await requestOn(app, (r) =>
      r.get('/mobile/inventory/items/item-1/documents').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    expect(calls).toEqual([
      { path: 'documents.listForItem', input: { itemId: 'item-1', limit: 500, offset: 0 } },
    ]);
    expect(res.body).toEqual({
      linked: [
        {
          id: 1,
          paperlessDocumentId: 101,
          documentType: 'receipt',
          title: 'Doc 1',
          createdAt: '2026-10-01T00:00:00.000Z',
          missing: false,
        },
      ],
      pending: [
        {
          id: 7,
          documentType: 'manual',
          title: null,
          fileName: 'manual.pdf',
          state: 'pending',
          reason: null,
          createdAt: '2026-10-02T00:00:00.000Z',
        },
      ],
      failed: [expect.objectContaining({ id: 8, state: 'failed', reason: 'Paperless refused it' })],
    });
  });

  it('follows inventory pages until there are no more', async () => {
    const calls: Recorded[] = [];
    let page = 0;
    const factory = documentsFactory(
      {
        listForItem: () => {
          page += 1;
          return Promise.resolve({
            kind: 'ok',
            value: {
              data: [linkRow(page)],
              pending: [],
              failed: [],
              pagination: { total: 2, limit: 500, offset: page - 1, hasMore: page === 1 },
            },
          });
        },
      },
      calls
    );
    const { app, token } = open({ factory });

    const res = await requestOn(app, (r) =>
      r.get('/mobile/inventory/items/item-1/documents').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.linked.map((row: { id: number }) => row.id)).toEqual([1, 2]);
    expect(calls.map((call) => call.input)).toEqual([
      { itemId: 'item-1', limit: 500, offset: 0 },
      { itemId: 'item-1', limit: 500, offset: 1 },
    ]);
  });

  it('answers 502 when inventory sends a shape it cannot read', async () => {
    const factory = documentsFactory(
      { listForItem: () => Promise.resolve({ kind: 'ok', value: { data: 'nope' } }) },
      []
    );
    const { app, token } = open({ factory });

    const res = await requestOn(app, (r) =>
      r.get('/mobile/inventory/items/item-1/documents').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('bfm.upstream.contract_mismatch');
  });

  it('refuses a device without inventory.read before calling inventory', async () => {
    const calls: Recorded[] = [];
    const { app, token } = open({ factory: documentsFactory({}, calls) }, ['session.read']);

    const res = await requestOn(app, (r) =>
      r.get('/mobile/inventory/items/item-1/documents').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(403);
    expect(res.body.capability).toBe('inventory.read');
    expect(calls).toEqual([]);
  });

  it('refuses an unauthenticated caller', async () => {
    const { app } = open({ factory: documentsFactory({}, []) });

    const res = await requestOn(app, (r) => r.get('/mobile/inventory/items/item-1/documents'));

    expect(res.status).toBe(401);
  });
});

describe('PATCH /mobile/inventory/documents/:id', () => {
  const updated = { kind: 'ok' as const, value: { data: linkRow(3), message: 'Document updated' } };

  it('sends the fields to documents.update and answers the link', async () => {
    const calls: Recorded[] = [];
    const factory = documentsFactory({ update: () => Promise.resolve(updated) }, calls);
    const { app, token } = open({ factory });

    const res = await requestOn(app, (r) =>
      r
        .patch('/mobile/inventory/documents/3')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Warranty card', documentType: 'warranty' })
    );

    expect(res.status).toBe(200);
    expect(calls).toEqual([
      {
        path: 'documents.update',
        input: { id: 3, title: 'Warranty card', documentType: 'warranty' },
      },
    ]);
    expect(res.body).toEqual({
      id: 3,
      paperlessDocumentId: 103,
      documentType: 'receipt',
      title: 'Doc 3',
      createdAt: '2026-10-01T00:00:00.000Z',
    });
  });

  it('answers 412 with the producer code when Paperless is not connected', async () => {
    const factory = documentsFactory(
      {
        update: () =>
          Promise.resolve({
            kind: 'refused',
            pillar: 'inventory',
            status: 412,
            ...envelope('documents.paperless.not_configured', 412),
          }),
      },
      []
    );
    const { app, token } = open({ factory });

    const res = await requestOn(app, (r) =>
      r
        .patch('/mobile/inventory/documents/3')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'X' })
    );

    expect(res.status).toBe(412);
    expect(res.body).toMatchObject({
      code: 'documents.paperless.not_configured',
      details: { upstream: { pillar: 'inventory', status: 412 } },
    });
  });

  it('relays 404 for an unknown link', async () => {
    const factory = documentsFactory(
      {
        update: () =>
          Promise.resolve({
            kind: 'not-found',
            pillar: 'inventory',
            ...envelope('inventory.documents.not_found', 404),
          }),
      },
      []
    );
    const { app, token } = open({ factory });

    const res = await requestOn(app, (r) =>
      r
        .patch('/mobile/inventory/documents/99')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'X' })
    );

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('inventory.documents.not_found');
  });

  it('refuses an unknown field or a non-numeric id without calling inventory', async () => {
    const calls: Recorded[] = [];
    const factory = documentsFactory({ update: () => Promise.resolve(updated) }, calls);
    const { app, token } = open({ factory });

    const extra = await requestOn(app, (r) =>
      r
        .patch('/mobile/inventory/documents/3')
        .set('Authorization', `Bearer ${token}`)
        .send({ itemId: 'x' })
    );
    const badId = await requestOn(app, (r) =>
      r
        .patch('/mobile/inventory/documents/abc')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'X' })
    );

    expect(extra.status).toBe(400);
    expect(badId.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('needs inventory.write', async () => {
    const { app, token } = open({ factory: documentsFactory({}, []) }, ['inventory.read']);

    const res = await requestOn(app, (r) =>
      r
        .patch('/mobile/inventory/documents/3')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'X' })
    );

    expect(res.status).toBe(403);
    expect(res.body.capability).toBe('inventory.write');
  });
});

describe('DELETE unlink and dismiss', () => {
  const message = { kind: 'ok' as const, value: { message: 'done' } };

  it.each([
    ['/mobile/inventory/documents/4', 'documents.unlink'],
    ['/mobile/inventory/document-ingestions/4', 'documents.dismissIngestion'],
  ])('%s calls %s and answers the id', async (path, operation) => {
    const calls: Recorded[] = [];
    const factory = documentsFactory(
      { unlink: () => Promise.resolve(message), dismissIngestion: () => Promise.resolve(message) },
      calls
    );
    const { app, token } = open({ factory });

    const res = await requestOn(app, (r) => r.delete(path).set('Authorization', `Bearer ${token}`));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 4 });
    expect(calls).toEqual([{ path: operation, input: { id: 4 } }]);
  });

  it.each(['/mobile/inventory/documents/4', '/mobile/inventory/document-ingestions/4'])(
    '%s relays 404',
    async (path) => {
      const notFound = (): Promise<CallResult<unknown>> =>
        Promise.resolve({
          kind: 'not-found',
          pillar: 'inventory',
          ...envelope('inventory.documents.not_found', 404),
        });
      const factory = documentsFactory({ unlink: notFound, dismissIngestion: notFound }, []);
      const { app, token } = open({ factory });

      const res = await requestOn(app, (r) =>
        r.delete(path).set('Authorization', `Bearer ${token}`)
      );

      expect(res.status).toBe(404);
    }
  );
});

describe('POST /mobile/inventory/items/:id/documents (raw upload)', () => {
  const accepted = () => Response.json({ data: ingestionRow(9, 'pending') }, { status: 202 });

  it('streams the body to the inventory upload route with its query and type', async () => {
    const upstream = recordingFetch(accepted);
    const { app, token } = open({ fetchImpl: upstream.fetchImpl });

    const res = await requestOn(app, (r) =>
      r
        .post('/mobile/inventory/items/item%201/documents')
        .query({ documentType: 'receipt', fileName: 'r.pdf', title: 'Till receipt' })
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/pdf')
        .send(Buffer.from('%PDF-1.7 bytes'))
    );

    expect(res.status).toBe(202);
    expect(res.body).toEqual({
      id: 9,
      documentType: 'manual',
      title: null,
      fileName: 'manual.pdf',
      state: 'pending',
      reason: null,
      createdAt: '2026-10-02T00:00:00.000Z',
    });
    expect(upstream.calls).toHaveLength(1);
    const [call] = upstream.calls;
    const url = new URL(call?.url ?? '');
    expect(call?.method).toBe('POST');
    expect(url.origin + url.pathname).toBe(`${INVENTORY_URL}/items/item%201/documents/upload`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      documentType: 'receipt',
      fileName: 'r.pdf',
      title: 'Till receipt',
    });
    expect(call?.headers['content-type']).toBe('application/pdf');
    expect(call?.headers[SERVICE_ACCOUNT_HEADER.toLowerCase()]).toBe(KEY);
    expect(call?.body).toBe('%PDF-1.7 bytes');
  });

  it.each([
    [413, 'inventory.documents.too_large', { maxUploadBytes: 104857600 }],
    [415, 'documents.upload.unsupported_type', { allowedMimeTypes: ['application/pdf'] }],
    [412, 'documents.paperless.not_configured', undefined],
    [404, 'inventory.documents.item_not_found', undefined],
  ])('passes inventory %i through with its envelope', async (status, code, details) => {
    const upstream = recordingFetch(() =>
      Response.json(envelope(code, status, details), { status })
    );
    const { app, token } = open({ fetchImpl: upstream.fetchImpl });

    const res = await requestOn(app, (r) =>
      r
        .post('/mobile/inventory/items/item-1/documents')
        .query({ documentType: 'receipt', fileName: 'r.pdf' })
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/pdf')
        .send(Buffer.from('x'))
    );

    expect(res.status).toBe(status);
    expect(res.body).toMatchObject({
      code,
      requestId: 'req-upstream',
      details: { ...details, upstream: { pillar: 'inventory', status } },
    });
  });

  it('answers 502 misconfigured when inventory refuses bfm credential', async () => {
    const upstream = recordingFetch(() => new Response('nope', { status: 403 }));
    const { app, token } = open({ fetchImpl: upstream.fetchImpl });

    const res = await requestOn(app, (r) =>
      r
        .post('/mobile/inventory/items/item-1/documents')
        .query({ documentType: 'receipt', fileName: 'r.pdf' })
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/pdf')
        .send(Buffer.from('x'))
    );

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('bfm.upstream.misconfigured');
  });

  it('answers 503 when inventory cannot be reached', async () => {
    const { app, token } = open({ discoverable: false });

    const res = await requestOn(app, (r) =>
      r
        .post('/mobile/inventory/items/item-1/documents')
        .query({ documentType: 'receipt', fileName: 'r.pdf' })
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/pdf')
        .send(Buffer.from('x'))
    );

    expect(res.status).toBe(503);
    expect(res.body.retryable).toBe(true);
  });

  it('refuses a missing fileName or an unknown documentType without calling inventory', async () => {
    const upstream = recordingFetch(accepted);
    const { app, token } = open({ fetchImpl: upstream.fetchImpl });

    const responses = await Promise.all(
      [{ documentType: 'receipt' }, { documentType: 'photo', fileName: 'a.jpg' }].map((query) =>
        requestOn(app, (r) =>
          r
            .post('/mobile/inventory/items/item-1/documents')
            .query(query)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-Type', 'application/pdf')
            .send(Buffer.from('x'))
        )
      )
    );

    expect(responses.map((res) => res.status)).toEqual([400, 400]);
    expect(responses[0]?.body.code).toBe('bfm.request.invalid');
    expect(upstream.calls).toEqual([]);
  });

  it('is not consumed by the JSON parser when the declared type is JSON', async () => {
    const upstream = recordingFetch(accepted);
    const { app, token } = open({ fetchImpl: upstream.fetchImpl });

    await requestOn(app, (r) =>
      r
        .post('/mobile/inventory/items/item-1/documents')
        .query({ documentType: 'other', fileName: 'a.json' })
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
        .send('{"a":1}')
    );

    expect(upstream.calls[0]?.body).toBe('{"a":1}');
  });

  it('needs inventory.write, and refuses before reading the body', async () => {
    const upstream = recordingFetch(accepted);
    const { app, token } = open({ fetchImpl: upstream.fetchImpl }, ['inventory.read']);

    const res = await requestOn(app, (r) =>
      r
        .post('/mobile/inventory/items/item-1/documents')
        .query({ documentType: 'receipt', fileName: 'r.pdf' })
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/pdf')
        .send(Buffer.from('x'))
    );

    expect(res.status).toBe(403);
    expect(res.body.capability).toBe('inventory.write');
    expect(upstream.calls).toEqual([]);
  });

  it('refuses an unauthenticated caller', async () => {
    const upstream = recordingFetch(accepted);
    const { app } = open({ fetchImpl: upstream.fetchImpl });

    const res = await requestOn(app, (r) =>
      r
        .post('/mobile/inventory/items/item-1/documents')
        .query({ documentType: 'receipt', fileName: 'r.pdf' })
        .set('Content-Type', 'application/pdf')
        .send(Buffer.from('x'))
    );

    expect(res.status).toBe(401);
    expect(upstream.calls).toEqual([]);
  });
});

describe('GET /mobile/inventory/documents/:id/file (raw)', () => {
  it('forwards Range and streams the 206 back with its headers', async () => {
    const upstream = recordingFetch(
      () =>
        new Response('PDF', {
          status: 206,
          headers: {
            'content-type': 'application/pdf',
            'content-length': '3',
            'content-range': 'bytes 0-2/10',
            'accept-ranges': 'bytes',
            'content-disposition': 'inline; filename="r.pdf"',
            'x-internal': 'not for the phone',
          },
        })
    );
    const { app, token } = open({ fetchImpl: upstream.fetchImpl });

    const res = await requestOn(app, (r) =>
      r
        .get('/mobile/inventory/documents/5/file')
        .set('Authorization', `Bearer ${token}`)
        .set('Range', 'bytes=0-2')
        .buffer(true)
        .parse((response, done) => {
          let text = '';
          response.on('data', (chunk: Buffer) => (text += chunk.toString()));
          response.on('end', () => done(null, text));
        })
    );

    expect(upstream.calls).toHaveLength(1);
    expect(upstream.calls[0]?.url).toBe(`${INVENTORY_URL}/api/inventory/documents/5/file`);
    expect(upstream.calls[0]?.method).toBe('GET');
    expect(upstream.calls[0]?.headers['range']).toBe('bytes=0-2');
    expect(res.status).toBe(206);
    expect(res.body).toBe('PDF');
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-range']).toBe('bytes 0-2/10');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-disposition']).toBe('inline; filename="r.pdf"');
    expect(res.headers['x-internal']).toBeUndefined();
  });

  it('sends no Range when the phone sent none', async () => {
    const upstream = recordingFetch(() => new Response('PDF', { status: 200 }));
    const { app, token } = open({ fetchImpl: upstream.fetchImpl });

    const res = await requestOn(app, (r) =>
      r.get('/mobile/inventory/documents/5/file').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(200);
    expect(upstream.calls[0]?.headers['range']).toBeUndefined();
  });

  it.each([
    [412, 'documents.paperless.not_configured'],
    [404, 'inventory.documents.not_found'],
  ])('relays %i as JSON', async (status, code) => {
    const upstream = recordingFetch(() => Response.json(envelope(code, status), { status }));
    const { app, token } = open({ fetchImpl: upstream.fetchImpl });

    const res = await requestOn(app, (r) =>
      r.get('/mobile/inventory/documents/5/file').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(status);
    expect(res.body.code).toBe(code);
  });

  it('refuses a non-numeric id without calling inventory', async () => {
    const upstream = recordingFetch(() => new Response('PDF'));
    const { app, token } = open({ fetchImpl: upstream.fetchImpl });

    const res = await requestOn(app, (r) =>
      r.get('/mobile/inventory/documents/0/file').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(400);
    expect(upstream.calls).toEqual([]);
  });

  it('needs inventory.read', async () => {
    const upstream = recordingFetch(() => new Response('PDF'));
    const { app, token } = open({ fetchImpl: upstream.fetchImpl }, ['session.read']);

    const res = await requestOn(app, (r) =>
      r.get('/mobile/inventory/documents/5/file').set('Authorization', `Bearer ${token}`)
    );

    expect(res.status).toBe(403);
    expect(res.body.capability).toBe('inventory.read');
    expect(upstream.calls).toEqual([]);
  });
});
