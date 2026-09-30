import { requires } from './capabilities.js';
import {
  MobileInventoryItemsPageSchema,
  MobileInventoryItemsQuerySchema,
} from './mobile-inventory-list-schemas.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
} from './rest-mobile-responses.js';

export const mobileInventoryListRoutes = {
  listItems: {
    method: 'GET',
    path: '/mobile/inventory/items',
    query: MobileInventoryItemsQuerySchema,
    responses: {
      200: MobileInventoryItemsPageSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'One bounded, filtered page of live inventory items',
    metadata: requires('inventory.read'),
  },
} as const;
