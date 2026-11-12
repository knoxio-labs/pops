import { z } from 'zod';

import {
  MobileDocumentPolicySchema,
  MobileDocumentTaskSchema,
  MobileOriginalDocumentSchema,
} from '../../contract/rest-mobile-documents.js';
import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';

import type {
  MobileDocumentPolicy,
  MobileDocumentTask,
  MobileOriginalDocument,
} from '../../contract/rest-mobile-documents.js';

type DocumentsReadRouter = {
  paperless: {
    get: (input: { id: number }) => Promise<unknown>;
    status: () => Promise<unknown>;
    task: (input: { taskId: string }) => Promise<unknown>;
  };
};
const Envelope = z.object({ data: MobileOriginalDocumentSchema });
/** Reads the Documents original directly; no Inventory item or link participates. */
export interface MobileDocumentsClient {
  status(): Promise<GatewayOutcome<MobileDocumentPolicy>>;
  task(taskId: string): Promise<GatewayOutcome<MobileDocumentTask>>;
  getDocument(id: number): Promise<GatewayOutcome<MobileOriginalDocument>>;
}
/** Builds authenticated source reads and rejects a response for a different original identity. */
export function createMobileDocumentsClient(gateway: PillarGateway): MobileDocumentsClient {
  return {
    status: async () => {
      const result = await gateway.call<DocumentsReadRouter, unknown>('documents', (handle) =>
        handle.paperless.status()
      );
      const parsed = parseOrMismatch(
        'documents',
        result,
        z.object({ data: MobileDocumentPolicySchema }),
        'paperless.status'
      );
      return isGatewayOk(parsed) ? { kind: 'ok', value: parsed.value.data } : parsed;
    },
    task: async (taskId) => {
      const result = await gateway.call<DocumentsReadRouter, unknown>('documents', (handle) =>
        handle.paperless.task({ taskId })
      );
      const parsed = parseOrMismatch(
        'documents',
        result,
        z.object({ data: MobileDocumentTaskSchema }),
        'paperless.task'
      );
      return isGatewayOk(parsed) ? { kind: 'ok', value: parsed.value.data } : parsed;
    },
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
