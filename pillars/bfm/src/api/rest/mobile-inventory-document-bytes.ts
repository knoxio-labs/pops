/**
 * The two `/mobile` item-document routes that carry raw bytes, which the
 * ts-rest contract cannot describe — so, like the Ego stream, they are
 * Express routes whose capabilities are declared in
 * `UNCONTRACTED_MOBILE_ROUTES`, and the iOS client calls them outside its
 * generated client.
 *
 * - `POST /mobile/inventory/items/:id/documents`: the body is the file and
 *   `Content-Type` its MIME type; the query carries `documentType`,
 *   `fileName` and an optional `title`. Streamed to inventory unbuffered.
 *   Answers `202` with the {@link MobileDocumentIngestionSchema} inventory
 *   recorded.
 * - `GET /mobile/inventory/documents/:id/file`: the file of a linked
 *   document. `Range` is forwarded; `200`/`206`/`416` stream back with their
 *   content headers.
 *
 * Mounted ahead of every body parser, so no parser consumes an upload whose
 * declared type happens to be one it reads.
 *
 * A refusal answers the producer's status unchanged when it is one the phone
 * acts on (400, 404, 412 Paperless not connected, 413, 415, 422, 502, 503)
 * with the producer's ADR-054 envelope and `details.upstream`, the same body
 * every contract route relays. The upload limits are documents'; nothing here
 * restates them.
 */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { Router } from 'express';
import { z } from 'zod';

import { ErrorBodySchema } from '@pops/types';

import {
  MobileDocumentIdSchema,
  MobileDocumentIngestionSchema,
  MobileDocumentUploadQuerySchema,
} from '../../contract/mobile-inventory-document-schemas.js';
import { invalidRequestBody } from '../errors.js';
import { INVENTORY_MEDIA_PILLAR_ID } from '../inventory/media-outcomes.js';
import {
  MOBILE_INVENTORY_DOCUMENT_FILE_PATH,
  MOBILE_INVENTORY_DOCUMENT_UPLOAD_PATH,
} from '../paths.js';
import { relayBody, type Classification, type RelaySource } from './upstream-error.js';

import type { Request, Response } from 'express';

import type { MobileUpstreamError } from '../../contract/rest-schemas.js';
import type { MobileInventoryDocumentBytesClient } from '../inventory/document-bytes-client.js';

/** Dependencies for the raw item-document routes. */
export interface MobileInventoryDocumentBytesDeps {
  readonly inventoryDocumentBytes: MobileInventoryDocumentBytesClient;
}

const RELAYED_STATUSES: ReadonlySet<number> = new Set([400, 404, 412, 413, 415, 422, 502, 503]);

const STREAMED_STATUSES: ReadonlySet<number> = new Set([200, 206, 416]);

const PASSED_HEADERS = [
  'content-type',
  'content-length',
  'content-disposition',
  'content-range',
  'accept-ranges',
] as const;

const AcceptedSchema = z.object({ data: MobileDocumentIngestionSchema });

const UNREACHABLE: RelaySource = { pillar: INVENTORY_MEDIA_PILLAR_ID, status: 503 };

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readSource(upstream: globalThis.Response): Promise<RelaySource> {
  const parsed = ErrorBodySchema.safeParse(await upstream.json().catch(() => null));
  const base = {
    pillar: INVENTORY_MEDIA_PILLAR_ID,
    status: upstream.status,
    upstreamStatus: upstream.status,
  };
  if (!parsed.success) return base;
  const { code, message, requestId, retryable, details } = parsed.data;
  return {
    ...base,
    code,
    message,
    requestId,
    retryable,
    ...(isRecord(details) ? { details } : {}),
  };
}

/** The phone's status and body for an inventory answer that is not a success. */
export async function mapDocumentBytesFailure(
  upstream: globalThis.Response
): Promise<{ status: number; body: MobileUpstreamError }> {
  const source = await readSource(upstream);
  if (RELAYED_STATUSES.has(upstream.status)) {
    const fallback: Classification['fallback'] =
      upstream.status === 503 ? 'unavailable' : 'contract_mismatch';
    return { status: upstream.status, body: relayBody(source, fallback) };
  }
  if (upstream.status === 401 || upstream.status === 403) {
    return { status: 502, body: relayBody(source, 'misconfigured') };
  }
  return { status: 502, body: relayBody(source, 'contract_mismatch') };
}

function sendUnreachable(res: Response): void {
  res.status(503).json(relayBody(UNREACHABLE, 'unavailable'));
}

async function sendFailure(res: Response, upstream: globalThis.Response): Promise<void> {
  const mapped = await mapDocumentBytesFailure(upstream);
  res.status(mapped.status).json(mapped.body);
}

function requestStream(req: Request): ReadableStream<Uint8Array> {
  const iterator = (async function* chunks(): AsyncGenerator<Uint8Array> {
    for await (const chunk of req) {
      if (!(chunk instanceof Uint8Array)) throw new TypeError('Request body chunk is not bytes');
      yield chunk;
    }
  })();
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

function refuseInvalid(req: Request, res: Response): void {
  // The body is never read; closing stops the phone streaming it at nobody.
  if (!req.complete) res.setHeader('Connection', 'close');
  res.status(400).json(invalidRequestBody());
}

async function upload(
  deps: MobileInventoryDocumentBytesDeps,
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const query = MobileDocumentUploadQuerySchema.safeParse(req.query);
  if (!query.success || req.params.id.length === 0) return refuseInvalid(req, res);

  const upstream = await deps.inventoryDocumentBytes.upload({
    itemId: req.params.id,
    query: query.data,
    body: requestStream(req),
    contentType: req.get('content-type'),
    contentLength: req.get('content-length'),
  });
  if (upstream === null) return sendUnreachable(res);
  if (upstream.status !== 202) return sendFailure(res, upstream);

  const accepted = AcceptedSchema.safeParse(await upstream.json().catch(() => null));
  if (!accepted.success) {
    res.status(502).json(relayBody({ ...UNREACHABLE, status: 202 }, 'contract_mismatch'));
    return;
  }
  res.status(202).json(accepted.data.data);
}

async function file(
  deps: MobileInventoryDocumentBytesDeps,
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const id = MobileDocumentIdSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json(invalidRequestBody());
    return;
  }
  const upstream = await deps.inventoryDocumentBytes.file(id.data, req.get('range'));
  if (upstream === null) return sendUnreachable(res);
  if (!STREAMED_STATUSES.has(upstream.status)) return sendFailure(res, upstream);

  res.status(upstream.status);
  for (const name of PASSED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) res.setHeader(name, value);
  }
  if (upstream.body === null) {
    res.end();
    return;
  }
  await pipeline(Readable.from(upstream.body), res);
}

/** Build the raw item-document router. Mount it behind the `/mobile` guards and ahead of any body parser. */
export function makeMobileInventoryDocumentBytesRouter(
  deps: MobileInventoryDocumentBytesDeps
): Router {
  const router = Router();
  router.post(MOBILE_INVENTORY_DOCUMENT_UPLOAD_PATH, (req, res) => upload(deps, req, res));
  router.get(MOBILE_INVENTORY_DOCUMENT_FILE_PATH, (req, res) => file(deps, req, res));
  return router;
}
