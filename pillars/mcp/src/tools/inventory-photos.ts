import { INVENTORY_MEDIA_MAX_BYTES } from '../uploads/inventory-media.js';
import { UPLOAD_ROUTE_PREFIX } from '../uploads/upload-route.js';
import { UPLOAD_TOKEN_TTL_MS, uploadTokens } from '../uploads/upload-tokens.js';
import { optionalUuid } from './inventory-item-input.js';
import { itemMutationResult } from './inventory-item-mutation-result.js';
import { fetchItemPhotoCount, sendItemMutation } from './inventory-sync-client.js';
import { mapCallResult, ok, reqStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

const SHA256 = /^[0-9a-f]{64}$/u;

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; error: string };

function requiredSha256(args: Record<string, unknown>): Parsed<string> {
  const value = args['sha256'];
  if (typeof value !== 'string' || !SHA256.test(value)) {
    return { ok: false, error: 'Missing or invalid required field: sha256 (64 lowercase hex)' };
  }
  return { ok: true, value };
}

function optionalPosition(args: Record<string, unknown>): Parsed<number | undefined> {
  const value = args['position'];
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return { ok: false, error: 'Invalid field: position (a non-negative integer)' };
  }
  return { ok: true, value };
}

const sha256Property = {
  type: 'string',
  pattern: '^[0-9a-f]{64}$',
  description: 'SHA-256 of the stored image, as returned by the upload URL',
} as const;

const mutationIdProperty = {
  type: 'string',
  format: 'uuid',
  description: 'Optional idempotency key; reuse it unchanged when retrying an uncertain call',
} as const;

const createUpload: ToolDef = {
  name: 'inventory.photos.createUpload',
  readOnly: false,
  scope: 'inventory.media.upload',
  description:
    'Mint a single-use URL for uploading one local image file (JPEG or HEIC, up to 8 MB) to inventory. ' +
    'Run the returned curl command from a shell, then pass the sha256 it prints to inventory.items.attachPhoto. ' +
    'The URL expires after 10 minutes and is spent by the first request, successful or not.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {} },
  handler: async (_args, context) => {
    const baseUrl = context?.publicBaseUrl;
    if (baseUrl === undefined) {
      return toolError('Cannot build an upload URL: the gateway does not know its public address.');
    }
    const grant = uploadTokens.mint();
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
      maxBytes: INVENTORY_MEDIA_MAX_BYTES,
      acceptedFormats: ['JPEG', 'HEIC'],
      command: `curl --fail-with-body -sS -T <path-to-image> '${uploadUrl}'`,
      next: 'inventory.items.attachPhoto with the sha256 from the curl response',
    });
  },
};

const attachPhoto: ToolDef = {
  name: 'inventory.items.attachPhoto',
  readOnly: false,
  description:
    'Add an uploaded image (by sha256, from inventory.photos.createUpload) to an item. ' +
    'Without a position the photo is appended. Attaching is not judged against the item revision. ' +
    'Rejected with media_missing when the image was never uploaded.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', description: 'Item ID' },
      sha256: sha256Property,
      position: {
        type: 'integer',
        minimum: 0,
        description: 'Zero-based display position; omit to append',
      },
      mutationId: mutationIdProperty,
    },
    required: ['id', 'sha256'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const sha256 = requiredSha256(args);
    if (!sha256.ok) return toolError(sha256.error);
    const position = optionalPosition(args);
    if (!position.ok) return toolError(position.error);
    const mutationId = optionalUuid(args, 'mutationId');
    if (!mutationId.ok) return toolError(mutationId.error);

    let resolvedPosition = position.value;
    if (resolvedPosition === undefined) {
      const count = await fetchItemPhotoCount(id);
      if (count.kind !== 'ok') return mapCallResult(count);
      resolvedPosition = count.value;
    }
    return itemMutationResult(
      id,
      await sendItemMutation({
        entityId: id,
        op: 'item.attachPhoto',
        args: { sha256: sha256.value, position: resolvedPosition },
        baseRevision: null,
        ...(mutationId.value === undefined ? {} : { mutationId: mutationId.value }),
      })
    );
  },
};

const removePhoto: ToolDef = {
  name: 'inventory.items.removePhoto',
  readOnly: false,
  description:
    "Remove a photo from an item by its sha256 (see the item's photos in inventory.items.get). " +
    'Removing a photo the item does not have changes nothing. The stored image itself is kept.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', description: 'Item ID' },
      sha256: sha256Property,
      mutationId: mutationIdProperty,
    },
    required: ['id', 'sha256'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const sha256 = requiredSha256(args);
    if (!sha256.ok) return toolError(sha256.error);
    const mutationId = optionalUuid(args, 'mutationId');
    if (!mutationId.ok) return toolError(mutationId.error);
    return itemMutationResult(
      id,
      await sendItemMutation({
        entityId: id,
        op: 'item.removePhoto',
        args: { sha256: sha256.value },
        baseRevision: null,
        ...(mutationId.value === undefined ? {} : { mutationId: mutationId.value }),
      })
    );
  },
};

/** Upload, attach and remove item photos through inventory's content-addressed media store. */
export const photoTools: readonly ToolDef[] = [createUpload, attachPhoto, removePhoto];
