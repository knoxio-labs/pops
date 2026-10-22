/**
 * `items.*Parts` routes: which assembly an item is a part of, and its parts
 * (Inventory ADR-001, "Assemblies and parts"). They sit under `items` so the
 * `inventory.items` service-account grant covers them.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { ERR_RESPONSES, NonEmptyString } from './rest-schemas.js';

const c = initContract();

const ItemRefSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
});

const PartSummarySchema = ItemRefSchema.extend({
  typeId: z.string().nullable(),
  lifecycle: z.string(),
  placement: z.object({
    kind: z.enum(['location', 'container', 'hand']),
    locationId: z.string().nullable(),
    locationName: z.string().nullable(),
    containingItemId: z.string().nullable(),
    containingItemName: z.string().nullable(),
  }),
});

/** An item's assembly and parts; `canHaveParts` follows its type's `parts` capability. */
export const ItemPartsSchema = z
  .object({
    canHaveParts: z.boolean(),
    assembly: ItemRefSchema.nullable(),
    parts: z.array(PartSummarySchema),
  })
  .meta({ id: 'ItemParts' });

const ItemPathParams = z.object({ itemId: NonEmptyString });

/** Spread into `inventoryItemsContract`. */
export const itemPartsRoutes = c.router({
  getParts: {
    method: 'GET',
    path: '/items/:itemId/parts',
    pathParams: ItemPathParams,
    responses: { 200: z.object({ data: ItemPartsSchema }), ...ERR_RESPONSES },
    summary: 'Read the assembly an item is a part of, and its own parts with where each one is',
  },
  addPart: {
    method: 'POST',
    path: '/items/:itemId/parts',
    pathParams: ItemPathParams,
    body: z.object({ partItemId: NonEmptyString }),
    responses: { 200: z.object({ data: ItemPartsSchema }), ...ERR_RESPONSES },
    summary:
      'Make an existing item a part of this assembly; the assembly type must grant the parts capability',
  },
  removePart: {
    method: 'DELETE',
    path: '/items/:itemId/parts/:partItemId',
    pathParams: z.object({ itemId: NonEmptyString, partItemId: NonEmptyString }),
    body: z.object({}).optional(),
    responses: { 200: z.object({ data: ItemPartsSchema }), ...ERR_RESPONSES },
    summary: 'Stop an item being a part of this assembly; the item itself is kept',
  },
});
