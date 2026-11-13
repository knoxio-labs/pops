import { describe, expect, it } from 'vitest';

import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import {
  MobileCaptureCreateSchema,
  MobileCaptureAttachSchema,
  MobileCapturePatchSchema,
} from '../../../contract/mobile-trip-capture-schemas.js';
import { createPillarGateway, type PillarHandleFactory } from '../../pillars/gateway.js';
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
  replayed: true,
  undone: false,
};

describe('mobile canonical Capture operations', () => {
  it('rejects empty originals and invented file metadata, preserving verbatim text', () => {
    expect(
      MobileCaptureCreateSchema.safeParse({
        operationId,
        command: { kind: 'capture.create', input: { originalText: '  ' } },
      }).success
    ).toBe(false);
    expect(
      MobileCaptureCreateSchema.safeParse({
        operationId,
        command: {
          kind: 'capture.create',
          input: { originalText: '', attachments: [{ kind: 'file', name: 'ticket.pdf' }] },
        },
      }).success
    ).toBe(false);
    expect(
      MobileCaptureCreateSchema.parse({
        operationId,
        command: { kind: 'capture.create', input: { originalText: '  saved verbatim\n' } },
      }).command.input.originalText
    ).toBe('  saved verbatim\n');
    expect(MobileCapturePatchSchema.safeParse({ originalText: 'replace original' }).success).toBe(
      false
    );
  });

  it('forwards the exact UUID and command, retaining replay receipt and current state', async () => {
    const calls: unknown[] = [];
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('trips', {
        captures: {
          create: (input) => {
            calls.push(input);
            return Promise.resolve({ kind: 'ok', value: result });
          },
        },
      });
    const client = createMobileCaptureClient(createPillarGateway(factory));
    const body = MobileCaptureCreateSchema.parse({
      operationId,
      command: { kind: 'capture.create', input: { originalText: 'ticket' } },
    });
    expect(await client.create(7, body)).toEqual({ kind: 'ok', value: result });
    expect(await client.create(7, body)).toEqual({ kind: 'ok', value: result });
    expect(calls).toEqual([
      { tripId: 7, ...body },
      { tripId: 7, ...body },
    ]);
  });

  it('refuses malformed receipt success rather than pretending an unknown write saved', async () => {
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('trips', {
        captures: { create: () => Promise.resolve({ kind: 'ok', value: { replayed: false } }) },
      });
    const client = createMobileCaptureClient(createPillarGateway(factory));
    const body = MobileCaptureCreateSchema.parse({
      operationId,
      command: { kind: 'capture.create', input: { originalText: 'ticket' } },
    });
    expect(await client.create(7, body)).toMatchObject({ kind: 'contract-mismatch' });
  });
  it('rejects a receipt for another operation rather than confirming the requested save', async () => {
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('trips', {
        captures: {
          create: () =>
            Promise.resolve({
              kind: 'ok',
              value: {
                ...result,
                receipt: { ...result.receipt, operationId: '3b5f6780-4111-4111-8111-111111111112' },
              },
            }),
        },
      });
    const body = MobileCaptureCreateSchema.parse({
      operationId,
      command: { kind: 'capture.create', input: { originalText: 'ticket' } },
    });
    expect(
      await createMobileCaptureClient(createPillarGateway(factory)).create(7, body)
    ).toMatchObject({ kind: 'contract-mismatch' });
  });
  it('refuses foreign-trip source records instead of adopting them into this workspace', async () => {
    const foreign = {
      id: 1,
      tripId: 8,
      originalText: 'foreign',
      originalUrl: null,
      attachments: [],
      title: null,
      notes: '',
      classification: null,
      placeId: null,
      visitId: null,
      revision: 1,
      removedAt: null,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
    };
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('trips', {
        captureWorkspace: {
          get: () => Promise.resolve({ kind: 'ok', value: { ...workspace, captures: [foreign] } }),
        },
      });
    expect(
      await createMobileCaptureClient(createPillarGateway(factory)).workspace(7)
    ).toMatchObject({ kind: 'contract-mismatch' });
  });
});

const attachBody = MobileCaptureAttachSchema.parse({
  operationId,
  command: {
    kind: 'capture.attach',
    id: 3,
    expectedRevision: 4,
    attachment: { kind: 'task', taskId: 'accepted_task-1' },
  },
});
const capture = {
  id: 3,
  tripId: 7,
  originalText: 'Original remains verbatim',
  originalUrl: null,
  attachments: [{ kind: 'task' as const, taskId: 'accepted_task-1' }],
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
  replayed: true,
  undone: true,
};

describe('mobile capture attachment receipt ownership', () => {
  it('retains the original accepted-task receipt separately from current undone state', async () => {
    const calls: unknown[] = [];
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('trips', {
        captures: {
          attach: (input) => {
            calls.push(input);
            return Promise.resolve({ kind: 'ok', value: attached });
          },
        },
      });
    const client = createMobileCaptureClient(createPillarGateway(factory));
    expect(await client.attach(7, attachBody)).toEqual({ kind: 'ok', value: attached });
    expect(calls).toEqual([{ tripId: 7, ...attachBody }]);
  });

  it.each([
    {
      ...attached,
      receipt: { ...attached.receipt, operationId: '3b5f6780-4111-4111-8111-111111111112' },
    },
    { ...attached, receipt: { ...attached.receipt, captures: [{ ...capture, tripId: 8 }] } },
    { ...attached, current: { ...attached.current, captures: [{ ...capture, tripId: 8 }] } },
    { ...attached, current: { ...attached.current, captures: [capture, capture] } },
    {
      ...attached,
      receipt: {
        ...attached.receipt,
        captures: [{ ...capture, attachments: [{ kind: 'file', name: 'local.pdf' }] }],
      },
    },
  ])('rejects mismatched, foreign or malformed attach proof %#', async (value) => {
    const factory: PillarHandleFactory = <TRouter>() =>
      fakePillarHandle<TRouter>('trips', {
        captures: { attach: () => Promise.resolve({ kind: 'ok', value }) },
      });
    const outcome = await createMobileCaptureClient(createPillarGateway(factory)).attach(
      7,
      attachBody
    );
    expect(outcome).toMatchObject({ kind: 'contract-mismatch', pillar: 'trips' });
  });
});
