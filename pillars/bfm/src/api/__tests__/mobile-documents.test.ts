import { afterEach, describe, expect, it, vi } from 'vitest';

import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import { createMobileDocumentsClient } from '../documents/client.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { closeOpenedApps, get, openWithOptions } from './mobile-inventory-app.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../pillars/gateway.js';

const source = {
  id: 31,
  title: 'Ticket',
  created: '2028-01-02',
  originalFileName: 'ticket.pdf',
  thumbnailUrl: '/documents/31/thumbnail',
};
afterEach(closeOpenedApps);
function client(result: CallResult<unknown>, calls: { pillar: string; input: unknown }[] = []) {
  const factory: PillarHandleFactory = <TRouter>(pillar: string) =>
    fakePillarHandle<TRouter>(pillar, {
      paperless: {
        get: (input: unknown) => {
          calls.push({ pillar, input });
          return Promise.resolve(result);
        },
      },
    });
  return createMobileDocumentsClient(createPillarGateway(factory));
}

describe('Documents-original metadata', () => {
  it('requires device authentication and independent documents.read authority', async () => {
    const getDocument = vi.fn(client({ kind: 'ok', value: { data: source } }).getDocument);
    const { app, token } = openWithOptions(
      { documents: { ...client({ kind: 'ok', value: { data: source } }), getDocument } },
      ['trips.read', 'inventory.read']
    );
    expect((await get(app, null, '/mobile/documents/31')).status).toBe(401);
    const denied = await get(app, token, '/mobile/documents/31');
    expect(denied.status).toBe(403);
    expect(denied.body).toMatchObject({ capability: 'documents.read' });
    expect(getDocument).not.toHaveBeenCalled();
  });
  it('reads the original identity directly from its owner and invents no file metadata', async () => {
    const calls: { pillar: string; input: unknown }[] = [];
    const { app, token } = openWithOptions(
      { documents: client({ kind: 'ok', value: { data: source } }, calls) },
      ['documents.read']
    );
    const response = await get(app, token, '/mobile/documents/31');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(source);
    expect(calls).toEqual([{ pillar: 'documents', input: { id: 31 } }]);
    expect(response.headers['cache-control']).toContain('no-store');
  });
  it.each([
    { kind: 'not-found', expected: 404 },
    { kind: 'refused', status: 412, expected: 412 },
    { kind: 'unauthorized', expected: 502 },
    { kind: 'unauthorized', status: 403, expected: 502 },
    { kind: 'unavailable', expected: 503 },
  ] as const)('preserves owner $kind distinctly', async (testCase) => {
    const { expected, ...failure } = testCase;
    const { app, token } = openWithOptions({
      documents: client({ ...failure, pillar: 'documents' }),
    });
    const response = await get(app, token, '/mobile/documents/31');
    expect(response.status).toBe(expected);
    expect(response.body).toMatchObject({ details: { upstream: { pillar: 'documents' } } });
  });
  it.each([{}, { data: { ...source, id: 32 } }, { data: { ...source, title: 42 } }])(
    'rejects malformed or mismatched original %#',
    async (value) => {
      const { app, token } = openWithOptions({ documents: client({ kind: 'ok', value }) });
      expect((await get(app, token, '/mobile/documents/31')).status).toBe(502);
    }
  );
  it.each(['0', '-1', 'no', '1.5'])(
    'rejects invalid original ID %s before source access',
    async (id) => {
      const getDocument = vi.fn(client({ kind: 'ok', value: { data: source } }).getDocument);
      const { app, token } = openWithOptions({
        documents: { ...client({ kind: 'ok', value: { data: source } }), getDocument },
      });
      expect((await get(app, token, `/mobile/documents/${id}`)).status).toBe(400);
      expect(getDocument).not.toHaveBeenCalled();
    }
  );
});
