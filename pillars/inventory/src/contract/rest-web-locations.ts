/** The deleted-location summary consumed by the inventory web app. */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema, NonEmptyString } from './rest-schemas.js';

const c = initContract();

const Count = z.number().int().nonnegative();

/** The response body for `GET /web/locations/:id/gone`. */
export const WebLocationGoneResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  deletedAt: z.string(),
  deletedBy: z.object({ kind: z.string(), label: z.string() }).nullable(),
  inHandCount: z.number().int().nonnegative(),
});

/** Counts the live inventory directly or effectively held by one place. */
export const WebLocationTallySchema = z.object({
  places: Count,
  itemsHere: Count,
  boxesHere: Count,
  inBoxes: Count,
  total: Count,
});

/** The response body for `GET /web/locations/tallies`. */
export const WebLocationTalliesResponseSchema = z.object({
  tallies: z.record(z.string(), WebLocationTallySchema),
});

/** The deleted-location REST router for inventory web pages. */
export const inventoryWebLocationsContract = c.router({
  tallies: {
    method: 'GET',
    path: '/web/locations/tallies',
    responses: { 200: WebLocationTalliesResponseSchema },
    summary: 'Read inventory tallies for every live location',
  },
  gone: {
    method: 'GET',
    path: '/web/locations/:id/gone',
    pathParams: z.object({ id: NonEmptyString }),
    responses: { 200: WebLocationGoneResponseSchema, 404: ErrorBodySchema },
    summary: 'Read the summary of a deleted inventory location',
  },
});
