import { afterEach, describe, expect, it, vi } from 'vitest';

import { serialiseDeviceCapabilities, type MobileCapability } from '../../contract/capabilities.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

import type { MobileCaptureClient } from '../trips/capture.js';

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
const body = {
  operationId,
  command: { kind: 'capture.create', input: { originalText: '  original\n' } },
};
const result = {
  receipt: { ...workspace, operationId, undoneOperationId: null },
  current: workspace,
  replayed: false,
  undone: false,
};
const apps: TestApp[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.cleanup();
});
function open(capabilities: readonly MobileCapability[] = ['trips.read', 'trips.capture.write']) {
  const create = vi.fn<MobileCaptureClient['create']>(() =>
    Promise.resolve({ kind: 'ok', value: result })
  );
  const captures: MobileCaptureClient = {
    create,
    update: () => Promise.resolve({ kind: 'ok', value: result }),
    undo: () => Promise.resolve({ kind: 'ok', value: result }),
    workspace: () => Promise.resolve({ kind: 'ok', value: workspace }),
  };
  const context = createTestApp({ captures });
  apps.push(context);
  const row = deviceRow({
    capabilityMode: 'explicit',
    capabilities: serialiseDeviceCapabilities(capabilities),
  });
  context.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, context.accessTokenSigningKey);
  const post = (input: object, authorization: string | null = token) =>
    requestOn(context.app, (request) => {
      const call = request.post('/mobile/trips/7/captures/create').send(input);
      return authorization === null ? call : call.set('Authorization', `Bearer ${authorization}`);
    });
  return { ...context, create, post, token };
}

describe('mobile Capture perimeter and canonical forwarding', () => {
  it('requires device authentication before a write', async () => {
    const { post, create } = open();
    expect((await post(body, null)).status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });
  it('read authority does not grant write authority', async () => {
    const { post, create } = open(['trips.read']);
    expect((await post(body)).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
  it('rejects invalid UUID and empty originals without dispatch', async () => {
    const { post, create } = open();
    expect((await post({ ...body, operationId: 'not-a-uuid' })).status).toBe(400);
    expect(
      (await post({ ...body, command: { ...body.command, input: { originalText: '' } } })).status
    ).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
  it('returns the producer receipt and forwards exact source bytes once', async () => {
    const { post, create } = open();
    const response = await post(body);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(result);
    expect(create).toHaveBeenCalledExactlyOnceWith(7, body);
  });
  it('relays conflict without replacing the operation or retrying', async () => {
    const { post, create } = open();
    create.mockResolvedValue({
      kind: 'conflict',
      pillar: 'trips',
      status: 409,
      code: 'trips.operation_conflict',
      message: 'Operation input differs',
      retryable: false,
    });
    const response = await post(body);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: 'trips.operation_conflict', retryable: false });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('preserves a producer validation refusal and dispatches no automatic retry', async () => {
    const { post, create } = open();
    create.mockResolvedValue({
      kind: 'invalid-request',
      pillar: 'trips',
      status: 400,
      code: 'trips.capture_invalid',
      message: 'Source reference is invalid',
      retryable: false,
    });
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'trips.capture_invalid', retryable: false });
    expect(create).toHaveBeenCalledTimes(1);
  });
  it('reports unavailability without replacing the UUID or retrying an uncertain save', async () => {
    const { post, create } = open();
    create.mockResolvedValue({ kind: 'unavailable', pillar: 'trips', status: 503 });
    expect((await post(body)).status).toBe(503);
    expect(create).toHaveBeenCalledExactlyOnceWith(7, body);
  });
});
