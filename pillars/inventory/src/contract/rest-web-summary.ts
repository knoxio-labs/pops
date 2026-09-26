/**
 * The aggregate counts consumed by the inventory web Overview and Containers
 * surfaces.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();
const Count = z.number().int().nonnegative();

/** The response body for `GET /web/summary`. */
export const WebSummaryResponseSchema = z.object({
  counts: z.object({
    items: Count,
    things: Count,
    containers: Count,
    openContainers: Count,
    locations: Count,
    inHand: Count,
  }),
  containerSegments: z.object({
    all: Count,
    open: Count,
    closed: Count,
    full: Count,
    moving: Count,
    retired: Count,
  }),
  packing: z.object({
    closed: Count,
    fullButOpen: Count,
    open: Count,
    packedItems: Count,
  }),
  moving: z.object({
    closed: Count,
    total: Count,
    open: Count,
    full: Count,
    packed: Count,
  }),
});

/** The inventory web summary REST router. */
export const inventoryWebSummaryContract = c.router({
  get: {
    method: 'GET',
    path: '/web/summary',
    responses: { 200: WebSummaryResponseSchema },
    summary: 'Overview and container segment counts for the inventory web app',
  },
});
