import {
  MobileInventoryCatalogueUpstreamSchema,
  type MobileInventoryCatalogueUpstream,
} from '../../contract/mobile-inventory-protocol2-catalogue-schemas.js';
import { MobileInventoryCatalogueSchema } from '../../contract/mobile-inventory-schemas.js';
import { isGatewayOk } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';

import type {
  MobileInventoryCatalogue,
  MobileInventoryCatalogueRevisionDescriptor,
} from '../../contract/mobile-inventory-schemas.js';
import type { GatewayOutcome, PillarGateway } from '../pillars/gateway.js';

const INVENTORY_PILLAR_ID = 'inventory';

function normalizeCatalogueRevision(
  catalogue: MobileInventoryCatalogueUpstream
): MobileInventoryCatalogueRevisionDescriptor {
  return {
    ...catalogue,
    types: catalogue.types.map(({ parentTypeId, ...type }) => {
      const normalized = {
        ...type,
        fields: type.fields.map(({ defaultValues, ...field }) =>
          defaultValues === undefined || defaultValues.length === 0
            ? field
            : { ...field, defaultValues }
        ),
      };
      return parentTypeId == null ? normalized : { ...normalized, parentTypeId };
    }),
  };
}

/** The catalogue routes that bfm relays from the inventory pillar. */
export type InventoryCatalogueRouter = {
  types: {
    catalogue: (input: Record<string, never>) => Promise<unknown>;
    read: {
      catalogue: (input: { revision: number }) => Promise<unknown>;
    };
  };
};

/** Typed catalogue operations exposed by the mobile inventory client. */
export interface MobileInventoryCatalogueClient {
  catalogue(): Promise<GatewayOutcome<MobileInventoryCatalogue>>;
  catalogueRevision(
    revision: number
  ): Promise<GatewayOutcome<MobileInventoryCatalogueRevisionDescriptor>>;
}

/** Creates the catalogue operations backed by the inventory pillar gateway. */
export function createMobileInventoryCatalogueClient(
  gateway: PillarGateway
): MobileInventoryCatalogueClient {
  return {
    catalogue: async () => {
      const outcome = await gateway.call<InventoryCatalogueRouter, unknown>(
        INVENTORY_PILLAR_ID,
        (handle) => handle.types.catalogue({})
      );
      return parseOrMismatch(
        INVENTORY_PILLAR_ID,
        outcome,
        MobileInventoryCatalogueSchema,
        'types.catalogue'
      );
    },
    catalogueRevision: async (revision) => {
      const outcome = await gateway.call<InventoryCatalogueRouter, unknown>(
        INVENTORY_PILLAR_ID,
        (handle) => handle.types.read.catalogue({ revision })
      );
      const parsed = parseOrMismatch(
        INVENTORY_PILLAR_ID,
        outcome,
        MobileInventoryCatalogueUpstreamSchema,
        'types.read.catalogue'
      );
      return isGatewayOk(parsed)
        ? { ...parsed, value: normalizeCatalogueRevision(parsed.value) }
        : parsed;
    },
  };
}
