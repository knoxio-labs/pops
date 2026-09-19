/**
 * bfm's leg into inventory's content-addressed media store: raw Express
 * `PUT`/`GET /media/:sha256`, scoped `inventory.media.upload`/
 * `inventory.media.read` on inventory's own service-account gate.
 *
 * Deliberately NOT `PillarGateway`/`pillar()`: both are built around a
 * discovered OpenAPI operation, and this route publishes none — it is raw
 * Express on the inventory side (bytes and a size cap do not fit a JSON
 * contract), so there is no operation for `pillar()` to call. What is left is
 * a raw HTTP call to the same base URL `pillar()` would have discovered —
 * `media-http.ts` builds it from `@pops/pillar-sdk/client`'s discovery
 * primitives, the un-authenticated half `/server`'s own `pillar()` factory
 * builds on internally, re-exported for exactly this "advanced usage"
 * (`libs/sdk/src/client/cache.ts`'s doc comment). What `/client` does NOT
 * supply — the service-account credential — is added by hand, from the same
 * `resolveApiKey`/`SERVICE_ACCOUNT_HEADER` `/server`'s own factory reads. See
 * `api/pillars/README.md`'s "trap this directory exists to avoid": the trap
 * is importing `/client`'s `pillar()` and silently losing the credential, not
 * using its discovery types with the credential attached by hand, which is
 * what `media-http.ts` does.
 *
 * Outcomes are expressed as {@link GatewayOutcome} so `server.ts`, tests and
 * (where they apply) `upstream-error.ts`'s mappers read exactly like every
 * other cross-pillar leg. One divergence: `invalid-request` here means the
 * REQUEST BODY was wrong (a claimed hash that does not match the bytes, or
 * one that is not hex) — the phone's own mistake, not bfm's — so
 * `mobile-inventory-media-handlers.ts` answers it with a `400`, never through
 * `toUpstreamErrorResponse`'s generic `invalid-request` arm, which assumes
 * the opposite (a query bfm itself built).
 */
import { resolveApiKey } from '@pops/pillar-sdk/server';

import {
  buildDiscovery,
  commonFailure,
  readJsonError,
  send,
  type InventoryMediaDiscovery,
  type MediaClientContext,
} from './media-http.js';
import {
  contractMismatch,
  invalidRequest,
  notFound,
  ok,
  unavailable,
  unsupportedMedia,
} from './media-outcomes.js';

import type { MobileInventoryMediaVariant } from '../../contract/mobile-inventory-media-schemas.js';
import type { GatewayOutcome } from '../pillars/gateway.js';

export interface StoredInventoryMedia {
  readonly sha256: string;
  readonly alreadyStored: boolean;
}

export interface ReadInventoryMedia {
  readonly sha256: string;
  readonly mediaType: string;
  readonly bytes: Buffer;
}

export interface MobileInventoryMediaClient {
  upload(input: {
    readonly sha256: string;
    readonly mediaType: string;
    readonly bytes: Buffer;
  }): Promise<GatewayOutcome<StoredInventoryMedia>>;

  read(input: {
    readonly sha256: string;
    readonly variant: MobileInventoryMediaVariant;
  }): Promise<GatewayOutcome<ReadInventoryMedia>>;
}

export interface MobileInventoryMediaClientDeps {
  /** Injectable for tests; production builds one from the server SDK config. */
  discovery?: InventoryMediaDiscovery;
  fetchImpl?: typeof fetch;
  /** Injectable for tests; production reads the process's own key. */
  apiKey?: () => string | undefined;
}

function parseStoredMedia(body: Buffer): StoredInventoryMedia | null {
  const parsed: unknown = JSON.parse(body.toString('utf8'));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { sha256?: unknown }).sha256 !== 'string' ||
    typeof (parsed as { alreadyStored?: unknown }).alreadyStored !== 'boolean'
  ) {
    return null;
  }
  return parsed as StoredInventoryMedia;
}

async function upload(
  ctx: MediaClientContext,
  input: { sha256: string; mediaType: string; bytes: Buffer }
): Promise<GatewayOutcome<StoredInventoryMedia>> {
  const response = await send(ctx, input.sha256, {
    method: 'PUT',
    body: input.bytes,
    contentType: input.mediaType,
  });
  if (response === null) return unavailable();

  if (response.status === 200 || response.status === 201) {
    const stored = parseStoredMedia(response.body);
    return stored === null
      ? contractMismatch('inventory answered a media store with no readable body')
      : ok(stored);
  }

  if (response.status === 415) return unsupportedMedia(readJsonError(response.body));
  if (response.status === 400) return invalidRequest(readJsonError(response.body));
  return commonFailure(response);
}

async function read(
  ctx: MediaClientContext,
  input: { sha256: string; variant: MobileInventoryMediaVariant }
): Promise<GatewayOutcome<ReadInventoryMedia>> {
  const response = await send(ctx, input.sha256, {
    method: 'GET',
    query: `?variant=${input.variant}`,
  });
  if (response === null) return unavailable();

  if (response.status === 200) {
    return ok({
      sha256: input.sha256,
      mediaType: response.headers.get('content-type') ?? 'application/octet-stream',
      bytes: response.body,
    });
  }

  if (response.status === 404) return notFound(readJsonError(response.body));
  if (response.status === 400) return invalidRequest(readJsonError(response.body));
  return commonFailure(response);
}

/** Build the media client. Production passes no deps and gets the real discovery + credential. */
export function createMobileInventoryMediaClient(
  deps: MobileInventoryMediaClientDeps = {}
): MobileInventoryMediaClient {
  const ctx: MediaClientContext = {
    discovery: deps.discovery ?? buildDiscovery(),
    fetchImpl: deps.fetchImpl ?? fetch,
    apiKey: deps.apiKey ?? resolveApiKey,
  };

  return {
    upload: (input) => upload(ctx, input),
    read: (input) => read(ctx, input),
  };
}
