/** The resolved connection registry consumed by the inventory web app. */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

/** Query parameters accepted by `GET /web/connections`. */
export const WebConnectionsQuerySchema = z.object({
  kind: z.enum(['all', 'item', 'fixture']).default('all'),
  q: z.string().trim().min(1).max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** The resolved item end of a web connection row. */
export const ConnectionItemEndSchema = z.object({
  kind: z.literal('item'),
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  typeKey: z.string().nullable(),
  isContainer: z.boolean(),
  lifecycle: z.string(),
});

/** The resolved fixture end of a web connection row. */
export const ConnectionFixtureEndSchema = z.object({
  kind: z.literal('fixture'),
  id: z.string(),
  name: z.string(),
  type: z.string(),
  locationId: z.string().nullable(),
});

/** One resolved item-to-item or item-to-fixture connection. */
export const WebConnectionRowSchema = z.object({
  /** `item:<item_connections.id>` or `fixture:<item_fixture_connections.id>`. */
  id: z.string(),
  createdAt: z.string(),
  item: ConnectionItemEndSchema,
  far: z.discriminatedUnion('kind', [ConnectionItemEndSchema, ConnectionFixtureEndSchema]),
});

/** The cursor page and filter-wide registry summary. */
export const WebConnectionsResponseSchema = z.object({
  rows: z.array(WebConnectionRowSchema),
  nextCursor: z.string().nullable(),
  /** Over every row matching kind and q, not just this page. */
  summary: z.object({
    connections: z.number().int(),
    items: z.number().int(),
    fixtures: z.number().int(),
  }),
});

/** The inventory web connection registry REST router. */
export const inventoryWebConnectionsContract = c.router({
  list: {
    method: 'GET',
    path: '/web/connections',
    query: WebConnectionsQuerySchema,
    responses: { 200: WebConnectionsResponseSchema, 400: ErrorBodySchema },
    summary: 'List resolved inventory item and fixture connections',
  },
});
