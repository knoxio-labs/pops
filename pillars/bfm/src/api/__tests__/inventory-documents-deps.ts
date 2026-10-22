/**
 * The item-document clients `createTestApp` wires when a suite supplies none:
 * the contract client over a gateway that throws, the bytes client over a
 * discovery that finds nothing (`503`) — loud, and never a real network call.
 */
import { createMobileInventoryDocumentBytesClient } from '../inventory/document-bytes-client.js';
import { createMobileInventoryDocumentsClient } from '../inventory/documents-client.js';
import { createPillarGateway } from '../pillars/gateway.js';

import type { BfmApiDeps } from '../app.js';
import type { MobileInventoryDocumentBytesClient } from '../inventory/document-bytes-client.js';
import type { MobileInventoryDocumentsClient } from '../inventory/documents-client.js';
import type { PillarHandleFactory } from '../pillars/gateway.js';

/** The item-document seams a suite may fake. */
export interface InventoryDocumentTestOptions {
  inventoryDocuments?: MobileInventoryDocumentsClient;
  inventoryDocumentBytes?: MobileInventoryDocumentBytesClient;
}

const unreachableHandleFactory: PillarHandleFactory = (pillarId: string) => {
  throw new Error(`[bfm-test] this test called ${pillarId} documents without supplying a fake`);
};

/** The supplied clients, or the refusing defaults. */
export function inventoryDocumentDeps(
  options: InventoryDocumentTestOptions
): Pick<BfmApiDeps, 'inventoryDocuments' | 'inventoryDocumentBytes'> {
  return {
    inventoryDocuments:
      options.inventoryDocuments ??
      createMobileInventoryDocumentsClient(createPillarGateway(unreachableHandleFactory)),
    inventoryDocumentBytes:
      options.inventoryDocumentBytes ??
      createMobileInventoryDocumentBytesClient({
        discovery: { lookup: () => Promise.resolve(undefined) },
      }),
  };
}
