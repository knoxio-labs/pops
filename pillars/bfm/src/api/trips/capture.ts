import {
  MobileCaptureResultSchema,
  MobileCaptureWorkspaceSchema,
} from '../../contract/mobile-trip-capture-schemas.js';
import { parseOrMismatch } from '../pillars/parse-response.js';

import type { z } from 'zod';

import type {
  MobileCaptureCreate,
  MobileCaptureUpdate,
  MobileCaptureAttach,
  MobileCaptureUndo,
  MobileCaptureResult,
  MobileCaptureWorkspace,
} from '../../contract/mobile-trip-capture-schemas.js';
import type { GatewayOutcome, PillarGateway } from '../pillars/gateway.js';

type Router = {
  captureWorkspace: { get: (input: { tripId: number }) => Promise<unknown> };
  captures: {
    create: (input: MobileCaptureCreate & { tripId: number }) => Promise<unknown>;
    update: (input: MobileCaptureUpdate & { tripId: number }) => Promise<unknown>;
    attach: (input: MobileCaptureAttach & { tripId: number }) => Promise<unknown>;
    undo: (input: MobileCaptureUndo & { tripId: number }) => Promise<unknown>;
  };
};
/** Canonical producer operations; the BFM neither persists nor recreates receipts. */
export interface MobileCaptureClient {
  workspace(tripId: number): Promise<GatewayOutcome<MobileCaptureWorkspace>>;
  create(tripId: number, body: MobileCaptureCreate): Promise<GatewayOutcome<MobileCaptureResult>>;
  update(tripId: number, body: MobileCaptureUpdate): Promise<GatewayOutcome<MobileCaptureResult>>;
  attach(tripId: number, body: MobileCaptureAttach): Promise<GatewayOutcome<MobileCaptureResult>>;
  undo(tripId: number, body: MobileCaptureUndo): Promise<GatewayOutcome<MobileCaptureResult>>;
}
function ownedWorkspace(workspace: MobileCaptureWorkspace, tripId: number): boolean {
  return [
    workspace.captures,
    workspace.ideas,
    workspace.associations,
    workspace.memberships,
    workspace.events,
    workspace.journeys,
    workspace.stays,
  ].every(
    (rows) =>
      rows.every((row) => row.tripId === tripId) &&
      new Set(rows.map((row) => row.id)).size === rows.length
  );
}
function operationSchema(tripId: number, operationId: string): z.ZodType<MobileCaptureResult> {
  return MobileCaptureResultSchema.refine(
    (result) =>
      result.receipt.operationId === operationId &&
      ownedWorkspace(result.receipt, tripId) &&
      ownedWorkspace(result.current, tripId)
  );
}
function attachmentMatches(
  actual: MobileCaptureAttach['command']['attachment'],
  expected: MobileCaptureAttach['command']['attachment']
): boolean {
  if (actual.kind === 'task') return expected.kind === 'task' && actual.taskId === expected.taskId;
  return (
    expected.kind === 'document' &&
    actual.documentId === expected.documentId &&
    actual.taskId === expected.taskId
  );
}
function attachSchema(tripId: number, body: MobileCaptureAttach): z.ZodType<MobileCaptureResult> {
  return operationSchema(tripId, body.operationId).refine((result) => {
    const receipt = result.receipt.captures[0];
    const current = result.current.captures[0];
    const appended = receipt?.attachments.at(-1);
    return (
      result.receipt.captures.length === 1 &&
      receipt !== undefined &&
      receipt.id === body.command.id &&
      receipt.revision === body.command.expectedRevision + 1 &&
      receipt.removedAt === null &&
      result.receipt.undoneOperationId === null &&
      appended !== undefined &&
      attachmentMatches(appended, body.command.attachment) &&
      result.current.captures.length === 1 &&
      current?.id === body.command.id
    );
  });
}
/** Forwards the original typed operation UUID and preserves current state separately from its receipt. */
export function createMobileCaptureClient(gateway: PillarGateway): MobileCaptureClient {
  return {
    workspace: async (tripId) =>
      parseOrMismatch(
        'trips',
        await gateway.call<Router, unknown>('trips', (h) => h.captureWorkspace.get({ tripId })),
        MobileCaptureWorkspaceSchema.refine((workspace) => ownedWorkspace(workspace, tripId)),
        'captureWorkspace.get'
      ),
    create: async (tripId, body) =>
      parseOrMismatch(
        'trips',
        await gateway.call<Router, unknown>('trips', (h) => h.captures.create({ tripId, ...body })),
        operationSchema(tripId, body.operationId),
        'captures.create'
      ),
    update: async (tripId, body) =>
      parseOrMismatch(
        'trips',
        await gateway.call<Router, unknown>('trips', (h) => h.captures.update({ tripId, ...body })),
        operationSchema(tripId, body.operationId),
        'captures.update'
      ),
    attach: async (tripId, body) =>
      parseOrMismatch(
        'trips',
        await gateway.call<Router, unknown>('trips', (h) => h.captures.attach({ tripId, ...body })),
        attachSchema(tripId, body),
        'captures.attach'
      ),
    undo: async (tripId, body) =>
      parseOrMismatch(
        'trips',
        await gateway.call<Router, unknown>('trips', (h) => h.captures.undo({ tripId, ...body })),
        operationSchema(tripId, body.operationId),
        'captures.undo'
      ),
  };
}
