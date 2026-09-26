/** The deleted-location summary consumed by the inventory web app. */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ErrorBodySchema, NonEmptyString } from './rest-schemas.js';

const c = initContract();

/** The response body for `GET /web/locations/:id/gone`. */
export const WebLocationGoneResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  deletedAt: z.string(),
  deletedBy: z.object({ kind: z.string(), label: z.string() }).nullable(),
  inHandCount: z.number().int().nonnegative(),
});

/** The deleted-location REST router for inventory web pages. */
export const inventoryWebLocationsContract = c.router({
  gone: {
    method: 'GET',
    path: '/web/locations/:id/gone',
    pathParams: z.object({ id: NonEmptyString }),
    responses: { 200: WebLocationGoneResponseSchema, 404: ErrorBodySchema },
    summary: 'Read the summary of a deleted inventory location',
  },
});
