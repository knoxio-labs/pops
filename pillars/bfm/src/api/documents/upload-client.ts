import { buildRawDiscovery, resolveApiKey, SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import type { RawDiscovery } from '@pops/pillar-sdk/server';

import type { MobileDocumentIngestQuery } from '../../contract/rest-mobile-documents.js';

/** One direct owner upload; the body is consumed once and is never replayed. */
export interface DocumentIngestRequest {
  readonly query: MobileDocumentIngestQuery;
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType: string;
  readonly contentLength?: string;
  readonly signal: AbortSignal;
}
/** Not-sent proves no owner POST was attempted; unknown cannot authorize resubmission. */
export type DocumentIngestOutcome =
  | { readonly kind: 'not-sent' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'response'; readonly response: Response };
/** Finite transport into the sanctioned Documents raw upload route. */
export interface MobileDocumentsUploadClient {
  upload(request: DocumentIngestRequest): Promise<DocumentIngestOutcome>;
}
/** Owner discovery, credentials and HTTP seams; no Inventory target participates. */
export interface MobileDocumentsUploadDeps {
  discovery?: RawDiscovery;
  fetchImpl?: typeof fetch;
  apiKey?: () => string | undefined;
}
/** Streams at most one POST, refusing redirects before another origin can receive credentials. */
export function createMobileDocumentsUploadClient(
  deps: MobileDocumentsUploadDeps = {}
): MobileDocumentsUploadClient {
  const discovery = deps.discovery ?? buildRawDiscovery();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiKey = deps.apiKey ?? resolveApiKey;
  return {
    upload: async (request) => {
      const target = await discovery.lookup('documents');
      const key = apiKey();
      if (target === undefined || key === undefined || request.signal.aborted) {
        return { kind: 'not-sent' };
      }
      const query = new URLSearchParams({ fileName: request.query.fileName });
      if (request.query.title !== undefined) query.set('title', request.query.title);
      try {
        const response = await fetchImpl(
          `${target.baseUrl.replace(/\/$/u, '')}/paperless/documents?${query.toString()}`,
          {
            method: 'POST',
            redirect: 'manual',
            headers: {
              [SERVICE_ACCOUNT_HEADER]: key,
              'content-type': request.contentType,
              ...(request.contentLength === undefined
                ? {}
                : { 'content-length': request.contentLength }),
            },
            body: request.body,
            duplex: 'half',
            signal: request.signal,
          }
        );
        return { kind: 'response', response };
      } catch {
        return { kind: 'unknown' };
      }
    },
  };
}
