import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetSharedOpenApiCache, __resetSharedPillarClient } from '@pops/pillar-sdk/client';
import {
  __resetServerPillarCache,
  __resetServerSdkConfig,
  configureServerSdk,
} from '@pops/pillar-sdk/server';

import { sdkWireFactory } from '../../__tests__/sdk-wire.js';
import { createPillarGateway } from '../../pillars/gateway.js';
import { createMobileCaptureClient } from '../capture.js';

const operationId = '3b5f6780-4111-4111-8111-111111111111';
const workspace = {
  captures: [],
  ideas: [],
  associations: [],
  memberships: [],
  events: [],
  journeys: [],
  stays: [],
};
const result = {
  receipt: { ...workspace, operationId, undoneOperationId: null },
  current: workspace,
  undone: false,
  replayed: false,
};

describe('canonical capture real SDK request mapping', () => {
  beforeEach(() => configureServerSdk({ apiKey: 'pops_sa_test_key' }));
  afterEach(() => {
    __resetServerSdkConfig();
    __resetServerPillarCache();
    __resetSharedPillarClient();
    __resetSharedOpenApiCache();
  });
  it('sends path identity separately from unchanged create/update/Undo bodies', async () => {
    const { factory, requests } = sdkWireFactory(
      'trips',
      [
        {
          operationId: 'captureWorkspace.get',
          method: 'get',
          path: '/trips/{tripId}/capture-workspace',
        },
        ...['create', 'update', 'undo'].map((action) => ({
          operationId: `captures.${action}`,
          method: 'post' as const,
          path: `/trips/{tripId}/captures/${action}`,
          hasBody: true,
        })),
      ],
      (request) => ({ status: 200, body: request.method === 'GET' ? workspace : result })
    );
    const client = createMobileCaptureClient(createPillarGateway(factory));
    const create = {
      operationId,
      command: { kind: 'capture.create' as const, input: { originalText: '  verbatim\n' } },
    };
    const update = {
      operationId,
      command: {
        kind: 'capture.update' as const,
        id: 3,
        expectedRevision: 4,
        input: { title: 'Ticket' },
      },
    };
    const undo = {
      operationId,
      command: { kind: 'undo' as const, targetOperationId: '3b5f6780-4111-4111-8111-111111111112' },
    };
    expect(await client.workspace(7)).toEqual({ kind: 'ok', value: workspace });
    for (const outcome of [
      await client.create(7, create),
      await client.update(7, update),
      await client.undo(7, undo),
    ])
      expect(outcome).toEqual({ kind: 'ok', value: result });
    expect(requests).toEqual([
      { method: 'GET', url: '/trips/7/capture-workspace', body: undefined },
      ...[create, update, undo].map((body, index) => ({
        method: 'POST',
        url: `/trips/7/captures/${['create', 'update', 'undo'][index]}`,
        body,
      })),
    ]);
  });
});
