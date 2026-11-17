import { documentsOwner } from '../tools/documents-owner-client.js';
import { documentsReadContracts } from '../tools/documents-owner-contract.js';
import {
  isUploadProofRecord,
  matchesUploadInput,
  uploadResponseData,
} from '../tools/documents-upload-proof.js';
import { uploadPaperlessContent } from './paperless-owner-content.js';
import { uploadErrors } from './upload-errors.js';

import type { Request, Response } from 'express';

import type { CallResult } from '@pops/pillar-sdk/client';

import type { DocumentUploadDeps } from './inventory-documents.js';
import type { PaperlessUploadTarget } from './upload-tokens.js';

/** Admit exact bytes to the durable owner, then explicitly dispatch the same operation once. */
export async function storePaperlessUpload(
  req: Request,
  res: Response,
  target: PaperlessUploadTarget,
  options: { readonly deps?: DocumentUploadDeps } = {}
): Promise<void> {
  res.setHeader('Connection', 'close');
  const contentType = req.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== target.mimeType) return uploadErrors.unsupported_document_type();
  const content = await uploadPaperlessContent(
    {
      body: req,
      contentType,
      ...(req.get('content-length') === undefined
        ? {}
        : { contentLength: req.get('content-length') }),
    },
    target,
    options.deps
  );
  if (content.kind === 'refused')
    return uploadErrors.documents_refused({
      ownerStatus: content.status,
      scope: 'documents.write.uploadContent',
      operationId: target.operationId,
    });
  if (content.kind !== 'admitted')
    return uploadErrors.outcome_unknown({ operationId: target.operationId });
  let result: CallResult<unknown>;
  try {
    result = await documentsOwner().write.dispatchUpload({ operationId: target.operationId });
  } catch {
    return uploadErrors.outcome_unknown({ operationId: target.operationId });
  }
  if (result.kind !== 'ok')
    return uploadErrors.outcome_unknown({ operationId: target.operationId });
  if (
    !documentsReadContracts.dispatchUpload.response(result.value).valid ||
    !matchesTarget(uploadResponseData(result.value), target)
  )
    return uploadErrors.outcome_unknown({ operationId: target.operationId });
  res.status(200).json({ data: uploadResponseData(result.value) });
}

function matchesTarget(value: unknown, target: PaperlessUploadTarget): boolean {
  return (
    isUploadProofRecord(value) &&
    value['ownerMatches'] === true &&
    matchesUploadInput(value['input'], target)
  );
}
