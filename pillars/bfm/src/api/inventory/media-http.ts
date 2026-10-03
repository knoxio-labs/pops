/**
 * The raw HTTP plumbing `media-client.ts`'s `upload`/`read` share: resolving
 * inventory's base URL, sending one request with the service-account
 * credential attached, and the one failure fold (an auth fault, or anything
 * unrecognised) both routes map identically.
 */
import { SERVICE_ACCOUNT_HEADER } from '@pops/pillar-sdk/server';

import { buildRawDiscovery } from '../pillars/raw-discovery.js';
import { INVENTORY_PROTOCOL_HEADER, INVENTORY_SYNC_PROTOCOL_VERSION } from './handle-factory.js';
import { gatewayMisconfigured, INVENTORY_MEDIA_PILLAR_ID, unavailable } from './media-outcomes.js';

import type { GatewayFailure } from '../pillars/gateway.js';
import type { RawDiscovery } from '../pillars/raw-discovery.js';

/** Kept for existing media client consumers; new relays share `RawDiscovery`. */
export type InventoryMediaDiscovery = RawDiscovery;

/** Bundles the seams `send` needs, so passing them around is one parameter, not three. */
export interface MediaClientContext {
  readonly discovery: InventoryMediaDiscovery;
  readonly fetchImpl: typeof fetch;
  readonly apiKey: () => string | undefined;
}

/** Build the real discovery seam through the shared raw discovery helper. */
export function buildDiscovery(): InventoryMediaDiscovery {
  return buildRawDiscovery();
}

export interface RawResponse {
  readonly status: number;
  readonly headers: Headers;
  readonly body: Buffer;
}

export interface SendInit {
  readonly method: 'PUT' | 'GET';
  readonly body?: Buffer;
  readonly contentType?: string;
  readonly query?: string;
}

/**
 * The one HTTP call `upload`/`read` each make. `null` means the call could
 * not even be attempted — inventory is not discoverable, or no
 * service-account key is available — which both callers fold into
 * `unavailable`.
 */
export async function send(
  ctx: MediaClientContext,
  sha256: string,
  init: SendInit
): Promise<RawResponse | null> {
  const target = await ctx.discovery.lookup(INVENTORY_MEDIA_PILLAR_ID);
  if (target === undefined) return null;

  const key = ctx.apiKey();
  if (key === undefined) return null;

  const url = `${target.baseUrl.replace(/\/$/u, '')}/media/${sha256}${init.query ?? ''}`;
  const headers: Record<string, string> = {
    [SERVICE_ACCOUNT_HEADER]: key,
    [INVENTORY_PROTOCOL_HEADER]: String(INVENTORY_SYNC_PROTOCOL_VERSION),
  };
  if (init.contentType !== undefined) headers['content-type'] = init.contentType;

  let response: Response;
  try {
    response = await ctx.fetchImpl(url, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : new Uint8Array(init.body),
    });
  } catch {
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, body: buffer };
}

/** Best-effort read of inventory's `{ error: string }` body. `undefined` for anything else. */
export function readJsonError(body: Buffer): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body.toString('utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      const value = (parsed as { error: unknown }).error;
      if (typeof value === 'string') return value;
    }
  } catch {
    // Not JSON, or not the shape we expect — the caller falls back to a
    // generic message rather than surfacing a parse failure of its own.
  }
  return undefined;
}

/** The statuses `upload` and `read` map identically: an auth fault, or anything unrecognised. */
export function commonFailure(response: RawResponse): GatewayFailure {
  if (response.status === 401 || response.status === 403) {
    return gatewayMisconfigured(readJsonError(response.body));
  }
  return unavailable(`inventory answered ${String(response.status)}`);
}
