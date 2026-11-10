import { afterEach, describe, expect, it, vi } from 'vitest';

import { SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import { createMobileDocumentsBytesClient } from '../documents/bytes-client.js';
import { closeOpenedApps, get, openWithOptions } from './mobile-inventory-app.js';
import { requestOn } from './test-http.js';

afterEach(closeOpenedApps);
const discovery = { lookup: () => Promise.resolve({ baseUrl: 'http://documents.test' }) };
const key = 'pops_sa_test_fixture';

describe('Documents-original raw files', () => {
  it('requires documents.read independently before contacting the owner', async () => {
    const file = vi.fn(() => Promise.resolve(new Response('bytes')));
    const { app, token } = openWithOptions({ documentBytes: { file } }, [
      'trips.read',
      'inventory.read',
    ]);
    expect((await get(app, null, '/mobile/documents/31/file')).status).toBe(401);
    const denied = await get(app, token, '/mobile/documents/31/file');
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ capability: 'documents.read' });
    expect(file).not.toHaveBeenCalled();
  });
  it.each([200, 206, 416])(
    'streams original bytes and representation/range headers for %s',
    async (status) => {
      const fetchImpl = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response('sample bytes', {
            status,
            headers: {
              'content-type': 'application/pdf',
              'content-length': '12',
              'content-disposition': 'inline; filename="ticket.pdf"',
              'content-range': 'bytes 0-11/40',
              'accept-ranges': 'bytes',
              etag: '"source-etag"',
              'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
              'set-cookie': 'must-not-relay=1',
            },
          })
        )
      );
      const { app, token } = openWithOptions(
        {
          documentBytes: createMobileDocumentsBytesClient({
            discovery,
            fetchImpl,
            apiKey: () => key,
          }),
        },
        ['documents.read']
      );
      const response = await requestOn(app, (r) =>
        r
          .get('/mobile/documents/31/file')
          .set('Authorization', `Bearer ${token}`)
          .set('Range', 'bytes=0-11')
      );
      expect(response.status).toBe(status);
      expect(response.body).toEqual(Buffer.from('sample bytes'));
      expect(response.headers).toMatchObject({
        'content-type': 'application/pdf',
        'content-length': '12',
        'content-disposition': 'inline; filename="ticket.pdf"',
        'content-range': 'bytes 0-11/40',
        'accept-ranges': 'bytes',
        etag: '"source-etag"',
        'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers['cache-control']).toContain('no-store');
      expect(fetchImpl).toHaveBeenCalledWith(
        'http://documents.test/paperless/documents/31/download',
        {
          method: 'GET',
          redirect: 'error',
          headers: { [SERVICE_ACCOUNT_HEADER]: key, range: 'bytes=0-11' },
        }
      );
    }
  );
  it.each([404, 412, 502, 503, 401, 403, 500])(
    'preserves or classifies owner status %s',
    async (status) => {
      const envelope = {
        code: 'documents.test',
        message: 'Source refusal',
        requestId: 'owner-request',
        retryable: status === 503,
      };
      const { app, token } = openWithOptions({
        documentBytes: { file: () => Promise.resolve(Response.json(envelope, { status })) },
      });
      const response = await get(app, token, '/mobile/documents/31/file');
      expect(response.status).toBe([404, 412, 502, 503].includes(status) ? status : 502);
      expect(response.body).toMatchObject({
        ...envelope,
        details: { upstream: { pillar: 'documents', status } },
      });
    }
  );
  it.each(['0', 'no', '1.5'])('rejects invalid ID %s without requesting bytes', async (id) => {
    const file = vi.fn(() => Promise.resolve(null));
    const { app, token } = openWithOptions({ documentBytes: { file } });
    expect((await get(app, token, `/mobile/documents/${id}/file`)).status).toBe(400);
    expect(file).not.toHaveBeenCalled();
  });
  it('reports undiscovered owner, missing credentials and transport failure as unavailable', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new Error('connection refused')));
    for (const deps of [
      { discovery: { lookup: () => Promise.resolve(undefined) }, apiKey: () => key },
      { discovery, apiKey: () => undefined },
      { discovery, apiKey: () => key },
    ]) {
      const { app, token } = openWithOptions({
        documentBytes: createMobileDocumentsBytesClient({ ...deps, fetchImpl }),
      });
      expect((await get(app, token, '/mobile/documents/31/file')).status).toBe(503);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
