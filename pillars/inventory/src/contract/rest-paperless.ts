/**
 * `paperless.*` sub-router — Paperless-ngx integration status + document
 * search proxy. Search returns 412 when Paperless is not configured.
 *
 * Inventory's own wire contract, unchanged by the ADR-039 workstream-13
 * move: the paperless-ngx integration itself (the HTTP client, the raw
 * thumbnail proxy) now lives in the `documents` bridge pillar
 * (`pillars/documents/src/contract/rest-paperless.ts`, the canonical
 * definition). This copy stays so inventory's frontend keeps calling its
 * own backend unchanged; the handler implementation
 * (`../api/rest/paperless-handlers.ts`) now proxies to
 * `pillar('documents')` instead of an embedded client.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

export const inventoryPaperlessContract = c.router({
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
