/**
 * Handlers for the contract half of an item's documents: list, edit, unlink,
 * dismiss. The raw upload and file are `mobile-inventory-document-bytes.ts`.
 */
import { isGatewayOk } from '../pillars/gateway.js';
import {
  toCollectionUpstreamErrorResponse,
  toDocumentErrorResponse,
  toUpstreamErrorResponse,
} from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobileInventoryDocumentsClient } from '../inventory/documents-client.js';

type Req = ServerInferRequest<typeof bfmContract>['mobileInventory'];

/** Dependencies for the item-document contract routes. */
export interface MobileInventoryDocumentHandlerDeps {
  inventoryDocuments: MobileInventoryDocumentsClient;
}

/** Build the item-document handlers. */
export function makeMobileInventoryDocumentHandlers(deps: MobileInventoryDocumentHandlerDeps) {
  return {
    listItemDocuments: async ({ params }: Req['listItemDocuments']) => {
      const outcome = await deps.inventoryDocuments.list(params.id);
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);
      return { status: 200 as const, body: outcome.value };
    },

    updateItemDocument: async ({ params, body }: Req['updateItemDocument']) => {
      const outcome = await deps.inventoryDocuments.update(params.id, body);
      if (!isGatewayOk(outcome)) return toDocumentErrorResponse(outcome);
      return { status: 200 as const, body: outcome.value };
    },

    unlinkItemDocument: async ({ params }: Req['unlinkItemDocument']) => {
      const outcome = await deps.inventoryDocuments.unlink(params.id);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);
      return { status: 200 as const, body: { id: params.id } };
    },

    dismissDocumentIngestion: async ({ params }: Req['dismissDocumentIngestion']) => {
      const outcome = await deps.inventoryDocuments.dismissIngestion(params.id);
      if (!isGatewayOk(outcome)) return toUpstreamErrorResponse(outcome);
      return { status: 200 as const, body: { id: params.id } };
    },
  };
}
