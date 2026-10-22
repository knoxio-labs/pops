import { z } from 'zod';

import { requires } from './capabilities.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
} from './rest-mobile-responses.js';
import { MobileUpstreamErrorSchema } from './rest-schemas.js';

const MobileInventoryItemRefSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  code: z.string().nullable(),
});

const MobileInventoryPartSchema = MobileInventoryItemRefSchema.extend({
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

/**
 * An item's assembly and parts, relayed field for field from inventory's
 * `items.getParts` (Inventory ADR-001, "Assemblies and parts"). Every key is
 * always present, nulls included, because the generated Swift client refuses
 * a missing one.
 */
export const MobileInventoryItemPartsSchema = z.object({
  canHaveParts: z.boolean(),
  assembly: MobileInventoryItemRefSchema.nullable(),
  parts: z.array(MobileInventoryPartSchema),
});

/** Body of `POST /mobile/inventory/items/:id/parts`. */
export const MobileInventoryAddPartBodySchema = z.object({ partItemId: z.string().min(1) });

/** The type of {@link MobileInventoryItemPartsSchema}. */
export type MobileInventoryItemParts = z.infer<typeof MobileInventoryItemPartsSchema>;

const PARTS_ERROR_RESPONSES = {
  404: MobileUpstreamErrorSchema,
  ...MOBILE_REQUEST_RESPONSES,
  ...MOBILE_PERIMETER_RESPONSES,
  ...MOBILE_UPSTREAM_RESPONSES,
} as const;

/**
 * Assemblies and parts. Online reads and writes, not replica rows: parts are
 * not in the sync protocol, so these never answer the sync routes' 409/426.
 * The writes relay inventory's own 409 (a type without the `parts`
 * capability, a part already in another assembly, a cycle) with its message,
 * because the phone shows it as-is.
 */
export const mobileInventoryPartsRoutes = {
  itemParts: {
    method: 'GET',
    path: '/mobile/inventory/items/:id/parts',
    pathParams: z.object({ id: z.string().min(1) }),
    responses: { 200: MobileInventoryItemPartsSchema, ...PARTS_ERROR_RESPONSES },
    summary: 'The assembly an item is a part of, and its own parts with where each one is',
    metadata: requires('inventory.read'),
  },
  addItemPart: {
    method: 'POST',
    path: '/mobile/inventory/items/:id/parts',
    pathParams: z.object({ id: z.string().min(1) }),
    body: MobileInventoryAddPartBodySchema,
    responses: {
      200: MobileInventoryItemPartsSchema,
      409: MobileUpstreamErrorSchema,
      ...PARTS_ERROR_RESPONSES,
    },
    summary: 'Make an existing item a part of this assembly',
    metadata: requires('inventory.write'),
  },
  removeItemPart: {
    method: 'DELETE',
    path: '/mobile/inventory/items/:id/parts/:partItemId',
    pathParams: z.object({ id: z.string().min(1), partItemId: z.string().min(1) }),
    body: z.object({}).optional(),
    responses: { 200: MobileInventoryItemPartsSchema, ...PARTS_ERROR_RESPONSES },
    summary: 'Stop an item being a part of this assembly; the item itself is kept',
    metadata: requires('inventory.write'),
  },
} as const;
