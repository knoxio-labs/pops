import { z } from 'zod';

import { MobileOriginalDocumentSchema } from '../../contract/rest-mobile-documents.js';
import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';

import type { MobileOriginalDocument } from '../../contract/rest-mobile-documents.js';

type DocumentsReadRouter = {
  paperless: { get: (input: { id: number }) => Promise<unknown> };
};
const Envelope = z.object({ data: MobileOriginalDocumentSchema });
/** Reads the Documents original directly; no Inventory item or link participates. */
export interface MobileDocumentsClient {
  getDocument(id: number): Promise<GatewayOutcome<MobileOriginalDocument>>;
}
/** Builds authenticated source reads and rejects a response for a different original identity. */
export function createMobileDocumentsClient(gateway: PillarGateway): MobileDocumentsClient {
  return {
    getDocument: async (id) => {
      const result = await gateway.call<DocumentsReadRouter, unknown>('documents', (handle) =>
        handle.paperless.get({ id })
      );
      const parsed = parseOrMismatch('documents', result, Envelope, 'paperless.get');
      if (!isGatewayOk(parsed)) return parsed;
      if (parsed.value.data.id !== id) {
        return {
          kind: 'contract-mismatch',
          pillar: 'documents',
          status: 502,
          detail: 'Documents returned a different original identity',
        };
      }
      return { kind: 'ok', value: parsed.value.data };
    },
  };
}
