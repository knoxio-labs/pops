import { unwrap } from '@pops/pillar-sdk/client';

import { sourceOwner } from '../arrangements/source-owner';
import {
  captureWorkspaceGet,
  capturesCreate,
  capturesUpdate,
  capturesAttach,
  capturesRemove,
  capturesOrganise,
  capturesRemoveAssociation,
  capturesUndo,
  ideasCreate,
  ideasUpdate,
  ideasRemove,
  ideasUndo,
  exploreAdd,
  exploreRemove,
  exploreUndo,
} from '../trips-api/sdk.gen';

import type {
  CaptureIdentity,
  CaptureSource,
  CaptureRequest,
  CaptureResult,
  CaptureOperation,
} from './types';

/** Read captures, Ideas, Explore membership and local targets from the same owner transaction. */
export async function loadCaptureSource(
  identity: CaptureIdentity,
  signal?: AbortSignal
): Promise<CaptureSource> {
  return unwrap(
    await captureWorkspaceGet({
      client: identity.client,
      path: { tripId: identity.tripId },
      signal,
    })
  );
}
/** Include API origin and owning trip in every source cache identity. */
export function captureQueryKey(
  identity: CaptureIdentity
): readonly ['trips', string, number, 'capture_workspace'] {
  const owner = sourceOwner(identity);
  return ['trips', owner.origin, owner.tripId, 'capture_workspace'];
}
/** Execute only the finite action-specific owner endpoint matching this exact retained request. */
export async function performCaptureRequest(
  identity: CaptureIdentity,
  request: CaptureRequest
): Promise<CaptureResult> {
  if ('scope' in request) return performUndo(identity, request);
  return performOperation(identity, request);
}
async function performUndo(
  identity: CaptureIdentity,
  request: Extract<CaptureRequest, { scope: string }>
): Promise<CaptureResult> {
  const options = {
    client: identity.client,
    path: { tripId: identity.tripId },
    body: { operationId: request.operationId, command: request.command },
  };
  if (request.scope === 'idea') return unwrap(await ideasUndo(options));
  if (request.scope === 'explore') return unwrap(await exploreUndo(options));
  return unwrap(await capturesUndo(options));
}
async function performOperation(
  identity: CaptureIdentity,
  request: CaptureOperation
): Promise<CaptureResult> {
  const options = { client: identity.client, path: { tripId: identity.tripId } };
  const { operationId, command } = request;
  switch (command.kind) {
    case 'capture.create':
      return unwrap(await capturesCreate({ ...options, body: { operationId, command } }));
    case 'capture.update':
      return unwrap(await capturesUpdate({ ...options, body: { operationId, command } }));
    case 'capture.attach':
      return unwrap(await capturesAttach({ ...options, body: { operationId, command } }));
    case 'capture.remove':
      return unwrap(await capturesRemove({ ...options, body: { operationId, command } }));
    case 'capture.organise':
      return unwrap(await capturesOrganise({ ...options, body: { operationId, command } }));
    case 'association.remove':
      return unwrap(
        await capturesRemoveAssociation({ ...options, body: { operationId, command } })
      );
    case 'idea.create':
      return unwrap(await ideasCreate({ ...options, body: { operationId, command } }));
    case 'idea.update':
      return unwrap(await ideasUpdate({ ...options, body: { operationId, command } }));
    case 'idea.remove':
      return unwrap(await ideasRemove({ ...options, body: { operationId, command } }));
    case 'explore.add':
      return unwrap(await exploreAdd({ ...options, body: { operationId, command } }));
    case 'explore.remove':
      return unwrap(await exploreRemove({ ...options, body: { operationId, command } }));
  }
}
