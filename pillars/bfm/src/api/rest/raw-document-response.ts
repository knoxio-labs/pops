import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { ErrorBodySchema } from '@pops/types';

import type { Response } from 'express';

import type { RelaySource } from './upstream-error.js';

const HEADERS = [
  'content-type',
  'content-length',
  'content-disposition',
  'content-range',
  'accept-ranges',
  'etag',
  'last-modified',
] as const;
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Preserves a document owner's error envelope without exposing unrelated upstream headers. */
export async function readRawDocumentFailure(
  upstream: globalThis.Response,
  pillar: string
): Promise<RelaySource> {
  const parsed = ErrorBodySchema.safeParse(await upstream.json().catch(() => null));
  const base = { pillar, status: upstream.status, upstreamStatus: upstream.status };
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
/** Streams original bytes with representation/range validators; no buffering or cache-availability claim. */
export async function streamDocumentResponse(
  upstream: globalThis.Response,
  res: Response
): Promise<void> {
  res.status(upstream.status);
  for (const name of HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) res.setHeader(name, value);
  }
  if (upstream.body === null) {
    res.end();
    return;
  }
  await pipeline(Readable.from(upstream.body), res);
}
