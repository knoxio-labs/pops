import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';
import { SyncEventSchema } from './rest-sync-schemas.js';

const c = initContract();

/** The server event kinds shown by the inventory web activity and history filters. */
export const ACTIVITY_KIND_GROUPS = {
  placement: ['moved', 'stored', 'picked_up', 'put_back'],
  containers: ['opened', 'closed'],
  edits: [
    'edited',
    'code_set',
    'type_changed',
    'quantity_changed',
    'split_from',
    'split_into',
    'photo_added',
    'photo_removed',
    'override_set',
    'override_cleared',
  ],
  lifecycle: ['lifecycle_changed', 'restored'],
  created: ['created'],
} as const;

/** The server event kinds shown by the inventory item-history filters. */
export const HISTORY_KIND_GROUPS = {
  placement: ['moved', 'stored', 'picked_up', 'put_back', 'opened', 'closed'],
  details: [
    'created',
    'edited',
    'code_set',
    'type_changed',
    'quantity_changed',
    'split_from',
    'split_into',
    'photo_added',
    'photo_removed',
    'override_set',
    'override_cleared',
  ],
  lifecycle: ['lifecycle_changed', 'restored'],
} as const;

/** Query parameters accepted by `GET /web/events`. */
export const WebEventsQuerySchema = z.object({
  kind: z
    .string()
    .regex(/^[a-z_]+(,[a-z_]+)*$/u)
    .optional(),
  actorKind: z.enum(['device', 'web', 'service', 'migration']).optional(),
  entityId: z.string().min(1).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** One sync event with the current display name of its item or location. */
export const WebEventSchema = SyncEventSchema.extend({ entityName: z.string() });

/** The cursor-paged response for `GET /web/events`. */
export const WebEventsResponseSchema = z.object({
  events: z.array(WebEventSchema),
  nextCursor: z.string().nullable(),
  /** Count per server kind under every filter except `kind`, over all pages. */
  kindCounts: z.record(z.string(), z.number().int().nonnegative()),
  /** All events under every filter except `kind`. */
  total: z.number().int().nonnegative(),
});

/** The inventory web activity and item-history event feed router. */
export const inventoryWebEventsContract = c.router({
  list: {
    method: 'GET',
    path: '/web/events',
    query: WebEventsQuerySchema,
    responses: { 200: WebEventsResponseSchema, 400: ErrorBodySchema },
    summary: 'List the inventory activity and item-history events',
  },
});
