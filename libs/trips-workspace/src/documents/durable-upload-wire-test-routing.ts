import { zWriteCreateUploadBody } from '../documents-api/zod.gen';
import { dispatchUploadResponse, readUploadResponse } from './durable-upload-wire-test-controls';
import {
  admittedUploadRecord,
  awaitingUploadRecord,
  uploadWireProof,
} from './durable-upload-wire-test-records';

import type { PaperlessGetResponses, PaperlessStatusResponses } from '../documents-api/types.gen';
import type { DurableUploadInput } from './durable-upload-api';
import type { UploadWireRoute, UploadWireState } from './durable-upload-wire-test-types';

const policy: PaperlessStatusResponses[200] = {
  data: {
    configured: true,
    available: true,
    maxUploadBytes: 1000,
    allowedMimeTypes: ['application/pdf'],
    baseUrl: null,
    documentCount: null,
  },
};

function metadataResponse(
  state: UploadWireState,
  request: Request,
  pathname: string
): Response | undefined {
  if (pathname.endsWith('/paperless/status')) return Response.json(policy);
  if (pathname.endsWith('/paperless/search'))
    return Response.json({ data: state.options.searchResults ?? [] });
  const documentId = state.options.documentId ?? 91;
  if (request.method === 'GET' && pathname.endsWith(`/paperless/documents/${String(documentId)}`)) {
    const document: PaperlessGetResponses[200] = {
      data: {
        id: documentId,
        title: 'Accepted',
        originalFileName: 'original.pdf',
        created: '2026-01-01T00:00:00.000Z',
        thumbnailUrl: '',
      },
    };
    return Response.json(document);
  }
  return undefined;
}

async function createIntent(state: UploadWireState, request: Request): Promise<Response> {
  const body: unknown = await request.json();
  const input: DurableUploadInput = zWriteCreateUploadBody.parse(body);
  const existing = state.records.get(input.operationId);
  if (existing !== undefined) return uploadWireProof(existing);
  const record = awaitingUploadRecord(input);
  state.records.set(input.operationId, record);
  return uploadWireProof(record);
}

function operationRoute(state: UploadWireState, pathname: string): UploadWireRoute {
  const match = /\/paperless\/uploads\/([^/]+)(?:\/(content|dispatch))?$/.exec(pathname);
  const operationId = match?.[1];
  const record = operationId === undefined ? undefined : state.records.get(operationId);
  if (operationId === undefined || record === undefined)
    throw new Error('Unexpected durable owner request.');
  return { operationId, record, action: match?.[2] };
}

function uploadResponse(
  state: UploadWireState,
  route: UploadWireRoute,
  method: string
): Response | Promise<Response> {
  if (method === 'PUT' && route.action === 'content') {
    const next = admittedUploadRecord(route.record);
    state.records.set(route.operationId, next);
    return uploadWireProof(next);
  }
  if (method === 'POST' && route.action === 'dispatch') return dispatchUploadResponse(state, route);
  if (method === 'GET' && route.action === undefined) return readUploadResponse(state, route);
  throw new Error('Unexpected durable owner method.');
}

async function routeRequest(state: UploadWireState, request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const metadata = metadataResponse(state, request, pathname);
  if (metadata !== undefined) return metadata;
  if (request.method === 'POST' && pathname.endsWith('/paperless/uploads'))
    return createIntent(state, request);
  return uploadResponse(state, operationRoute(state, pathname), request.method);
}

/** Controlled fetch adapter that records the actual Request before canonical route dispatch. */
export function createUploadWireFetcher(state: UploadWireState): typeof globalThis.fetch {
  return async (resource, init): Promise<Response> => {
    const request = new Request(resource, init);
    state.requests.push(request);
    return routeRequest(state, request);
  };
}
