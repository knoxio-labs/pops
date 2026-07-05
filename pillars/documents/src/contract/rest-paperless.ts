/**
 * `paperless.*` sub-router — Paperless-ngx integration status + document
 * search. This is the canonical wire definition for the documents pillar's
 * paperless bridge (ADR-035 / ADR-039); `search` returns 412 when Paperless
 * is not configured.
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
      200: z.object({
        data: z.array(
          z.object({
            id: z.number(),
            title: z.string(),
            created: z.string(),
            originalFileName: z.string(),
            thumbnailUrl: z.string(),
          })
        ),
      }),
      412: ErrorBodySchema,
    },
    summary: 'Search Paperless-ngx documents (412 if not configured)',
  },
});
