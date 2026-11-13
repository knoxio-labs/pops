import { MobileDocumentIngestQuerySchema } from '../../contract/rest-mobile-documents.js';
import { bfmErrorBody, invalidRequestBody } from '../errors.js';
import { isGatewayOk } from '../pillars/gateway.js';
import { relayBody, toCollectionUpstreamErrorResponse } from '../rest/upstream-error.js';

import type { Request, Response } from 'express';

import type { MobileDocumentPolicy } from '../../contract/rest-mobile-documents.js';
import type { MobileDocumentsClient } from './client.js';
import type { DocumentIngestRequest } from './upload-client.js';

/** Validated metadata and live byte bound for one upload, before owner POST dispatch. */
export type PreparedDocumentUpload = Pick<
  DocumentIngestRequest,
  'query' | 'contentType' | 'contentLength'
> & {
  readonly limitBytes: number;
};

function allowedMime(mime: string | undefined, allowed: readonly string[]): mime is string {
  if (mime === undefined || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(mime)) return false;
  const [type] = mime.split('/', 1);
  return allowed.some((value) => value === mime || value === `${type}/*`);
}

function refuse(
  res: Response,
  status: number,
  reason: 'invalid' | 'upload_too_large' | 'upload_unsupported_type'
): void {
  res.setHeader('Connection', 'close');
  res.status(status).json(reason === 'invalid' ? invalidRequestBody() : bfmErrorBody(reason));
}

async function livePolicy(
  documents: MobileDocumentsClient,
  res: Response
): Promise<MobileDocumentPolicy | undefined> {
  const policy = await documents.status();
  if (!isGatewayOk(policy)) {
    const failure = toCollectionUpstreamErrorResponse(policy);
    res.setHeader('Connection', 'close');
    res.status(failure.status).json(failure.body);
    return undefined;
  }
  if (!policy.value.configured || !policy.value.available) {
    const status = policy.value.configured ? 503 : 412;
    res.setHeader('Connection', 'close');
    res.status(status).json(relayBody({ pillar: 'documents', status }, 'unavailable'));
    return undefined;
  }
  return policy.value;
}

function headers(
  req: Request,
  res: Response,
  policy: MobileDocumentPolicy
): Pick<DocumentIngestRequest, 'contentType' | 'contentLength'> | undefined {
  const mime = req.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (!allowedMime(mime, policy.allowedMimeTypes)) {
    refuse(res, 415, 'upload_unsupported_type');
    return undefined;
  }
  const length = req.get('content-length');
  if (length !== undefined && (!/^\d+$/u.test(length) || !Number.isSafeInteger(Number(length)))) {
    refuse(res, 400, 'invalid');
    return undefined;
  }
  if (length !== undefined && Number(length) > policy.maxUploadBytes) {
    refuse(res, 413, 'upload_too_large');
    return undefined;
  }
  return { contentType: mime, ...(length === undefined ? {} : { contentLength: length }) };
}

/** Applies owner MIME families and size policy server-side, independently of device read authority. */
export async function prepareDocumentUpload(
  documents: MobileDocumentsClient,
  req: Request,
  res: Response
): Promise<PreparedDocumentUpload | undefined> {
  const query = MobileDocumentIngestQuerySchema.safeParse(req.query);
  if (!query.success) {
    refuse(res, 400, 'invalid');
    return undefined;
  }
  const policy = await livePolicy(documents, res);
  if (policy === undefined) return undefined;
  const metadata = headers(req, res, policy);
  if (metadata === undefined) return undefined;
  return { query: query.data, ...metadata, limitBytes: policy.maxUploadBytes };
}
