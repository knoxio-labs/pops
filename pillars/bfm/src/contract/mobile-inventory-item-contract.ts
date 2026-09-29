import { z } from 'zod';

import { requires } from './capabilities.js';
import {
  MobileClientTooOldErrorSchema,
  MobileInventoryItemResultSchema,
} from './mobile-inventory-schemas.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
} from './rest-mobile-responses.js';
import { MobileUpstreamErrorSchema } from './rest-schemas.js';

/** The targeted item read used to retry one item-specific sync issue. */
export const mobileInventoryItemContract = {
  method: 'GET' as const,
  path: '/mobile/inventory/sync/items/:id' as const,
  pathParams: z.object({ id: z.string().min(1) }),
  responses: {
    200: MobileInventoryItemResultSchema,
    404: MobileUpstreamErrorSchema,
    426: MobileClientTooOldErrorSchema,
    ...MOBILE_REQUEST_RESPONSES,
    ...MOBILE_PERIMETER_RESPONSES,
    ...MOBILE_UPSTREAM_RESPONSES,
  },
  summary: 'Read one item and any compatibility issues recorded while projecting it',
  metadata: requires('inventory.read'),
};
