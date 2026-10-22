/**
 * bfm's leg into inventory's two raw document routes: the upload
 * (`POST /items/:itemId/documents/upload`, scope `inventory.documents.upload`)
 * and the file (`GET /api/inventory/documents/:id/file`, scope
 * `inventory.documents.file`). Neither publishes an OpenAPI operation, so,
 * like `media-client.ts`, this resolves inventory's base URL through raw
 * discovery and attaches the service-account credential itself.
 *
 * Bytes are never buffered here: the upload body is the phone's request
 * stream, and the answer is inventory's unread `Response`, so the route can
 * stream it back. Mapping a status onto the phone's vocabulary is the
 * route's job (`rest/mobile-inventory-document-bytes.ts`).
 */
import { resolveApiKey, SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import { buildDiscovery, type InventoryMediaDiscovery } from './media-http.js';
import { INVENTORY_MEDIA_PILLAR_ID } from './media-outcomes.js';

import type { MobileDocumentUploadQuery } from '../../contract/mobile-inventory-document-schemas.js';

export interface DocumentUploadRequest {
  readonly itemId: string;
  readonly query: MobileDocumentUploadQuery;
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: string | undefined;
  readonly contentLength: string | undefined;
}

/** `null` means inventory could not be reached at all: undiscoverable, no key, or the call threw. */
export interface MobileInventoryDocumentBytesClient {
  upload(request: DocumentUploadRequest): Promise<Response | null>;
  file(linkId: number, range: string | undefined): Promise<Response | null>;
}

export interface MobileInventoryDocumentBytesClientDeps {
  discovery?: InventoryMediaDiscovery;
  fetchImpl?: typeof fetch;
  apiKey?: () => string | undefined;
}

interface Context {
  readonly discovery: InventoryMediaDiscovery;
  readonly fetchImpl: typeof fetch;
  readonly apiKey: () => string | undefined;
}

async function send(
  ctx: Context,
  path: string,
  init: {
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: ReadableStream<Uint8Array>;
  }
): Promise<Response | null> {
  const target = await ctx.discovery.lookup(INVENTORY_MEDIA_PILLAR_ID);
  if (target === undefined) return null;
  const key = ctx.apiKey();
  if (key === undefined) return null;
  try {
    return await ctx.fetchImpl(`${target.baseUrl.replace(/\/$/u, '')}${path}`, {
      method: init.method,
      headers: { ...init.headers, [SERVICE_ACCOUNT_HEADER]: key },
      ...(init.body === undefined ? {} : { body: init.body, duplex: 'half' }),
    });
  } catch {
    return null;
  }
}

function uploadPath(request: DocumentUploadRequest): string {
  const query = new URLSearchParams({
    documentType: request.query.documentType,
    fileName: request.query.fileName,
  });
  if (request.query.title !== undefined) query.set('title', request.query.title);
  return `/items/${encodeURIComponent(request.itemId)}/documents/upload?${query.toString()}`;
}

function uploadHeaders(request: DocumentUploadRequest): Record<string, string> {
  return {
    ...(request.contentType === undefined ? {} : { 'content-type': request.contentType }),
    ...(request.contentLength === undefined ? {} : { 'content-length': request.contentLength }),
  };
}

/** Build the client. Production passes no deps and gets the real discovery and credential. */
export function createMobileInventoryDocumentBytesClient(
  deps: MobileInventoryDocumentBytesClientDeps = {}
): MobileInventoryDocumentBytesClient {
  const ctx: Context = {
    discovery: deps.discovery ?? buildDiscovery(),
    fetchImpl: deps.fetchImpl ?? fetch,
    apiKey: deps.apiKey ?? resolveApiKey,
  };
  return {
    upload: (request) =>
      send(ctx, uploadPath(request), {
        method: 'POST',
        headers: uploadHeaders(request),
        body: request.body,
      }),
    file: (linkId, range) =>
      send(ctx, `/api/inventory/documents/${String(linkId)}/file`, {
        method: 'GET',
        headers: range === undefined ? {} : { range },
      }),
  };
}
