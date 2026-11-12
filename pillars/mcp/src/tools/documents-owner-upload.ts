import { paperlessUploadIntents } from '../uploads/paperless-upload-intents.js';
import { UPLOAD_TOKEN_TTL_MS, uploadTokens } from '../uploads/upload-tokens.js';
import { documentsOwner, documentUploadPolicy } from './documents-owner-client.js';
import { mapCallResult, ok, toolError } from './utils.js';

import type { PaperlessUploadIntents } from '../uploads/paperless-upload-intents.js';
import type { UploadTokenStore } from '../uploads/upload-tokens.js';
import type { ToolContext, ToolDef } from './tool-def.js';

const noControls = /^[^\p{Cc}]+$/u;
function text(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    noControls.test(value)
  );
}

/** Mint only a direct owner upload URL; arguments never contain file content, a local path or a cross-owner target. */
export function documentsCreateUploadTool(
  tokens: UploadTokenStore = uploadTokens,
  intents: PaperlessUploadIntents = paperlessUploadIntents
): ToolDef {
  return {
    name: 'documents.createUpload',
    readOnly: false,
    scope: 'documents.write.upload',
    description:
      'Create a single-use direct Documents upload URL for one file. Send file bytes outside MCP with HTTP PUT and an allowed Content-Type. Keep uploadId to recover the accepted task with documents.uploadStatus if the HTTP reply is lost. No Inventory or Trip association is created. URLs expire after ten minutes; receipts are process-local and cannot prove nonacceptance after expiry/restart. Never replay an unknown upload automatically. Also requires documents.paperless.status to read owner limits.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        fileName: {
          type: 'string',
          minLength: 1,
          maxLength: 255,
          pattern: noControls.source,
          description: 'Original filename only, not a path to read.',
        },
        title: { type: 'string', minLength: 1, maxLength: 128, pattern: noControls.source },
      },
      required: ['fileName'],
    },
    handler: (args, context) => createUpload(args, context, { tokens, intents }),
  };
}

/** Recover the retained result of one upload; unavailable is deliberately not a safe-to-retry assertion. */
export function documentsUploadStatusTool(
  intents: PaperlessUploadIntents = paperlessUploadIntents
): ToolDef {
  return {
    name: 'documents.uploadStatus',
    readOnly: true,
    description:
      'Read the gateway-local state of a documents.createUpload uploadId without posting bytes. accepted returns the actual owner taskId; query documents.task for completion/documentId. unknown or unavailable (including expiry/restart) never means safe to upload again. Receipts are not durable across gateway restarts.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { uploadId: { type: 'string', format: 'uuid' } },
      required: ['uploadId'],
    },
    handler: async (args) => {
      if (
        Object.keys(args).some((key) => key !== 'uploadId') ||
        typeof args['uploadId'] !== 'string' ||
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(args['uploadId'])
      )
        return toolError('Supply the uploadId returned by documents.createUpload.');
      return ok({ uploadId: args['uploadId'], ...intents.read(args['uploadId']) });
    },
  };
}

async function createUpload(
  args: Record<string, unknown>,
  context: ToolContext | undefined,
  stores: { tokens: UploadTokenStore; intents: PaperlessUploadIntents }
): Promise<Awaited<ReturnType<ToolDef['handler']>>> {
  const { tokens, intents } = stores;

  if (
    Object.keys(args).some((key) => key !== 'fileName' && key !== 'title') ||
    !text(args['fileName'], 255) ||
    ('title' in args && !text(args['title'], 128))
  )
    return toolError(
      'Supply fileName and optional title using the owner filename/title constraints; no file bytes or paths are accepted.'
    );
  if (!context?.publicBaseUrl)
    return toolError('Cannot issue an upload URL without the gateway public address.');
  const result = await documentsOwner().paperless.status();
  if (result.kind !== 'ok') return mapCallResult(result, 'documents.paperless.status');
  const policy = documentUploadPolicy(result.value);
  if (!policy)
    return toolError(
      'Documents is unavailable or has not provided valid upload limits. No upload URL was issued.'
    );
  const uploadId = intents.create();
  if (!uploadId)
    return toolError(
      'The gateway upload receipt capacity is full; use existing intents or wait for expiry.'
    );
  const grant = tokens.mint({
    kind: 'paperless-document',
    uploadId,
    fileName: args['fileName'],
    ...(typeof args['title'] === 'string' ? { title: args['title'] } : {}),
    ...policy,
  });
  if (!grant) {
    intents.update(uploadId, {
      state: 'not-sent',
      reason: 'No upload URL was issued: gateway upload capacity is full.',
    });
    return toolError('The gateway upload URL capacity is full.');
  }
  return ok({
    uploadId,
    uploadUrl: `${context.publicBaseUrl}/uploads/${grant.token}`,
    method: 'PUT',
    expiresAt: grant.expiresAt.toISOString(),
    expiresInSeconds: UPLOAD_TOKEN_TTL_MS / 1000,
    maxBytes: policy.maxBytes,
    allowedMimeTypes: policy.allowedMimeTypes,
    next: 'Stream the file once with an allowed Content-Type. Read documents.uploadStatus using uploadId after any lost reply; do not resend automatically. An accepted task is polled with documents.task; only its actual done/duplicate documentId can be associated through Trips.',
  });
}
