import { SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';
import { ErrorBodySchema } from '@pops/types';

import { getRawDiscovery } from '../pillar-client.js';
import { resolveServiceAccountKey } from '../service-account-key.js';

import type { RawDiscovery } from '@pops/pillar-sdk/server';

import type { DocumentUploadTarget } from './upload-tokens.js';

/** Statuses inventory's upload route gives a meaning (its own and documents' relayed ones). */
const RELAYED_STATUSES: ReadonlySet<number> = new Set([400, 404, 412, 413, 415, 422, 503]);

/** The outcome of handing one document to inventory. */
export type DocumentUploadResult =
  | { readonly kind: 'accepted'; readonly ingestion: unknown }
  | { readonly kind: 'too-large' }
  | { readonly kind: 'redirected'; readonly status: number }
  | {
      readonly kind: 'refused';
      readonly status: number;
      readonly code: string;
      readonly message: string;
      readonly retryable: boolean;
      readonly details?: unknown;
    }
  | { readonly kind: 'unavailable'; readonly message: string };

/** Seams for tests; production uses the gateway's discovery, `fetch` and key. */
export interface DocumentUploadDeps {
  readonly discovery?: RawDiscovery;
  readonly fetchImpl?: typeof fetch;
  readonly apiKey?: () => string | undefined;
}

/** The request body as it arrives, with the headers inventory needs to forward it. */
export interface DocumentUploadRequest {
  readonly body: AsyncIterable<unknown>;
  readonly contentType: string;
  readonly contentLength?: string;
}

class TooLargeError extends Error {}

/** Stream `source` through unbuffered, failing the stream once it passes `maxBytes`. */
function cappedStream(
  source: AsyncIterable<unknown>,
  maxBytes: number
): ReadableStream<Uint8Array> {
  let forwarded = 0;
  async function* chunks(): AsyncGenerator<Uint8Array> {
    for await (const chunk of source) {
      if (!(chunk instanceof Uint8Array)) throw new TypeError('Request body chunk is not bytes');
      forwarded += chunk.length;
      if (forwarded > maxBytes) throw new TooLargeError();
      yield chunk;
    }
  }
  const iterator = chunks();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done === true) controller.close();
      else controller.enqueue(next.value);
    },
    async cancel() {
      await iterator.return(undefined);
    },
  });
}

function uploadUrl(baseUrl: string, target: DocumentUploadTarget): string {
  const query = new URLSearchParams({
    documentType: target.documentType,
    fileName: target.fileName,
  });
  if (target.title !== undefined) query.set('title', target.title);
  const itemPath = encodeURIComponent(target.itemId);
  return `${baseUrl.replace(/\/$/u, '')}/items/${itemPath}/documents/upload?${query.toString()}`;
}

async function classify(response: Response): Promise<DocumentUploadResult> {
  const parsed: unknown = await response.json().catch(() => null);
  if (response.status === 202) {
    if (typeof parsed === 'object' && parsed !== null && 'data' in parsed) {
      return { kind: 'accepted', ingestion: parsed.data };
    }
    return { kind: 'unavailable', message: 'inventory accepted the upload with no readable body' };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      kind: 'unavailable',
      message: `inventory refused the gateway's service account, which needs scope 'inventory.documents.upload'`,
    };
  }
  const body = ErrorBodySchema.safeParse(parsed);
  if (!RELAYED_STATUSES.has(response.status) || !body.success) {
    return { kind: 'unavailable', message: `inventory answered ${String(response.status)}` };
  }
  return {
    kind: 'refused',
    status: response.status,
    code: body.data.code,
    message: body.data.message,
    retryable: body.data.retryable,
    ...(body.data.details === undefined ? {} : { details: body.data.details }),
  };
}

/**
 * `POST` the request body to inventory's raw
 * `/items/:itemId/documents/upload` under the gateway's service account
 * (`inventory.documents.upload`), streaming it rather than buffering it.
 * The route has no contract operation, so this is a raw call to the base URL
 * `getPillar('inventory')` would discover. A body past `target.maxBytes`
 * is cut off and reported as `too-large`.
 */
export async function uploadInventoryDocument(
  request: DocumentUploadRequest,
  target: DocumentUploadTarget,
  deps: DocumentUploadDeps = {}
): Promise<DocumentUploadResult> {
  return forwardDocument(request, target.maxBytes, {
    deps,
    pillar: 'inventory',
    failureMessage: 'inventory did not answer',
    url: (baseUrl) => uploadUrl(baseUrl, target),
    classifyResponse: classify,
  });
}

type Failure = Exclude<DocumentUploadResult, { kind: 'accepted' }>;
/** Configuration for the shared raw stream transport; routing and accepted receipts remain owner-specific. */
export interface DocumentForwarding<Accepted> {
  readonly deps: DocumentUploadDeps;
  readonly pillar: string;
  readonly failureMessage: string;
  readonly url: (baseUrl: string) => string;
  readonly classifyResponse: (response: Response) => Promise<Accepted | Failure>;
}

/** Forward once with service-account authentication. Never follow 3xx responses: bytes may already be committed, so neither owner may acknowledge or automatically retry them. */
export async function forwardDocument<Accepted>(
  request: DocumentUploadRequest,
  maxBytes: number,
  options: DocumentForwarding<Accepted>
): Promise<Accepted | Failure> {
  const { deps, pillar, failureMessage, url, classifyResponse } = options;
  const discovery = deps.discovery ?? getRawDiscovery();
  const found = await discovery.lookup(pillar);
  if (found === undefined) return { kind: 'unavailable', message: `${pillar} is not discoverable` };
  const key = (deps.apiKey ?? resolveServiceAccountKey)();
  if (key === undefined) return { kind: 'unavailable', message: 'no service-account key' };
  const headers: Record<string, string> = {
    [SERVICE_ACCOUNT_HEADER]: key,
    'content-type': request.contentType,
    accept: 'application/json',
  };
  if (request.contentLength !== undefined) headers['content-length'] = request.contentLength;
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    redirect: 'manual',
    headers,
    body: cappedStream(request.body, maxBytes),
    duplex: 'half',
  };
  try {
    const response = await (deps.fetchImpl ?? fetch)(url(found.baseUrl), init);
    if (isRedirectStatus(response.status)) return { kind: 'redirected', status: response.status };
    return await classifyResponse(response);
  } catch (err) {
    if (
      err instanceof TooLargeError ||
      (err instanceof Error && err.cause instanceof TooLargeError)
    )
      return { kind: 'too-large' };
    return { kind: 'unavailable', message: failureMessage };
  }
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}
