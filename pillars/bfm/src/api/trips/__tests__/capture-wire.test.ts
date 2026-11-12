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
const capture = {
  id: 3,
  tripId: 7,
  originalText: 'Immutable original',
  originalUrl: null,
  attachments: [{ kind: 'document', documentId: 77, taskId: 'accepted_task-1' }],
  title: null,
  notes: '',
  classification: null,
  placeId: null,
  visitId: null,
  revision: 5,
  removedAt: null,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
};
const attached = {
  receipt: { ...workspace, captures: [capture], operationId, undoneOperationId: null },
  current: { ...workspace, captures: [{ ...capture, attachments: [], revision: 6 }] },
  undone: true,
  replayed: true,
};
const attach = {
  operationId,
  command: {
    kind: 'capture.attach' as const,
    id: 3,
    expectedRevision: 4,
    attachment: { kind: 'document' as const, documentId: 77, taskId: 'accepted_task-1' },
  },
};

describe('canonical capture real SDK request mapping', () => {
  beforeEach(() => configureServerSdk({ apiKey: 'pops_sa_test_key' }));
  afterEach(() => {
    __resetServerSdkConfig();
    __resetServerPillarCache();
    __resetSharedPillarClient();
    __resetSharedOpenApiCache();
  });
  it('sends path identity separately from unchanged create/update/attach/Undo bodies', async () => {
    const { factory, requests } = sdkWireFactory(
      'trips',
      [
        {
          operationId: 'captureWorkspace.get',
          method: 'get',
          path: '/trips/{tripId}/capture-workspace',
        },
        ...['create', 'update', 'attach', 'undo'].map((action) => ({
          operationId: `captures.${action}`,
          method: 'post' as const,
          path: `/trips/{tripId}/captures/${action}`,
          hasBody: true,
        })),
      ],
      (request) => {
        if (request.method === 'GET') return { status: 200, body: workspace };
        return { status: 200, body: request.url.endsWith('/attach') ? attached : result };
      }
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
    expect([
      await client.create(7, create),
      await client.update(7, update),
      await client.attach(7, attach),
      await client.undo(7, undo),
    ]).toEqual([
      { kind: 'ok', value: result },
      { kind: 'ok', value: result },
      { kind: 'ok', value: attached },
      { kind: 'ok', value: result },
    ]);
    expect(requests).toEqual([
      { method: 'GET', url: '/trips/7/capture-workspace', body: undefined },
      ...[create, update, attach, undo].map((body, index) => ({
        method: 'POST',
        url: `/trips/7/captures/${['create', 'update', 'attach', 'undo'][index]}`,
        body,
      })),
    ]);
  });

  it.each([
    attached,
    {
      ...attached,
      current: {
        ...workspace,
        captures: [
          {
            ...capture,
            revision: 9,
            notes: 'A later independent edit',
            attachments: [{ kind: 'task', taskId: 'later-task' }],
            removedAt: '2026-11-02T00:00:00Z',
          },
        ],
      },
      undone: false,
    },
    {
      ...attached,
      receipt: {
        ...attached.receipt,
        captures: [
          {
            ...capture,
            attachments: [{ kind: 'task', taskId: 'previous-task' }, ...capture.attachments],
          },
        ],
      },
    },
  ])('accepts immutable append proof despite current-state changes %#', async (body) => {
    const { factory } = sdkWireFactory(
      'trips',
      [
        {
          operationId: 'captures.attach',
          method: 'post',
          path: '/trips/{tripId}/captures/attach',
          hasBody: true,
        },
      ],
      () => ({ status: 200, body })
    );
    expect(await createMobileCaptureClient(createPillarGateway(factory)).attach(7, attach)).toEqual(
      { kind: 'ok', value: body }
    );
  });

  it.each([
    { ...attached, receipt: { ...attached.receipt, captures: [] } },
    { ...attached, receipt: { ...attached.receipt, captures: [{ ...capture, id: 4 }] } },
    { ...attached, current: { ...attached.current, captures: [] } },
    { ...attached, current: { ...attached.current, captures: [{ ...capture, id: 4 }] } },
    { ...attached, receipt: { ...attached.receipt, captures: [{ ...capture, revision: 4 }] } },
    {
      ...attached,
      receipt: {
        ...attached.receipt,
        captures: [{ ...capture, removedAt: '2026-11-02T00:00:00Z' }],
      },
    },
    { ...attached, receipt: { ...attached.receipt, undoneOperationId: operationId } },
    ...[
      [],
      [{ kind: 'document', documentId: 78, taskId: 'accepted_task-1' }],
      [{ kind: 'document', documentId: 77 }],
      [{ kind: 'document', documentId: 77, taskId: 'another-task' }],
      [{ kind: 'task', taskId: 'accepted_task-1' }],
      [...capture.attachments, { kind: 'task', taskId: 'another-task' }],
    ].map((attachments) => ({
      ...attached,
      receipt: { ...attached.receipt, captures: [{ ...capture, attachments }] },
    })),
  ])('rejects same-UUID/trip responses without the requested append proof %#', async (body) => {
    const { factory, requests } = sdkWireFactory(
      'trips',
      [
        {
          operationId: 'captures.attach',
          method: 'post',
          path: '/trips/{tripId}/captures/attach',
          hasBody: true,
        },
      ],
      () => ({ status: 200, body })
    );
    expect(
      await createMobileCaptureClient(createPillarGateway(factory)).attach(7, attach)
    ).toMatchObject({ kind: 'contract-mismatch', pillar: 'trips' });
    expect(requests).toEqual([{ method: 'POST', url: '/trips/7/captures/attach', body: attach }]);
  });
});
