/**
 * `GET /paperless/documents/:id/download` — streams a document's file from
 * Paperless, the original upload unless `?original=false`.
 *
 * Range is honoured so QuickLook and browser PDF viewers can seek: a 206
 * from Paperless passes through, and a 200 answering a ranged request (what
 * Paperless 3.2.1 sends) is sliced here.
 */
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { defineErrors } from '@pops/pillar-express';

import { PaperlessApiError } from '../modules/paperless/types.js';
import { requirePaperlessClient, throwPaperlessFailure } from '../paperless-errors.js';
import { resolveByteRange, sliceBytes } from './range.js';

import type { Request, Response } from 'express';

/** The Express path the download route registers, as the scope gate declares it. */
export const DOWNLOAD_ROUTE_PATH = '/paperless/documents/:id/download';

const downloadErrors = defineErrors('documents', {
  invalid_id: {
    area: 'download',
    status: 400,
    message: 'The document id is invalid.',
    retryable: false,
  },
});

const PASSTHROUGH_HEADERS = ['content-type', 'content-disposition', 'last-modified', 'etag'];

function knownLength(upstream: globalThis.Response): number | null {
  const raw = upstream.headers.get('content-length');
  if (raw === null || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

function copyHeaders(upstream: globalThis.Response, res: Response): void {
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) res.setHeader(name, value);
  }
}

async function streamBody(body: AsyncIterable<Uint8Array>, res: Response): Promise<void> {
  await pipeline(Readable.from(body), res);
}

async function relay(
  upstream: globalThis.Response,
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  const body = upstream.body;
  copyHeaders(upstream, res);
  const size = knownLength(upstream);
  if (upstream.status === 206) {
    res.status(206);
    const contentRange = upstream.headers.get('content-range');
    if (contentRange !== null) res.setHeader('Content-Range', contentRange);
    if (size !== null) res.setHeader('Content-Length', String(size));
    return body === null ? void res.end() : streamBody(body, res);
  }
  const range = resolveByteRange(req.get('range'), size);
  if (size !== null) res.setHeader('Accept-Ranges', 'bytes');
  if (range.kind === 'unsatisfiable') {
    await body?.cancel();
    res
      .status(416)
      .setHeader('Content-Range', `bytes */${String(size)}`)
      .end();
    return;
  }
  if (range.kind === 'partial' && body !== null) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${String(size)}`);
    res.setHeader('Content-Length', String(range.end - range.start + 1));
    return streamBody(sliceBytes(body, range.start, range.end), res);
  }
  res.status(200);
  if (size !== null) res.setHeader('Content-Length', String(size));
  return body === null ? void res.end() : streamBody(body, res);
}

/** Handle one download request. */
export async function handleDownload(req: Request<{ id: string }>, res: Response): Promise<void> {
  const { id } = req.params;
  if (!/^\d+$/.test(id) || Number(id) <= 0) return downloadErrors.invalid_id({ id });
  const original = req.query['original'] !== 'false';
  const client = requirePaperlessClient();
  const range = req.get('range');
  let upstream: globalThis.Response;
  try {
    upstream = await client.fetchDownload(Number(id), { original, range });
  } catch (err) {
    return throwPaperlessFailure(err);
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    const failure = new PaperlessApiError(upstream.status, `download answered ${upstream.status}`);
    return throwPaperlessFailure(failure, Number(id));
  }
  await relay(upstream, req, res);
}
