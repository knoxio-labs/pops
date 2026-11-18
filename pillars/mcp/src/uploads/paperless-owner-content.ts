import { SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import { getRawDiscovery } from '../pillar-client.js';
import { resolveServiceAccountKey } from '../service-account-key.js';
import { documentsReadContracts } from '../tools/documents-owner-contract.js';
import {
  isUploadProofRecord,
  matchesUploadInput,
  uploadResponseData,
} from '../tools/documents-upload-proof.js';
import { verifiedUploadStream } from './paperless-upload-content-stream.js';

import type { DocumentUploadRequest } from './inventory-documents.js';
import type { PaperlessUploadTarget } from './upload-tokens.js';

/** Existing owner discovery, transport and service-account resolution used by raw content admission. */
export interface PaperlessContentDeps {
  readonly discovery?: ReturnType<typeof getRawDiscovery>;
  readonly fetchImpl?: typeof fetch;
  readonly apiKey?: () => string | undefined;
}

/** Only exact admitted owner proof permits dispatch; refused or uncertain transfers never do. */
export type PaperlessContentResult =
  | { readonly kind: 'admitted'; readonly record: unknown }
  | { readonly kind: 'refused'; readonly status: number }
  | { readonly kind: 'unknown' };

/** Stream exact caller-declared bytes to Documents' durable content route without redirects or buffering. */
export async function uploadPaperlessContent(
  request: DocumentUploadRequest,
  target: PaperlessUploadTarget,
  deps: PaperlessContentDeps = {}
): Promise<PaperlessContentResult> {
  if (request.contentType !== target.mimeType) return { kind: 'refused', status: 415 };
  const discovery = deps.discovery ?? getRawDiscovery();
  const found = await discovery.lookup('documents');
  if (found === undefined) return { kind: 'unknown' };
  const key = (deps.apiKey ?? resolveServiceAccountKey)();
  if (key === undefined) return { kind: 'unknown' };
  const stream = verifiedUploadStream(request.body, target);
  const url = `${found.baseUrl.replace(/\/$/u, '')}/paperless/uploads/${encodeURIComponent(target.operationId)}/content`;
  const headers: Record<string, string> = {
    [SERVICE_ACCOUNT_HEADER]: key,
    'content-type': target.mimeType,
    accept: 'application/json',
    'content-length': String(target.byteLength),
  };
  const init: RequestInit & { duplex: 'half' } = {
    method: 'PUT',
    redirect: 'manual',
    headers,
    body: stream.body,
    duplex: 'half',
  };
  try {
    const response = await (deps.fetchImpl ?? fetch)(url, init);
    return await classifyContentResponse(response, target, stream.isVerified);
  } catch {
    return { kind: 'unknown' };
  }
}

async function classifyContentResponse(
  response: Response,
  target: PaperlessUploadTarget,
  isVerified: () => boolean
): Promise<PaperlessContentResult> {
  if (response.status !== 200) {
    return response.status >= 400 && response.status < 500
      ? { kind: 'refused', status: response.status }
      : { kind: 'unknown' };
  }
  const value: unknown = await response.json().catch(() => null);
  if (!documentsReadContracts.upload.response(value).valid) return { kind: 'unknown' };
  if (!isVerified() || !isAdmitted(value, target)) return { kind: 'unknown' };
  return { kind: 'admitted', record: uploadResponseData(value) };
}

function isAdmitted(value: unknown, target: PaperlessUploadTarget): boolean {
  const data = uploadResponseData(value);
  return (
    isUploadProofRecord(data) &&
    data['state'] === 'admitted' &&
    data['ownerMatches'] === true &&
    matchesUploadInput(data['input'], target)
  );
}
