import { ErrorBodySchema } from '@pops/types';

import { forwardDocument } from './inventory-documents.js';

import type {
  DocumentUploadDeps,
  DocumentUploadRequest,
  DocumentUploadResult,
} from './inventory-documents.js';
import type { PaperlessUploadTarget } from './upload-tokens.js';

/** A direct owner upload exposes only an actual accepted task ID, never an Inventory ingestion or inferred document ID. */
export type PaperlessDocumentUploadResult =
  | Exclude<DocumentUploadResult, { kind: 'accepted' }>
  | { readonly kind: 'accepted'; readonly taskId: string };

/** Stream once to Documents' sanctioned raw byte route using registry discovery and the gateway service account. */
export async function uploadPaperlessDocument(
  request: DocumentUploadRequest,
  target: PaperlessUploadTarget,
  deps: DocumentUploadDeps = {}
): Promise<PaperlessDocumentUploadResult> {
  return forwardDocument(request, target.maxBytes, {
    deps,
    pillar: 'documents',
    failureMessage:
      'Documents did not answer; upload outcome may be unknown. Do not replay automatically.',
    url: (baseUrl) => {
      const query = new URLSearchParams({ fileName: target.fileName });
      if (target.title !== undefined) query.set('title', target.title);
      return `${baseUrl.replace(/\/$/u, '')}/paperless/documents?${query.toString()}`;
    },
    classifyResponse: classifyPaperless,
  });
}

async function classifyPaperless(response: Response): Promise<PaperlessDocumentUploadResult> {
  const parsed: unknown = await response.json().catch(() => null);
  const taskId = response.status === 202 ? acceptedTask(parsed) : undefined;
  if (taskId !== undefined) return { kind: 'accepted', taskId };
  const body = ErrorBodySchema.safeParse(parsed);
  if (response.status >= 400 && response.status < 500 && body.success)
    return {
      kind: 'refused',
      status: response.status,
      code: body.data.code,
      message:
        response.status === 401 || response.status === 403
          ? `${body.data.message} Required service-account scope: documents.write.upload.`
          : body.data.message,
      retryable: body.data.retryable,
      ...(body.data.details === undefined ? {} : { details: body.data.details }),
    };
  return {
    kind: 'unavailable',
    message: `Documents upload outcome is unknown (HTTP ${String(response.status)}). Do not upload again automatically.`,
  };
}

function acceptedTask(parsed: unknown): string | undefined {
  if (typeof parsed !== 'object' || parsed === null || !('data' in parsed)) return undefined;
  const data = parsed.data;
  if (typeof data !== 'object' || data === null || !('taskId' in data)) return undefined;
  return typeof data.taskId === 'string' && /^[A-Za-z0-9_-]{1,72}$/u.test(data.taskId)
    ? data.taskId
    : undefined;
}
