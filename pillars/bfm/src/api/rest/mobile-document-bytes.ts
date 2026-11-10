import { Router } from 'express';

import { MobileOriginalDocumentParams } from '../../contract/rest-mobile-documents.js';
import { invalidRequestBody } from '../errors.js';
import { MOBILE_DOCUMENT_FILE_PATH } from '../paths.js';
import { readRawDocumentFailure, streamDocumentResponse } from './raw-document-response.js';
import { relayBody } from './upstream-error.js';

import type { MobileDocumentsBytesClient } from '../documents/bytes-client.js';

/** Documents-original file source, independently authorized from Trips and Inventory reads. */
export interface MobileDocumentsBytesHandlerDeps {
  documentBytes: MobileDocumentsBytesClient;
}
/** Streams actual source bytes, preserving range responses and owner missing/unconfigured errors. */
export function makeMobileDocumentsBytesRouter(deps: MobileDocumentsBytesHandlerDeps): Router {
  const router = Router();
  router.get(MOBILE_DOCUMENT_FILE_PATH, async (req, res) => {
    const params = MobileOriginalDocumentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json(invalidRequestBody());
      return;
    }
    const upstream = await deps.documentBytes.file(params.data.id, req.get('range'));
    if (upstream === null) {
      res.status(503).json(relayBody({ pillar: 'documents', status: 503 }, 'unavailable'));
      return;
    }
    if ([200, 206, 416].includes(upstream.status)) {
      await streamDocumentResponse(upstream, res);
      return;
    }
    const source = await readRawDocumentFailure(upstream, 'documents');
    const status = [404, 412, 502, 503].includes(upstream.status) ? upstream.status : 502;
    let fallback: 'unavailable' | 'misconfigured' | 'contract_mismatch' = 'contract_mismatch';
    if (upstream.status === 503) fallback = 'unavailable';
    if (upstream.status === 401 || upstream.status === 403) fallback = 'misconfigured';
    res.status(status).json(relayBody(source, fallback));
  });
  return router;
}
