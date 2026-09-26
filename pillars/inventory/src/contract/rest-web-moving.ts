/** The stages a live moving-day box can be in. */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema } from './rest-schemas.js';
import { SyncPlacementSchema } from './rest-sync-schemas.js';

const c = initContract();

/** The stages a moving-day box can be in, ordered from packing to closed. */
export const MOVING_BOX_STAGES = ['packing', 'full', 'closed'] as const;

/** Query parameters for the moving-day aggregate. */
export const WebMovingQuerySchema = z.object({
  /** The enum field key that stores a box's destination. */
  destinationField: z.string().trim().min(1).default('Destination'),
  /** The place being packed up; without it, every root place is a home. */
  homeLocationId: z.string().min(1).optional(),
});

const Thing = z.object({ id: z.string(), name: z.string(), code: z.string().nullable() });

/** A destination enum option shown on the moving-day board. */
export const MovingDestinationSchema = z.object({ optionKey: z.string(), label: z.string() });

/** One live box and the live items beneath it. */
export const MovingBoxSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  stage: z.enum(MOVING_BOX_STAGES),
  count: z.number().int().nonnegative(),
  destination: MovingDestinationSchema.nullable(),
  placement: SyncPlacementSchema,
  contents: z.array(Thing.extend({ containerId: z.string() })),
});

/** The aggregate consumed by the inventory moving-day page and overview strip. */
export const WebMovingResponseSchema = z.object({
  boxes: z.array(MovingBoxSchema),
  stages: z.object({
    packing: z.number().int(),
    full: z.number().int(),
    closed: z.number().int(),
  }),
  packed: z.number().int().nonnegative(),
  loose: z.array(
    z.object({
      room: z.object({ id: z.string(), name: z.string() }),
      items: z.array(Thing),
    })
  ),
  looseCount: z.number().int().nonnegative(),
  inHand: z.array(Thing),
  unlabelledClosed: z.number().int().nonnegative(),
  /** Destination options in catalogue order for the board columns. */
  destinationOptions: z.array(MovingDestinationSchema),
});

/** REST router for the moving-day aggregate. */
export const inventoryWebMovingContract = c.router({
  get: {
    method: 'GET',
    path: '/web/moving-day',
    query: WebMovingQuerySchema,
    responses: { 200: WebMovingResponseSchema, 400: ErrorBodySchema },
    summary: 'Read the moving-day boxes, placements and progress aggregate',
  },
});
