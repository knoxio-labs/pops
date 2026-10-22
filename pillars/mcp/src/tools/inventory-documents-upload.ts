import { UPLOAD_ROUTE_PREFIX } from '../uploads/upload-route.js';
import { UPLOAD_TOKEN_TTL_MS, uploadTokens } from '../uploads/upload-tokens.js';
import {
  coerceDocumentType,
  documentsPillar,
  documentTypeProperty,
  titleProperty,
} from './inventory-documents-shared.js';
import { mapCallResult, ok, optStr, reqStr, toolError } from './utils.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { DocumentUploadTarget, UploadTokenStore } from '../uploads/upload-tokens.js';
import type { ToolContext, ToolDef } from './tool-def.js';

const UPLOAD_SCOPE = 'inventory.documents.upload';
const LIMITS_SCOPE = 'documents.paperless.status';

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
  gif: 'image/gif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  html: 'text/html',
};

/** The MIME type a file name's extension implies, for the curl line; `undefined` when unknown. */
export function mimeForFileName(fileName: string): string | undefined {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return undefined;
  return MIME_BY_EXTENSION[fileName.slice(dot + 1).toLowerCase()];
}

/** The `curl` line that uploads `fileName` to `uploadUrl`. */
export function documentCurlCommand(uploadUrl: string, fileName: string): string {
  const mime = mimeForFileName(fileName) ?? '<mime-type>';
  return `curl -T <file> -H 'Content-Type: ${mime}' '${uploadUrl}'`;
}

type Target = Omit<DocumentUploadTarget, 'maxBytes' | 'allowedMimeTypes'>;

function readTarget(args: Record<string, unknown>): Target | string {
  const itemId = reqStr(args, 'itemId');
  if (!itemId) return 'Missing required field: itemId';
  const fileName = reqStr(args, 'fileName');
  if (!fileName) return 'Missing required field: fileName';
  const title = optStr(args, 'title');
  return {
    kind: 'document',
    itemId,
    fileName,
    documentType: coerceDocumentType(args['documentType']),
    ...(title === undefined || title === '' ? {} : { title }),
  };
}

async function createDocumentUpload(
  args: Record<string, unknown>,
  context: ToolContext | undefined,
  tokens: UploadTokenStore
): Promise<CallToolResult> {
  const target = readTarget(args);
  if (typeof target === 'string') return toolError(target);
  const baseUrl = context?.publicBaseUrl;
  if (baseUrl === undefined) {
    return toolError('Cannot build an upload URL: the gateway does not know its public address.');
  }
  const status = await documentsPillar().paperless.status();
  if (status.kind !== 'ok') return mapCallResult(status, LIMITS_SCOPE);
  const { maxUploadBytes, allowedMimeTypes } = status.value.data;
  const grant = tokens.mint({ ...target, maxBytes: maxUploadBytes, allowedMimeTypes });
  if (grant === undefined) {
    return toolError(
      'Too many unused upload URLs are outstanding. Use or let the existing ones expire, then retry.'
    );
  }
  const uploadUrl = `${baseUrl}${UPLOAD_ROUTE_PREFIX}/${grant.token}`;
  return ok({
    uploadUrl,
    method: 'PUT',
    expiresAt: grant.expiresAt.toISOString(),
    expiresInSeconds: UPLOAD_TOKEN_TTL_MS / 1000,
    itemId: target.itemId,
    documentType: target.documentType,
    maxBytes: maxUploadBytes,
    allowedMimeTypes,
    command: documentCurlCommand(uploadUrl, target.fileName),
    next: 'inventory.documents.list with this itemId, to see the upload pending, linked or failed',
  });
}

/** Build `inventory.documents.createUpload` over a token store; tests pass their own. */
export function documentCreateUploadTool(tokens: UploadTokenStore = uploadTokens): ToolDef {
  return {
    name: 'inventory.documents.createUpload',
    readOnly: false,
    scope: UPLOAD_SCOPE,
    description:
      'Mint a single-use URL for uploading one local file (a receipt, warranty, manual or invoice: PDF, image or ' +
      'text) to Paperless as a document of an item. Run the returned curl command from a shell with <file> ' +
      "replaced by the file's path; the size limit and accepted types are documents' and are returned as " +
      'maxBytes and allowedMimeTypes. Paperless consumes the file asynchronously: the upload answers with a ' +
      'pending ingestion, and inventory.documents.list shows it linked (or failed) once Paperless is done. ' +
      'The URL expires after 10 minutes and is spent by the first request, successful or not. ' +
      'For an item photo use inventory.photos.createUpload instead.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        itemId: { type: 'string', description: 'Item ID the document belongs to' },
        documentType: documentTypeProperty,
        fileName: {
          type: 'string',
          description:
            'File name as Paperless should record it, with its extension, e.g. receipt.pdf',
        },
        title: titleProperty,
      },
      required: ['itemId', 'documentType', 'fileName'],
    },
    handler: (args, context) => createDocumentUpload(args, context, tokens),
  };
}
