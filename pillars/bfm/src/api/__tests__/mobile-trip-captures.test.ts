import { afterEach, describe, expect, it, vi } from 'vitest';

import { serialiseDeviceCapabilities, type MobileCapability } from '../../contract/capabilities.js';
import { MobileCaptureAttachSchema } from '../../contract/mobile-trip-capture-schemas.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

import type {
  MobileCaptureAttach,
  MobileCaptureResult,
} from '../../contract/mobile-trip-capture-schemas.js';
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
function attachResult(input: MobileCaptureAttach): MobileCaptureResult {
  const capture = {
    id: input.command.id,
    tripId: 7,
    originalText: 'Original remains verbatim',
    originalUrl: null,
    attachments: [input.command.attachment],
    title: null,
    notes: '',
    classification: null,
    placeId: null,
    visitId: null,
    revision: input.command.expectedRevision + 1,
    removedAt: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
  };
  const affected = { ...workspace, captures: [capture] };
  return {
    receipt: { ...affected, operationId: input.operationId, undoneOperationId: null },
    current: affected,
    replayed: false,
    undone: false,
  };
}
function open(capabilities: readonly MobileCapability[] = ['trips.read', 'trips.capture.write']) {
  const create = vi.fn<MobileCaptureClient['create']>(() =>
    Promise.resolve({ kind: 'ok', value: result })
  );
  const attach = vi.fn<MobileCaptureClient['attach']>((_tripId, input) =>
    Promise.resolve({ kind: 'ok', value: attachResult(input) })
  );
  const captures: MobileCaptureClient = {
    create,
    update: () => Promise.resolve({ kind: 'ok', value: result }),
    attach,
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
  const postAttach = (input: object, authorization: string | null = token) =>
    requestOn(context.app, (request) => {
      const call = request.post('/mobile/trips/7/captures/attach').send(input);
      return authorization === null ? call : call.set('Authorization', `Bearer ${authorization}`);
    });
  return { ...context, create, attach, post, postAttach, token };
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

const attachment = {
  operationId,
  command: {
    kind: 'capture.attach',
    id: 3,
    expectedRevision: 4,
    attachment: { kind: 'task', taskId: 'accepted_task-1' },
  },
};

describe('mobile capture attachment boundary', () => {
  it('requires device authentication before dispatch', async () => {
    const { postAttach, attach } = open();
    expect((await postAttach(attachment, null)).status).toBe(401);
    expect(attach).not.toHaveBeenCalled();
  });

  it.each<{ capabilities: readonly MobileCapability[] }>([
    { capabilities: ['trips.read'] },
    { capabilities: ['trips.write'] },
    { capabilities: ['documents.read'] },
    { capabilities: [] },
  ])('does not infer capture write authority from $capabilities', async ({ capabilities }) => {
    const { postAttach, attach } = open(capabilities);
    expect((await postAttach(attachment)).status).toBe(403);
    expect(attach).not.toHaveBeenCalled();
  });

  it.each([
    { kind: 'task', taskId: 'accepted_task-1' },
    { kind: 'document', documentId: 77 },
    { kind: 'document', documentId: 77, taskId: 'accepted_task-1' },
  ])('forwards the exact owner identity without a Documents grant: %j', async (reference) => {
    const { postAttach, attach } = open(['trips.capture.write']);
    const input = { ...attachment, command: { ...attachment.command, attachment: reference } };
    const response = await postAttach(input);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(attachResult(MobileCaptureAttachSchema.parse(input)));
    expect(attach).toHaveBeenCalledExactlyOnceWith(7, input);
  });

  it.each([
    { ...attachment, operationId: 'not-a-uuid' },
    { ...attachment, command: { ...attachment.command, id: 0 } },
    { ...attachment, command: { ...attachment.command, expectedRevision: 0 } },
    { ...attachment, command: { ...attachment.command, kind: 'capture.update' } },
    ...[
      { kind: 'task', taskId: 'task/path' },
      { kind: 'task', taskId: 'a'.repeat(73) },
      { kind: 'document', documentId: 0 },
      { kind: 'file', name: 'original.pdf' },
      { kind: 'document', documentId: 77, fileName: 'original.pdf' },
    ].map((reference) => ({
      ...attachment,
      command: { ...attachment.command, attachment: reference },
    })),
  ])('rejects malformed or invented attachment input before dispatch %#', async (input) => {
    const { postAttach, attach } = open();
    expect((await postAttach(input)).status).toBe(400);
    expect(attach).not.toHaveBeenCalled();
  });

  it('preserves the immutable receipt and distinct replayed current state', async () => {
    const { postAttach, attach } = open();
    const original = attachResult(MobileCaptureAttachSchema.parse(attachment));
    const replay = {
      ...original,
      current: {
        ...workspace,
        captures: original.current.captures.map((row) => ({
          ...row,
          attachments: [],
          revision: 6,
        })),
      },
      replayed: true,
      undone: true,
    };
    attach.mockResolvedValue({ kind: 'ok', value: replay });
    const response = await postAttach(attachment);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(replay);
    expect(attach).toHaveBeenCalledExactlyOnceWith(7, attachment);
  });

  it('relays stale revision conflicts without replacing the UUID or retrying', async () => {
    const { postAttach, attach } = open();
    attach.mockResolvedValue({
      kind: 'conflict',
      pillar: 'trips',
      status: 409,
      code: 'trips.source.source_revision_conflict',
      retryable: false,
    });
    const response = await postAttach(attachment);
    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'trips.source.source_revision_conflict',
      retryable: false,
    });
    expect(attach).toHaveBeenCalledExactlyOnceWith(7, attachment);
  });

  it('does not automatically replay an unavailable write', async () => {
    const { postAttach, attach } = open();
    attach.mockResolvedValue({ kind: 'unavailable', pillar: 'trips', status: 503 });
    expect((await postAttach(attachment)).status).toBe(503);
    expect(attach).toHaveBeenCalledExactlyOnceWith(7, attachment);
  });

  it('preserves a genuinely missing capture without converting it to success', async () => {
    const { postAttach, attach } = open();
    attach.mockResolvedValue({ kind: 'not-found', pillar: 'trips', status: 404 });
    expect((await postAttach(attachment)).status).toBe(404);
    expect(attach).toHaveBeenCalledExactlyOnceWith(7, attachment);
  });
});
