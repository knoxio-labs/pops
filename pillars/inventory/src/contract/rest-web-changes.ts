import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';

const c = initContract();

/** The changed-elsewhere cursor and optional entity filter for web pages. */
export const WebChangesHeadQuerySchema = z.object({
  /** The head the page loaded at. Absent: return the head only. */
  since: z.coerce.number().int().min(0).optional(),
  /** Only changes to this item or location (detail pages). */
  entityId: z.string().min(1).optional(),
});

/** One actor's grouped set of inventory changes after a web page's cursor. */
export const WebChangeGroupSchema = z.object({
  actorKind: z.enum(['device', 'service', 'migration']),
  actorId: z.string().nullable(),
  actorLabel: z.string(),
  eventCount: z.number().int().positive(),
  entityCount: z.number().int().positive(),
  kindCounts: z.record(z.string(), z.number().int().positive()),
  latestServerTime: z.string(),
});

/** The head sequence and changed-elsewhere groups for inventory web pages. */
export const WebChangesHeadResponseSchema = z.object({
  headSeq: z.number().int().nonnegative(),
  groups: z.array(WebChangeGroupSchema),
});

/** The changed-elsewhere cursor router for inventory web pages. */
export const inventoryWebChangesContract = c.router({
  head: {
    method: 'GET',
    path: '/web/changes/head',
    query: WebChangesHeadQuerySchema,
    responses: { 200: WebChangesHeadResponseSchema, 400: ErrorBodySchema },
    summary: 'Read the inventory web change head and changed-elsewhere groups',
  },
});
