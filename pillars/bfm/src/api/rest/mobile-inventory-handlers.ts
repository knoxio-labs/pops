/**
 * Handlers for the `/mobile/inventory/*` routes.
 *
 * Thin, like `mobile-finance-handlers.ts`: decode the request, ask the
 * inventory leg, and turn its one outcome type into a status. Two things
 * here are NOT delegated to the shared `upstream-error.ts` mappers, because
 * inventory's sync protocol gives two of the gateway's failure kinds a
 * meaning those mappers do not assume of every other pillar:
 *
 * - `conflict` (409 on the wire) is `resync_required` here — an actionable
 *   signal the app acts on — not "a pillar answered a conflict on a read",
 *   which the shared classifier treats as bfm's own bug and folds to 502.
 * - `protocol-too-old` (426) cannot be a typed handler return at all — see
 *   `api/rest/inventory-protocol-error.ts` — so it is thrown instead of
 *   returned, on every route.
 *
 * `snapshot` and `itemHistory` also read a cursor bfm never decodes: unlike
 * `finance`, this cursor's format is inventory's business, so an
 * `invalid-request` failure on either of them is inventory rejecting the
 * cursor itself (`invalid_cursor`) rather than a request bfm built — the app
 * can act on that by restarting the list, so it is a `400`, not the 502 the
 * shared mapper would give a producer 400 on any other route.
 *
 * `mutations` reads the device `requireDevice` resolved off `res` (the same
 * seam `mobile.bootstrap` uses) to build the `Pops-Actor` header the pillar
 * client sends — never anything the request body carries, since a phone
 * cannot be trusted to name itself.
 *
 * These routes are reachable only behind `requireDevice`/`requireCapability`
 * (mounted on the `/mobile` prefix in `app.ts`), so they never check a caller
 * themselves.
 */
import { readDevice } from '../auth/require-device.js';
import { buildInventoryActorHeader } from '../inventory/actor-header.js';
import { InventoryProtocolTooOldError } from '../inventory/protocol-error.js';
import { isGatewayOk } from '../pillars/gateway.js';
import { toCollectionUpstreamErrorResponse, toUpstreamErrorResponse } from './upstream-error.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Response } from 'express';

import type { bfmContract } from '../../contract/rest.js';
import type { MobileInventoryClient } from '../inventory/client.js';
import type { GatewayOutcome } from '../pillars/gateway.js';

type Req = ServerInferRequest<typeof bfmContract>['mobileInventory'];

const DEFAULT_SNAPSHOT_PAGE_LIMIT = 100;
const DEFAULT_CHANGES_PAGE_LIMIT = 100;
const DEFAULT_HISTORY_PAGE_LIMIT = 50;

const RESYNC_REQUIRED_MESSAGE =
  'The replica is out of sync with the server. Discard it and start a fresh snapshot.';

const INVALID_CURSOR_MESSAGE = 'The cursor is not one this server issued. Start the list again.';

export interface MobileInventoryHandlerDeps {
  inventory: MobileInventoryClient;
}

/** Throws for the one failure kind no route on this contract can return. */
function orThrowIfTooOld<T>(outcome: GatewayOutcome<T>) {
  if (outcome.kind === 'protocol-too-old') {
    throw new InventoryProtocolTooOldError(
      outcome.detail ?? 'inventory requires a newer sync protocol than this build sends'
    );
  }
  return outcome;
}

export function makeMobileInventoryHandlers(deps: MobileInventoryHandlerDeps) {
  return {
    catalogue: async () => {
      const outcome = orThrowIfTooOld(await deps.inventory.catalogue());
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    snapshot: async ({ query }: Req['snapshot']) => {
      const outcome = orThrowIfTooOld(
        await deps.inventory.snapshot({
          cursor: query.cursor ?? null,
          limit: query.limit ?? DEFAULT_SNAPSHOT_PAGE_LIMIT,
        })
      );
      if (!isGatewayOk(outcome)) {
        if (outcome.kind === 'invalid-request') {
          return {
            status: 400 as const,
            body: { code: 'invalid_cursor' as const, message: INVALID_CURSOR_MESSAGE },
          };
        }
        if (outcome.kind === 'conflict') {
          return {
            status: 409 as const,
            body: {
              code: 'resync_required' as const,
              message: outcome.detail ?? RESYNC_REQUIRED_MESSAGE,
            },
          };
        }
        return toCollectionUpstreamErrorResponse(outcome);
      }

      return { status: 200 as const, body: outcome.value };
    },

    changes: async ({ query }: Req['changes']) => {
      const outcome = orThrowIfTooOld(
        await deps.inventory.changes({
          since: query.since,
          epoch: query.epoch,
          limit: query.limit ?? DEFAULT_CHANGES_PAGE_LIMIT,
        })
      );
      if (!isGatewayOk(outcome)) {
        if (outcome.kind === 'conflict') {
          return {
            status: 409 as const,
            body: {
              code: 'resync_required' as const,
              message: outcome.detail ?? RESYNC_REQUIRED_MESSAGE,
            },
          };
        }
        return toCollectionUpstreamErrorResponse(outcome);
      }

      return { status: 200 as const, body: outcome.value };
    },

    mutations: async ({ body, res }: Req['mutations'] & { res: Response }) => {
      const device = readDevice(res);
      const outcome = orThrowIfTooOld(
        await deps.inventory.mutations({
          mutations: body.mutations,
          actorHeader: buildInventoryActorHeader(device.id, device.name),
        })
      );
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    suggestCodes: async ({ body }: Req['suggestCodes']) => {
      const outcome = orThrowIfTooOld(
        await deps.inventory.suggestCodes({
          name: body.name,
          typeKey: body.typeKey ?? null,
          stem: body.stem ?? null,
        })
      );
      if (!isGatewayOk(outcome)) return toCollectionUpstreamErrorResponse(outcome);

      return { status: 200 as const, body: outcome.value };
    },

    itemHistory: async ({ params, query }: Req['itemHistory']) => {
      const outcome = orThrowIfTooOld(
        await deps.inventory.itemHistory({
          itemId: params.id,
          cursor: query.cursor ?? null,
          limit: query.limit ?? DEFAULT_HISTORY_PAGE_LIMIT,
        })
      );
      if (!isGatewayOk(outcome)) {
        if (outcome.kind === 'invalid-request') {
          return {
            status: 400 as const,
            body: { code: 'invalid_cursor' as const, message: INVALID_CURSOR_MESSAGE },
          };
        }
        return toUpstreamErrorResponse(outcome);
      }

      return { status: 200 as const, body: outcome.value };
    },
  };
}
