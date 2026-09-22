/**
 * Handlers for the sync protocol's `sync.*`, `types.*` and `codes.*`
 * sub-routers (`src/contract/rest-sync.ts`). The protocol header has already
 * been checked by the gate in `sync/protocol.ts`. Reads run in one read
 * transaction so a page is a consistent view; the Paperless check that
 * finishes an item page runs after it, outside the transaction.
 */
import { SERVICE_ACCOUNT_HEADER, type ServiceAccountVerifier } from '@pops/pillar-sdk/server';

import { runMutations } from '../../domain/commands/index.js';
import { createAiClient, isPermutation, type AiClient } from '../ai/client.js';
import { resolveActor } from '../sync/actor.js';
import { readProtocol1Catalogue } from '../sync/catalogue.js';
import { readChanges } from '../sync/changes.js';
import { suggestCodes } from '../sync/codes.js';
import { SyncRequestError } from '../sync/errors.js';
import { toSyncEvents } from '../sync/events.js';
import { readItemHistory } from '../sync/history.js';
import { readSyncState } from '../sync/meta.js';
import { readSnapshotPage } from '../sync/snapshot.js';
import { projectItems, toSyncLocation } from '../sync/wire.js';

import type { ServerInferRequest } from '@ts-rest/core';
import type { Request, Response } from 'express';

import type {
  inventoryCodesContract,
  inventorySyncContract,
  inventoryTypesContract,
} from '../../contract/rest-sync.js';
import type { InventoryDb } from '../../db/index.js';
import type { DocumentsClient } from '../documents/client.js';

type SyncReq = ServerInferRequest<typeof inventorySyncContract>;
type TypesReq = ServerInferRequest<typeof inventoryTypesContract>;
type CodesReq = ServerInferRequest<typeof inventoryCodesContract>;

type RefusalStatus = Exclude<SyncRequestError['status'], 426>;
type Refusal = {
  [S in RefusalStatus]: { status: S; body: { message: string; code: string } };
}[RefusalStatus];

/**
 * Run a handler body, answering a {@link SyncRequestError} with its status;
 * anything else propagates to Express. A 426 is the protocol gate's alone.
 */
async function runSync<T>(fn: () => Promise<T> | T): Promise<T | Refusal> {
  try {
    return await fn();
  } catch (error) {
    if (!(error instanceof SyncRequestError)) throw error;
    const { status } = error;
    if (status === 426) throw error;
    return { status, body: { message: error.message, code: error.code } };
  }
}

/** What the sync handlers read and write through. */
export interface SyncHandlerDeps {
  readonly db: InventoryDb;
  /** Resolves each page's Paperless availability. */
  readonly documents: DocumentsClient;
  /** The same verifier the scope gate uses, so re-verifying a key is a cache hit. */
  readonly verify: ServiceAccountVerifier;
}

/** Handlers for `sync.*`: snapshot, change feed, item history and mutations. */
export function makeSyncHandlers({ db, documents, verify }: SyncHandlerDeps) {
  return {
    snapshot: ({ query }: SyncReq['snapshot']) =>
      runSync(async () => {
        const { page, catalogue } = db.transaction((tx) => ({
          page: readSnapshotPage(tx, readSyncState(tx), query),
          catalogue: readProtocol1Catalogue(tx),
        }));
        return {
          status: 200 as const,
          body: {
            epoch: page.epoch,
            highWaterSeq: page.highWaterSeq,
            catalogueVersion: catalogue.version,
            total: page.total,
            items: await projectItems(page, documents),
            locations: page.locations.map(toSyncLocation),
            nextCursor: page.nextCursor,
          },
        };
      }),

    changes: ({ query }: SyncReq['changes']) =>
      runSync(async () => {
        const { page, catalogue } = db.transaction((tx) => {
          const rows = readChanges(tx, readSyncState(tx), query);
          return {
            page: { ...rows, syncEvents: toSyncEvents(tx, rows.events) },
            catalogue: readProtocol1Catalogue(tx),
          };
        });
        return {
          status: 200 as const,
          body: {
            epoch: page.epoch,
            items: await projectItems(page, documents),
            locations: page.locations.map(toSyncLocation),
            events: page.syncEvents,
            nextSince: page.nextSince,
            hasMore: page.hasMore,
            catalogueVersion: catalogue.version,
          },
        };
      }),

    itemEvents: ({ params, query }: SyncReq['itemEvents']) =>
      runSync(() => {
        const page = db.transaction((tx) => {
          const rows = readItemHistory(tx, params.id, query);
          return rows && { events: toSyncEvents(tx, rows.events), nextCursor: rows.nextCursor };
        });
        if (!page) throw new SyncRequestError(404, 'not_found', `item '${params.id}' not found`);
        return { status: 200 as const, body: page };
      }),

    mutations: ({ body, headers, req }: SyncReq['mutations'] & { req: Request }) =>
      runSync(async () => {
        const actor = await resolveActor({
          apiKey: req.get(SERVICE_ACCOUNT_HEADER),
          actorHeader: headers['pops-actor'],
          verify,
        });
        const outcomes = runMutations(db, body.mutations, actor);
        return {
          status: 200 as const,
          body: { outcomes, highWaterSeq: readSyncState(db).maxSeq },
        };
      }),
  };
}

/** Handlers for `types.*`: the catalogue descriptor, with its version as the ETag. */
export function makeTypesHandlers(db: InventoryDb) {
  return {
    catalogue: async ({ headers, res }: TypesReq['catalogue'] & { res: Response }) => {
      const catalogue = readProtocol1Catalogue(db);
      const etag = `"${catalogue.version}"`;
      res.setHeader('ETag', etag);
      if (headers['if-none-match'] === etag) return { status: 304 as const, body: undefined };
      return { status: 200 as const, body: catalogue };
    },
  };
}

/**
 * Handlers for `codes.*`: the deterministic suggestions, ranked through the
 * `ai` pillar when a service-account key is configured (Inventory ADR-002
 * Phase C, POPS-4081).
 *
 * @param ai Defaults to the live `pillar('ai')` client; tests inject a stub
 *   to exercise the ranked and fallback paths without a network round-trip.
 */
export function makeCodesHandlers(db: InventoryDb, ai: AiClient = createAiClient()) {
  return {
    suggest: async ({ body }: CodesReq['suggest']) => {
      const deterministic = suggestCodes(db, body);
      let ranked: string[] | undefined;
      try {
        ranked = await ai.rankCodeCandidates(deterministic, {
          name: body.name,
          ...(body.typeKey === undefined ? {} : { typeKey: body.typeKey }),
        });
      } catch (error) {
        // `createAiClient` never throws (every failure degrades inside it),
        // but ranking is an enhancement, not a requirement, for ANY `AiClient`
        // this handler is given — a throwing implementation degrades exactly
        // like an `undefined` one rather than turning `codes/suggest` into a
        // 500 over a purely cosmetic ordering.
        console.error(
          '[inventory-api] ai.rankCodeCandidates threw; using deterministic order',
          error
        );
        ranked = undefined;
      }
      // Re-checked here, not just trusted from the injected `ai` client: the
      // "never a held code" guarantee must hold for whatever `AiClient` is
      // wired in, since only the deterministic candidates are known to be
      // free.
      const suggestions =
        ranked !== undefined && isPermutation(deterministic, ranked) ? ranked : deterministic;
      return {
        status: 200 as const,
        body: { suggestions },
      };
    },
  };
}
