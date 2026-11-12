import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetSharedOpenApiCache, __resetSharedPillarClient } from '@pops/pillar-sdk/client';
import {
  __resetServerPillarCache,
  __resetServerSdkConfig,
  configureServerSdk,
} from '@pops/pillar-sdk/server';

import { closeOpenedApps, get, openWithOptions } from '../__tests__/mobile-inventory-app.js';
import { sdkWireFactory, type WireOperation } from '../__tests__/sdk-wire.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { createMobileDocumentsClient } from './client.js';

const operations: readonly WireOperation[] = [
  { operationId: 'paperless.status', method: 'get', path: '/paperless/status' },
  { operationId: 'paperless.task', method: 'get', path: '/paperless/tasks/{taskId}' },
];
const policy = {
  configured: true,
  available: true,
  maxUploadBytes: 8,
  allowedMimeTypes: ['application/pdf'],
};
beforeEach(() => configureServerSdk({ apiKey: 'pops_sa_test_fixture' }));
afterEach(() => {
  closeOpenedApps();
  __resetServerSdkConfig();
  __resetServerPillarCache();
  __resetSharedPillarClient();
  __resetSharedOpenApiCache();
});
describe('Direct owner policy and task wire', () => {
  it('projects actual policy without exposing owner address/count and calls the exact owning route', async () => {
    const { factory, requests } = sdkWireFactory('documents', operations, () => ({
      status: 200,
      body: { data: { ...policy, baseUrl: 'http://private.test', documentCount: 123 } },
    }));
    const { app, token } = openWithOptions(
      { documents: createMobileDocumentsClient(createPillarGateway(factory)) },
      ['documents.read']
    );
    const response = await get(app, token, '/mobile/documents/status');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(policy);
    expect(requests).toEqual([{ method: 'GET', url: '/paperless/status', body: undefined }]);
  });
  it.each(['pending', 'done', 'duplicate', 'failed'])(
    'preserves exact task facts for%s without invented original identity',
    async (state) => {
      const value = {
        state,
        documentId: state === 'done' || state === 'duplicate' ? 77 : null,
        reason: state === 'failed' ? 'Source refusal' : null,
      };
      const { factory, requests } = sdkWireFactory('documents', operations, () => ({
        status: 200,
        body: { data: value },
      }));
      const { app, token } = openWithOptions(
        { documents: createMobileDocumentsClient(createPillarGateway(factory)) },
        ['documents.read']
      );
      const response = await get(app, token, '/mobile/documents/tasks/task_1');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(value);
      expect(requests).toEqual([
        { method: 'GET', url: '/paperless/tasks/task_1', body: undefined },
      ]);
    }
  );
  it.each([404, 412, 503])(
    'retains owner task%s without calling it empty or complete',
    async (status) => {
      const { factory } = sdkWireFactory('documents', operations, () => ({
        status,
        body: {
          code: 'documents.task.unavailable',
          message: 'Source response',
          requestId: 'test',
          retryable: false,
        },
      }));
      const { app, token } = openWithOptions(
        { documents: createMobileDocumentsClient(createPillarGateway(factory)) },
        ['documents.read']
      );
      const response = await get(app, token, '/mobile/documents/tasks/task_1');
      expect(response.status).toBe(status);
      expect(response.body).toMatchObject({
        details: { upstream: { pillar: 'documents', status } },
      });
    }
  );
  it.each([
    { state: 'complete', documentId: 77, reason: null },
    { state: 'done', documentId: 0, reason: null },
    { state: 'pending', documentId: null },
  ])('rejects invalid owning task body %#', async (value) => {
    const { factory } = sdkWireFactory('documents', operations, () => ({
      status: 200,
      body: { data: value },
    }));
    const { app, token } = openWithOptions(
      { documents: createMobileDocumentsClient(createPillarGateway(factory)) },
      ['documents.read']
    );
    expect((await get(app, token, '/mobile/documents/tasks/task_1')).status).toBe(502);
  });
  it('rejects task ID outside the owning grammar before any owner read', async () => {
    const { factory, requests } = sdkWireFactory('documents', operations, () => ({
      status: 200,
      body: {},
    }));
    const { app, token } = openWithOptions(
      { documents: createMobileDocumentsClient(createPillarGateway(factory)) },
      ['documents.read']
    );
    expect((await get(app, token, `/mobile/documents/tasks/${'a'.repeat(73)}`)).status).toBe(400);
    expect(requests).toEqual([]);
  });
});
