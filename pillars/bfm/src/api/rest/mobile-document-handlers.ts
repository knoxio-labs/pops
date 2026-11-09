import { isGatewayOk } from '../pillars/gateway.js';
import { toDocumentErrorResponse } from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobileDocumentsClient } from '../documents/client.js';

type Req = ServerInferRequest<typeof bfmContract>['mobileDocuments'];
/** Explicit Documents-owner reader supplied behind device capability authorization. */
export interface MobileDocumentsHandlerDeps {
  documents: MobileDocumentsClient;
}
/** Reads source metadata and preserves genuine missing/unconfigured owner outcomes. */
export function makeMobileDocumentsHandlers(deps: MobileDocumentsHandlerDeps) {
  return {
    getDocument: async ({ params }: Req['getDocument']) => {
      const outcome = await deps.documents.getDocument(params.id);
      return isGatewayOk(outcome)
        ? { status: 200 as const, body: outcome.value }
        : toDocumentErrorResponse(outcome);
    },
  };
}
