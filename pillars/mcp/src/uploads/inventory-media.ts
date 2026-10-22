import { createHash } from 'node:crypto';

import { SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import { getRawDiscovery } from '../pillar-client.js';
import { resolveServiceAccountKey } from '../service-account-key.js';

import type { RawDiscovery } from '@pops/pillar-sdk/server';

import type { InventoryImageType } from './image-format.js';

/** Matches inventory's `MEDIA_UPLOAD_LIMIT_BYTES`; a larger body would only be refused there. */
export const INVENTORY_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

/** The outcome of storing one blob in inventory's content-addressed media store. */
export type MediaStoreResult =
  | { readonly kind: 'stored'; readonly sha256: string; readonly alreadyStored: boolean }
  | { readonly kind: 'rejected'; readonly status: number; readonly message: string }
  | { readonly kind: 'unavailable'; readonly message: string };

/** Seams for tests; production uses the gateway's discovery, `fetch` and key. */
export interface MediaStoreDeps {
  readonly discovery?: RawDiscovery;
  readonly fetchImpl?: typeof fetch;
  readonly apiKey?: () => string | undefined;
}

function readMessage(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
      return typeof parsed.message === 'string' ? parsed.message : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function readStored(body: string): { sha256: string; alreadyStored: boolean } | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'sha256' in parsed &&
      typeof parsed.sha256 === 'string' &&
      'alreadyStored' in parsed &&
      typeof parsed.alreadyStored === 'boolean'
    ) {
      return { sha256: parsed.sha256, alreadyStored: parsed.alreadyStored };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function classifyResponse(status: number, body: string): MediaStoreResult {
  if (status === 200 || status === 201) {
    const stored = readStored(body);
    return stored === undefined
      ? { kind: 'unavailable', message: 'inventory answered a media store with no readable body' }
      : { kind: 'stored', ...stored };
  }
  const message = readMessage(body) ?? `inventory answered ${String(status)}`;
  if (status === 401 || status === 403) {
    return {
      kind: 'unavailable',
      message: `inventory refused the gateway's service account, which needs scope 'inventory.media.upload': ${message}`,
    };
  }
  if (status >= 400 && status < 500) return { kind: 'rejected', status, message };
  return { kind: 'unavailable', message };
}

/**
 * `PUT` the bytes to inventory's raw `/media/:sha256` route (Inventory
 * ADR-002 D9) under the gateway's service account, which needs
 * `inventory.media.upload`. The route has no contract operation, so this is a
 * raw call to the base URL `getPillar('inventory')` would discover.
 */
export async function storeInventoryMedia(
  bytes: Buffer,
  contentType: InventoryImageType,
  deps: MediaStoreDeps = {}
): Promise<MediaStoreResult> {
  const discovery = deps.discovery ?? getRawDiscovery();
  const target = await discovery.lookup('inventory');
  if (target === undefined)
    return { kind: 'unavailable', message: 'inventory is not discoverable' };
  const key = (deps.apiKey ?? resolveServiceAccountKey)();
  if (key === undefined) return { kind: 'unavailable', message: 'no service-account key' };

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const url = `${target.baseUrl.replace(/\/$/u, '')}/media/${sha256}`;
  try {
    const response = await (deps.fetchImpl ?? fetch)(url, {
      method: 'PUT',
      headers: { [SERVICE_ACCOUNT_HEADER]: key, 'content-type': contentType },
      body: new Uint8Array(bytes),
    });
    return classifyResponse(response.status, await response.text());
  } catch {
    return { kind: 'unavailable', message: 'inventory did not answer' };
  }
}
