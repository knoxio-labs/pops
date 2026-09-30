import { z } from 'zod';

import { requires } from './capabilities.js';
import {
  MobileInventoryMediaBytesSchema,
  MobileInventoryMediaStoredSchema,
  MobileInventoryMediaUploadBodySchema,
  MobileInventoryMediaVariantSchema,
} from './mobile-inventory-media-schemas.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
} from './rest-mobile-responses.js';
import { MobilePayloadTooLargeErrorSchema, MobileUpstreamErrorSchema } from './rest-schemas.js';

/** Inventory media relay routes, kept after the sync routes in the public contract. */
export const mobileInventoryMediaRoutes = {
  /**
   * Store a photo's bytes ahead of `item.attachPhoto` (A13). Capability
   * `inventory.write` on the same reasoning `mutations` carries it: this
   * writes into inventory's media store, even though nothing here touches
   * `item_photos` — that reference is a later mutation, once the phone knows
   * this call answered `alreadyStored` or created.
   *
   * No `409`/`426`: this route never reads the replica, so neither the
   * resync nor the protocol-version question inventory's sync surface
   * answers applies to it.
   */
  putMedia: {
    method: 'PUT',
    path: '/mobile/inventory/media/:sha256',
    pathParams: z.object({ sha256: z.string().min(1) }),
    body: MobileInventoryMediaUploadBodySchema,
    responses: {
      200: MobileInventoryMediaStoredSchema,
      201: MobileInventoryMediaStoredSchema,
      413: MobilePayloadTooLargeErrorSchema,
      415: MobileUpstreamErrorSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: "Store a photo's bytes, content-addressed by their own sha256",
    metadata: requires('inventory.write'),
  },
  /** The read half of {@link putMedia}. Capability `inventory.read`, matching every other GET here. */
  getMedia: {
    method: 'GET',
    path: '/mobile/inventory/media/:sha256',
    pathParams: z.object({ sha256: z.string().min(1) }),
    query: z.object({ variant: MobileInventoryMediaVariantSchema.optional() }),
    responses: {
      200: MobileInventoryMediaBytesSchema,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: "A photo's bytes, base64, for a detail screen or a thumbnail row",
    metadata: requires('inventory.read'),
  },
} as const;
