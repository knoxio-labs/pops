import { inventoryError, sendInventoryError } from '../errors.js';

import type { Request, RequestHandler, Response as ExpressResponse } from 'express';

import type { lookupPillar as DefaultLookupPillar } from '@pops/pillar-sdk/discovery';

const DOCUMENTS_PILLAR_ID = 'documents';
const THUMBNAIL_FETCH_TIMEOUT_MS = 10_000;
const THUMBNAIL_CACHE_CONTROL = 'public, max-age=3600';

type DocumentsPillar = Awaited<ReturnType<typeof DefaultLookupPillar>>;

interface ThumbnailErrorSpec {
  reason: string;
  status: number;
  message: string;
  retryable?: boolean;
}

function sendThumbnailError(req: Request, res: ExpressResponse, spec: ThumbnailErrorSpec): void {
  sendInventoryError(req, res, inventoryError({ area: 'documents', retryable: false, ...spec }));
}

async function discoverDocuments(
  lookupDocumentsPillar: typeof DefaultLookupPillar,
  req: Request,
  res: ExpressResponse
): Promise<DocumentsPillar> {
  try {
    const pillar = await lookupDocumentsPillar(DOCUMENTS_PILLAR_ID);
    if (pillar) return pillar;
  } catch (error) {
    console.error('[inventory/documents] Thumbnail discovery error:', error);
  }
  sendThumbnailError(req, res, {
    reason: 'unavailable',
    status: 503,
    message: 'Documents service is not available',
    retryable: true,
  });
  return undefined;
}

async function fetchThumbnail(
  req: Request,
  res: ExpressResponse,
  target: { fetchImpl: typeof fetch; baseUrl: string; id: string }
): Promise<Response | null> {
  try {
    return await target.fetchImpl(`${target.baseUrl}/documents/${target.id}/thumbnail`, {
      signal: AbortSignal.timeout(THUMBNAIL_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    console.error(
      timedOut
        ? '[inventory/documents] Thumbnail proxy timed out:'
        : '[inventory/documents] Thumbnail proxy error:',
      error
    );
    sendThumbnailError(req, res, {
      reason: timedOut ? 'timeout' : 'unreachable',
      status: timedOut ? 504 : 502,
      message: timedOut ? 'The documents pillar timed out' : 'Failed to reach the documents pillar',
      retryable: true,
    });
    return null;
  }
}

function handleFailedResponse(req: Request, res: ExpressResponse, response: Response): void {
  if (response.status === 404) {
    sendThumbnailError(req, res, {
      reason: 'not_found',
      status: 404,
      message: 'Document not found',
    });
    return;
  }
  if (response.status === 503) {
    sendThumbnailError(req, res, {
      reason: 'not_configured',
      status: 503,
      message: 'Paperless-ngx is not configured',
    });
    return;
  }
  sendThumbnailError(req, res, {
    reason: 'upstream_failure',
    status: 502,
    message: 'Failed to fetch thumbnail from the documents pillar',
    retryable: true,
  });
}

/** Build the raw Paperless thumbnail proxy handler. */
export function createThumbnailProxyHandler(
  lookupDocumentsPillar: typeof DefaultLookupPillar,
  fetchImpl: typeof fetch
): RequestHandler<{ id: string }> {
  return async (req, res): Promise<void> => {
    const { id } = req.params;
    if (!/^\d+$/.test(id)) {
      sendThumbnailError(req, res, {
        reason: 'invalid_id',
        status: 400,
        message: `Invalid document id: ${id}`,
      });
      return;
    }
    const documentsPillar = await discoverDocuments(lookupDocumentsPillar, req, res);
    if (!documentsPillar) return;
    const response = await fetchThumbnail(req, res, {
      fetchImpl,
      baseUrl: documentsPillar.baseUrl,
      id,
    });
    if (!response) return;
    if (!response.ok) {
      handleFailedResponse(req, res, response);
      return;
    }
    const contentType = response.headers.get('content-type') ?? 'image/png';
    res.set({ 'Content-Type': contentType, 'Cache-Control': THUMBNAIL_CACHE_CONTROL });
    res.send(Buffer.from(await response.arrayBuffer()));
  };
}
