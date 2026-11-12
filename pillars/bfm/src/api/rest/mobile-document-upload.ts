import { Router } from 'express';
import { z } from 'zod';

import { MobileDocumentAcceptedSchema } from '../../contract/rest-mobile-documents.js';
import { documentUploadBody } from '../documents/upload-body.js';
import { prepareDocumentUpload } from '../documents/upload-policy.js';
import { bfmErrorBody } from '../errors.js';
import { MOBILE_DOCUMENT_UPLOAD_PATH } from '../paths.js';
import { readRawDocumentFailure } from './raw-document-response.js';
import { relayBody } from './upstream-error.js';

import type { Request, Response } from 'express';

import type { MobileDocumentsClient } from '../documents/client.js';
import type {
  DocumentIngestOutcome,
  MobileDocumentsUploadClient,
} from '../documents/upload-client.js';

/** Separate upload transport and server-side policy read; a device read grant is not required. */
export interface MobileDocumentUploadDeps {
  documents: MobileDocumentsClient;
  documentUploads: MobileDocumentsUploadClient;
}

const AcceptedEnvelope = z.strictObject({ data: MobileDocumentAcceptedSchema });

function unknown(res: Response, upstreamStatus?: number): void {
  res.status(502).json(
    bfmErrorBody('upload_outcome_unknown', {
      ...(upstreamStatus === undefined
        ? {}
        : {
            details: {
              upstream: { pillar: 'documents', status: upstreamStatus },
              cause:
                upstreamStatus === 401 || upstreamStatus === 403
                  ? 'owner_auth_refused'
                  : 'owner_response_unconfirmed',
            },
          }),
    })
  );
}

async function respond(outcome: DocumentIngestOutcome, res: Response): Promise<void> {
  if (outcome.kind === 'not-sent') {
    res.status(503).json(relayBody({ pillar: 'documents', status: 503 }, 'unavailable'));
    return;
  }
  if (outcome.kind === 'unknown') {
    unknown(res);
    return;
  }
  const upstream = outcome.response;
  if (upstream.status === 202) {
    const accepted = AcceptedEnvelope.safeParse(await upstream.json().catch(() => null));
    if (!accepted.success) {
      unknown(res, 202);
      return;
    }
    res.status(202).json(accepted.data.data);
    return;
  }
  if ([400, 413, 415, 422].includes(upstream.status)) {
    const failure = await readRawDocumentFailure(upstream, 'documents');
    res
      .status(upstream.status)
      .json({ ...relayBody(failure, 'contract_mismatch'), retryable: false });
    return;
  }
  await upstream.body?.cancel();
  unknown(res, upstream.status);
}

async function upload(deps: MobileDocumentUploadDeps, req: Request, res: Response): Promise<void> {
  const prepared = await prepareDocumentUpload(deps.documents, req, res);
  if (prepared === undefined) return;
  const controller = new AbortController();
  const aborted = (): void => controller.abort();
  req.once('aborted', aborted);
  if (req.aborted) controller.abort();
  try {
    const outcome = await deps.documentUploads.upload({
      query: prepared.query,
      body: documentUploadBody(req, prepared.limitBytes),
      contentType: prepared.contentType,
      ...(prepared.contentLength === undefined ? {} : { contentLength: prepared.contentLength }),
      signal: controller.signal,
    });
    await respond(outcome, res);
  } finally {
    req.off('aborted', aborted);
  }
}

/** Mount after mobile perimeter/capability guards and before every body parser. */
export function makeMobileDocumentUploadRouter(deps: MobileDocumentUploadDeps): Router {
  const router = Router();
  router.post(MOBILE_DOCUMENT_UPLOAD_PATH, (req, res) => upload(deps, req, res));
  return router;
}
