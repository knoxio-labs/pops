import { createMobileDocumentsBytesClient } from '../documents/bytes-client.js';
import { createMobileDocumentsClient } from '../documents/client.js';
import {
  createMobileDocumentsUploadClient,
  type MobileDocumentsUploadClient,
} from '../documents/upload-client.js';
import { createPillarGateway } from '../pillars/gateway.js';

import type { BfmApiDeps } from '../app.js';
import type { MobileDocumentsBytesClient } from '../documents/bytes-client.js';
import type { MobileDocumentsClient } from '../documents/client.js';
import type { PillarHandleFactory } from '../pillars/gateway.js';

/** Direct original-document overrides, separate from Inventory item-link test fixtures. */
export interface DocumentTestOptions {
  documents?: MobileDocumentsClient;
  documentUploads?: MobileDocumentsUploadClient;
  documentBytes?: MobileDocumentsBytesClient;
}
/** Supplies loud, local-only defaults when a test did not configure a Documents owner. */
export function documentsDeps(
  options: DocumentTestOptions,
  factory: PillarHandleFactory
): Pick<BfmApiDeps, 'documents' | 'documentBytes' | 'documentUploads'> {
  return {
    documentUploads:
      options.documentUploads ??
      createMobileDocumentsUploadClient({
        discovery: { lookup: () => Promise.resolve(undefined) },
      }),
    documents: options.documents ?? createMobileDocumentsClient(createPillarGateway(factory)),
    documentBytes:
      options.documentBytes ??
      createMobileDocumentsBytesClient({ discovery: { lookup: () => Promise.resolve(undefined) } }),
  };
}
