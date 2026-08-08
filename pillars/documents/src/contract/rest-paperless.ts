/**
 * `paperless.*` sub-router — Paperless-ngx integration status, document
 * search and single-document resolution. This is the canonical wire
 * definition for the documents pillar's paperless bridge (ADR-035 /
 * ADR-039); `search` and `get` return 412 when Paperless is not configured.
 *
 * `get` exists so holders of a soft `pops://documents/document/<id>` URI can
 * ask whether it still resolves. That distinction is load-bearing for the
 * consumers' nightly `staleAt` crons (ADR-042): only a genuine 404 means the
 * document is gone, and 412-when-unconfigured must never be mistaken for one.
 *
 * Moved from `pillars/inventory/src/contract/rest-paperless.ts` (workstream
 * 13, ADR-039 invariant 3): the documents pillar now owns the paperless
 * integration. Inventory keeps its own identically-shaped pass-through
 * contract for its frontend, backed by a `pillar('documents')` proxy call
 * instead of an embedded client — see
 * `pillars/inventory/src/api/documents/client.ts`.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

/** One document as this pillar projects it — the shape `search` and `get` both return. */
export const PaperlessDocumentSchema = z.object({
  id: z.number(),
  title: z.string(),
  created: z.string(),
  originalFileName: z.string(),
  thumbnailUrl: z.string(),
});

export const documentsPaperlessContract = c.router({
  status: {
    method: 'GET',
    path: '/paperless/status',
    responses: {
      200: z.object({
        data: z.object({
          configured: z.boolean(),
          available: z.boolean(),
          baseUrl: z.string().nullable(),
        }),
      }),
    },
    summary: 'Whether Paperless-ngx is configured and reachable',
  },
  search: {
    method: 'GET',
    path: '/paperless/search',
    query: z.object({ query: z.string().min(2).max(200) }),
    responses: {
      200: z.object({ data: z.array(PaperlessDocumentSchema) }),
      412: ErrorBodySchema,
    },
    summary: 'Search Paperless-ngx documents (412 if not configured)',
  },
  get: {
    method: 'GET',
    path: '/paperless/documents/:id',
    pathParams: z.object({ id: z.coerce.number().int().positive() }),
    responses: {
      200: z.object({ data: PaperlessDocumentSchema }),
      404: ErrorBodySchema,
      412: ErrorBodySchema,
    },
    summary: 'Resolve one Paperless-ngx document by id (404 when it no longer exists)',
  },
});
