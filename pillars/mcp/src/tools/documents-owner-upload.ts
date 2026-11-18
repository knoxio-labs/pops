import { UPLOAD_TOKEN_TTL_MS, uploadTokens } from '../uploads/upload-tokens.js';
import { documentsOwner } from './documents-owner-client.js';
import { documentsReadContracts } from './documents-owner-contract.js';
import { matchesUploadInput } from './documents-upload-proof.js';
import { mapCallResult, ok, toolError } from './utils.js';

import type { UploadTokenStore } from '../uploads/upload-tokens.js';
import type { ToolDef } from './tool-def.js';

const inputContract = documentsReadContracts.createUpload.input;
const createResponse = documentsReadContracts.createUpload.response;
const dispatchResponse = documentsReadContracts.dispatchUpload.response;

/** Create or resume a caller-identified, Documents-owned durable original upload. */
export function documentsCreateUploadTool(tokens: UploadTokenStore = uploadTokens): ToolDef {
  return {
    name: 'documents.createUpload',
    readOnly: false,
    scope: 'documents.write.createUpload',
    description:
      'Create or resume one durable original using the caller-supplied operationId and exact immutable file metadata. If state is awaiting_content, PUT the bytes once to the returned URL. If state is admitted, call documents.dispatchUpload with the same operationId. Keep operationId and use documents.uploadStatus after any lost response or gateway restart. Never choose a new ID or resend bytes for accepted or outcome_unknown proof.',
    inputSchema: inputContract.inputSchema,
    handler: async (args, context) => {
      if (!context?.publicBaseUrl)
        return toolError('Cannot issue an upload URL without the gateway public address.');
      const parsed = inputContract.validate(args);
      if (!parsed.valid) return toolError(parsed.errorMessage);
      const result = await documentsOwner().write.createUpload(parsed.data);
      if (result.kind !== 'ok') return mapCallResult(result, 'documents.write.createUpload');
      const value = createdProof(result.value, parsed.data);
      if (value === null)
        return toolError('Documents returned invalid or mismatched durable upload proof.');
      const data = value;
      if (value['ownerMatches'] !== true)
        return ok({
          upload: data,
          next: 'The Documents owner identity differs; inspect status and do not upload bytes.',
        });
      if (value['state'] !== 'awaiting_content')
        return ok({ upload: data, next: nextFor(value['state']) });
      const input = inputRecord(value);
      const grant = tokens.mint({
        kind: 'paperless-document',
        operationId: String(input['operationId']),
        fileName: String(input['fileName']),
        ...(typeof input['title'] === 'string' ? { title: input['title'] } : {}),
        mimeType: String(input['mimeType']),
        byteLength: Number(input['byteLength']),
        sha256: String(input['sha256']),
      });
      if (!grant)
        return toolError(
          'The gateway upload URL capacity is full; retain operationId and retry this same intent.'
        );
      return ok({
        upload: data,
        operationId: input['operationId'],
        uploadUrl: `${context.publicBaseUrl}/uploads/${grant.token}`,
        method: 'PUT',
        expiresAt: grant.expiresAt.toISOString(),
        expiresInSeconds: UPLOAD_TOKEN_TTL_MS / 1000,
        next: 'Stream the exact file bytes once with the declared Content-Type. After admission, call documents.dispatchUpload with this same operationId.',
      });
    },
  };
}

/** Explicitly dispatch only an already admitted durable original. Replays recover proof without a second owner POST. */
export function documentsDispatchUploadTool(): ToolDef {
  return {
    name: 'documents.dispatchUpload',
    readOnly: false,
    scope: 'documents.write.dispatchUpload',
    description:
      'Dispatch or recover an admitted Documents upload by its existing operationId. This is the explicit safe resume step after bytes were durably admitted but dispatch did not happen. The Documents owner claim prevents duplicate Paperless POSTs; outcome_unknown must never be retried with a new operationId.',
    inputSchema: {
      type: 'object',
      properties: { operationId: { type: 'string', format: 'uuid' } },
      required: ['operationId'],
      additionalProperties: false,
    },
    handler: async (args) => {
      if (Object.keys(args).length !== 1 || typeof args['operationId'] !== 'string')
        return toolError('Supply the existing operationId returned for this upload.');
      const parsed = documentsReadContracts.dispatchUpload.input.validate(args);
      if (!parsed.valid) return toolError(parsed.errorMessage);
      const operationId = parsed.data['operationId'];
      if (typeof operationId !== 'string') return toolError('Invalid operationId.');
      const result = await documentsOwner().write.dispatchUpload({
        operationId,
      });
      if (result.kind !== 'ok') return mapCallResult(result, 'documents.write.dispatchUpload');
      if (
        !dispatchResponse(result.value).valid ||
        !hasOperationId(responseData(result.value), operationId)
      )
        return toolError('Documents returned invalid durable upload proof.');
      return ok(responseData(result.value) ?? result.value);
    },
  };
}

function responseData(value: unknown): unknown {
  return isRecord(value) ? value['data'] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function createdProof(
  value: unknown,
  input: Record<string, unknown>
): Record<string, unknown> | null {
  if (!createResponse(value).valid) return null;
  const data = responseData(value);
  return isRecord(data) && matchesUploadInput(inputRecord(data), input) ? data : null;
}

function inputRecord(value: Record<string, unknown>): Record<string, unknown> {
  const input = value['input'];
  return isRecord(input) ? input : {};
}

function hasOperationId(value: unknown, operationId: string): boolean {
  if (!isRecord(value)) return false;
  return value['ownerMatches'] === true && inputRecord(value)['operationId'] === operationId;
}

function nextFor(state: unknown): string {
  if (state === 'admitted')
    return 'Call documents.dispatchUpload with this same operationId; the bytes are already durable.';
  if (state === 'awaiting_content')
    return 'Resume only with the same immutable input and operationId.';
  return 'Use documents.uploadStatus to inspect owner proof; do not resend or create a new operation.';
}
