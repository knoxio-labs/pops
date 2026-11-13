import { PopsError } from '@pops/pillar-express';

import { precheckDocumentUpload } from './document-upload-handler.js';
import { uploadPaperlessDocument } from './paperless-document-client.js';
import { paperlessUploadIntents } from './paperless-upload-intents.js';
import { uploadErrors } from './upload-errors.js';

import type { Request, Response } from 'express';

import type { DocumentUploadDeps } from './inventory-documents.js';
import type { PaperlessUploadIntents, PaperlessUploadState } from './paperless-upload-intents.js';
import type { PaperlessUploadTarget } from './upload-tokens.js';

/** Spend one upload once, retain its owner task before replying, and never turn an unknown outcome into a retry instruction. */
export async function storePaperlessUpload(
  req: Request,
  res: Response,
  target: PaperlessUploadTarget,
  options: { readonly deps?: DocumentUploadDeps; readonly intents?: PaperlessUploadIntents } = {}
): Promise<void> {
  const { deps, intents = paperlessUploadIntents } = options;
  res.setHeader('Connection', 'close');
  if (intents.read(target.uploadId).state !== 'ready') return uploadErrors.not_found();
  let contentType: string;
  try {
    contentType = precheckDocumentUpload(req, target);
  } catch (error) {
    intents.update(target.uploadId, {
      state: 'not-sent',
      reason: 'The gateway refused the file before forwarding it.',
    });
    throw error;
  }
  intents.update(target.uploadId, { state: 'uploading' });
  const contentLength = req.get('content-length');
  let result: Awaited<ReturnType<typeof uploadPaperlessDocument>>;
  try {
    result = await uploadPaperlessDocument(
      { body: req, contentType, ...(contentLength === undefined ? {} : { contentLength }) },
      target,
      deps
    );
  } catch {
    result = {
      kind: 'unavailable',
      message: 'Documents upload could not be confirmed. Do not upload again automatically.',
    };
  }
  const state = uploadState(result);
  intents.update(target.uploadId, state);
  if (state.state === 'unknown')
    return uploadErrors.outcome_unknown({ uploadId: target.uploadId, reason: state.reason });
  if (result.kind === 'refused')
    throw new PopsError({
      code: result.code,
      status: result.status,
      message: result.message,
      retryable: false,
      details: { uploadId: target.uploadId, producer: result.details },
    });
  res.status(202).json({
    uploadId: target.uploadId,
    ...state,
    next:
      state.state === 'accepted'
        ? 'Read documents.task with taskId. Link only its actual done/duplicate documentId using the owning Trips association command.'
        : 'Read documents.uploadStatus with uploadId. An unknown outcome must not be uploaded again automatically.',
  });
}

function uploadState(
  result: Awaited<ReturnType<typeof uploadPaperlessDocument>>
): Exclude<PaperlessUploadState, { state: 'unavailable' }> {
  switch (result.kind) {
    case 'accepted':
      return { state: 'accepted', taskId: result.taskId };
    case 'refused':
      return { state: 'refused', reason: result.message };
    case 'too-large':
      return {
        state: 'unknown',
        reason:
          'The upload exceeded the size limit while streaming. No accepted task is known; do not resend automatically.',
      };
    case 'redirected':
      return {
        state: 'unknown',
        reason: `Documents answered HTTP ${String(result.status)} instead of its published 202 receipt. No redirect was followed; do not resend automatically.`,
      };
    case 'unavailable':
      return { state: 'unknown', reason: result.message };
  }
}
