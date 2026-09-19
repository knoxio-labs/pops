/**
 * Handlers for `putMedia`/`getMedia` — split out of
 * `mobile-inventory-handlers.ts` (which is at its line budget) rather than
 * folded into it. Unlike every other `/mobile/inventory/*` route, these two
 * call `deps.inventoryMedia`, never `deps.inventory` — inventory's media
 * store publishes no OpenAPI operation `pillar()` could call, so
 * `inventory/media-client.ts` speaks raw HTTP to it directly. See that
 * file's header for why.
 */
import { isGatewayOk } from '../pillars/gateway.js';
import { toUpstreamErrorResponse } from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { bfmContract } from '../../contract/rest.js';
import type { MobileInventoryMediaClient } from '../inventory/media-client.js';
import type { GatewayFailure } from '../pillars/gateway.js';

type Req = ServerInferRequest<typeof bfmContract>['mobileInventory'];

const DEFAULT_MEDIA_VARIANT = 'full';

/**
 * The cap `putMedia` enforces against the DECODED byte length before any
 * upstream call — matches inventory's own media store cap. The JSON body
 * itself is allowed wider (`MOBILE_INVENTORY_MEDIA_MAX_BYTES`, the mount in
 * `app.ts`) purely to give a legitimate upload's base64 inflation room; this
 * is the number that actually decides `413`.
 */
const MEDIA_UPLOAD_LIMIT_BYTES = 8 * 1024 * 1024;

const PAYLOAD_TOO_LARGE_MESSAGE = `A photo's bytes must be ${String(MEDIA_UPLOAD_LIMIT_BYTES)} bytes or smaller.`;

export interface MobileInventoryMediaHandlerDeps {
  inventoryMedia: MobileInventoryMediaClient;
}

function upstreamMessage(summary: string, failure: GatewayFailure): string {
  return failure.detail === undefined ? summary : `${summary}: ${failure.detail}`;
}

export interface PutMediaFailureBody {
  readonly code:
    | 'upstream_unsupported_media'
    | 'upstream_unavailable'
    | 'upstream_contract_mismatch'
    | 'upstream_misconfigured';
  readonly pillar: string;
  readonly retryable: boolean;
  readonly message: string;
}

/**
 * `putMedia`'s own failure mapping onto its declared statuses (`415`, `502`,
 * `503`) — never `toUpstreamErrorResponse`/`toReceiptBytesErrorResponse`,
 * both of which can answer `404`, a status this route does not declare
 * (uploading bytes addresses nothing that can be "not found"). The caller
 * has already handled `invalid-request`, so this function is never reached
 * with it.
 */
function putMediaFailureResponse(failure: GatewayFailure): {
  status: 415 | 502 | 503;
  body: PutMediaFailureBody;
} {
  switch (failure.kind) {
    case 'unsupported-media':
      return {
        status: 415,
        body: {
          code: 'upstream_unsupported_media',
          pillar: failure.pillar,
          retryable: false,
          message: upstreamMessage('inventory cannot store those bytes as an image', failure),
        },
      };
    case 'unavailable':
    case 'degraded':
      return {
        status: 503,
        body: {
          code: 'upstream_unavailable',
          pillar: failure.pillar,
          retryable: true,
          message: upstreamMessage('inventory did not answer', failure),
        },
      };
    case 'gateway-misconfigured':
      return {
        status: 502,
        body: {
          code: 'upstream_misconfigured',
          pillar: failure.pillar,
          retryable: false,
          message: upstreamMessage("inventory rejected this pillar's credential", failure),
        },
      };
    case 'contract-mismatch':
    case 'not-found':
    case 'conflict':
    case 'invalid-request':
    case 'protocol-too-old':
      return {
        status: 502,
        body: {
          code: 'upstream_contract_mismatch',
          pillar: failure.pillar,
          retryable: false,
          message: upstreamMessage('inventory answered a media store call unexpectedly', failure),
        },
      };
  }
}

export function makeMobileInventoryMediaHandlers(deps: MobileInventoryMediaHandlerDeps) {
  return {
    // `putMedia`/`getMedia` (A13) do not call the sync client — see this
    // file's header.
    putMedia: async ({ params, body }: Req['putMedia']) => {
      // The cap is enforced HERE, against the decoded length, before any
      // upstream call — `Buffer.byteLength(str, 'base64')` computes the
      // decoded size without allocating the buffer twice.
      const byteLength = Buffer.byteLength(body.dataBase64, 'base64');
      if (byteLength > MEDIA_UPLOAD_LIMIT_BYTES) {
        return {
          status: 413 as const,
          body: {
            code: 'payload_too_large' as const,
            maxBytes: MEDIA_UPLOAD_LIMIT_BYTES,
            message: PAYLOAD_TOO_LARGE_MESSAGE,
          },
        };
      }

      const outcome = await deps.inventoryMedia.upload({
        sha256: params.sha256,
        mediaType: body.mediaType,
        bytes: Buffer.from(body.dataBase64, 'base64'),
      });
      if (!isGatewayOk(outcome)) {
        // `invalid-request` here means the PHONE built a bad request (a
        // claimed hash that does not match its own bytes) — never bfm's own
        // bug, unlike every other route's `invalid-request` arm — so it
        // answers this route's own generic `400`, never through
        // `toUpstreamErrorResponse`'s `invalid-request` case, which assumes
        // the opposite and would answer `502`.
        if (outcome.kind === 'invalid-request') {
          return {
            status: 400 as const,
            body: {
              code: 'invalid_request' as const,
              message:
                outcome.detail ??
                "The uploaded bytes do not match the claimed sha256, or the sha256 isn't well-formed.",
            },
          };
        }
        return putMediaFailureResponse(outcome);
      }

      return {
        status: outcome.value.alreadyStored ? (200 as const) : (201 as const),
        body: outcome.value,
      };
    },

    getMedia: async ({ params, query }: Req['getMedia']) => {
      const outcome = await deps.inventoryMedia.read({
        sha256: params.sha256,
        variant: query.variant ?? DEFAULT_MEDIA_VARIANT,
      });
      if (!isGatewayOk(outcome)) {
        if (outcome.kind === 'invalid-request') {
          return {
            status: 400 as const,
            body: {
              code: 'invalid_request' as const,
              message: outcome.detail ?? 'The sha256 or the requested variant is not well-formed.',
            },
          };
        }
        return toUpstreamErrorResponse(outcome);
      }

      return {
        status: 200 as const,
        body: {
          sha256: outcome.value.sha256,
          mediaType: outcome.value.mediaType,
          byteLength: outcome.value.bytes.length,
          dataBase64: outcome.value.bytes.toString('base64'),
        },
      };
    },
  };
}
