import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetSharedOpenApiCache, __resetSharedPillarClient } from '@pops/pillar-sdk/client';
import {
  __resetServerPillarCache,
  __resetServerSdkConfig,
  configureServerSdk,
} from '@pops/pillar-sdk/server';

import { sdkWireFactory } from '../__tests__/sdk-wire.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { createMobileDocumentsClient } from './client.js';

describe('Documents-original owner SDK wire', () => {
  beforeEach(() => configureServerSdk({ apiKey: 'pops_sa_test_fixture' }));
  afterEach(() => {
    __resetServerSdkConfig();
    __resetServerPillarCache();
    __resetSharedPillarClient();
    __resetSharedOpenApiCache();
  });
  it('substitutes original identity into the sanctioned owner path', async () => {
    const original = {
      id: 31,
      title: 'Ticket',
      created: '2028-01-02',
      originalFileName: 'ticket.pdf',
      thumbnailUrl: '/documents/31/thumbnail',
    };
    const { factory, requests } = sdkWireFactory(
      'documents',
      [{ operationId: 'paperless.get', method: 'get', path: '/paperless/documents/{id}' }],
      () => ({ status: 200, body: { data: original } })
    );
    expect(await createMobileDocumentsClient(createPillarGateway(factory)).getDocument(31)).toEqual(
      { kind: 'ok', value: original }
    );
    expect(requests).toEqual([{ method: 'GET', url: '/paperless/documents/31', body: undefined }]);
  });
});
