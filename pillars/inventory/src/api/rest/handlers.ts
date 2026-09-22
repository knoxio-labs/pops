/**
 * ts-rest handler composer for the inventory pillar.
 *
 * Stitches the per-module handler factories into the typed
 * `RouterImplementation<InventoryRestContract>` that
 * `createExpressEndpoints` consumes in `app.ts`.
 */
import { initServer } from '@ts-rest/express';

import { inventoryContract } from '../../contract/rest.js';
import { type OpenedInventoryDb } from '../../db/index.js';
import { createAiClient, type AiClient } from '../ai/client.js';
import { createDocumentsClient, type DocumentsClient } from '../documents/client.js';
import { makeConnectionsHandlers } from './connections-handlers.js';
import { makeDocumentFilesHandlers } from './document-files-handlers.js';
import { makeDocumentsHandlers } from './documents-handlers.js';
import { makeFixturesHandlers } from './fixtures-handlers.js';
import { makeItemsHandlers } from './items-handlers.js';
import { makeLocationsHandlers } from './locations-handlers.js';
import { makePaperlessHandlers } from './paperless-handlers.js';
import { makePhotosHandlers } from './photos-handlers.js';
import { makeReportsHandlers } from './reports-handlers.js';
import { makeSearchHandlers } from './search-handlers.js';
import { makeSettingsHandlers } from './settings-handlers.js';
import { makeCodesHandlers, makeSyncHandlers, makeTypesHandlers } from './sync-handlers.js';
import { makeWebHandlers } from './web-handlers.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const server: ReturnType<typeof initServer> = initServer();

export function makeInventoryRestHandlers(deps: {
  inventoryDb: OpenedInventoryDb;
  /**
   * The `documents` pillar client backing the `paperless.*` handlers.
   * Production omits this so it defaults to the live `pillar('documents')`
   * proxy; tests inject a stub to exercise the graceful-degrade paths
   * without a network round-trip.
   */
  documents?: DocumentsClient;
  /**
   * The `ai` pillar client backing `codes/suggest`'s ranking. Production
   * omits this so it defaults to the live `pillar('ai')` proxy; tests inject
   * a stub to exercise the ranked and fallback paths without a network
   * round-trip.
   */
  ai?: AiClient;
  /**
   * The verifier the scope gate uses, shared so the sync handlers' own
   * re-verification of a key (to decide whose `Pops-Actor` to believe) is a
   * cache hit rather than a second registry round-trip.
   */
  serviceAccountVerifier: ServiceAccountVerifier;
}): ReturnType<typeof server.router<typeof inventoryContract>> {
  const db = deps.inventoryDb.db;
  const documents = deps.documents ?? createDocumentsClient();
  const ai = deps.ai ?? createAiClient();
  return server.router(inventoryContract, {
    items: makeItemsHandlers(db),
    locations: makeLocationsHandlers(db),
    connections: makeConnectionsHandlers(db),
    fixtures: makeFixturesHandlers(db),
    photos: makePhotosHandlers(db),
    documents: makeDocumentsHandlers(db),
    documentFiles: makeDocumentFilesHandlers(db),
    reports: makeReportsHandlers(db),
    paperless: makePaperlessHandlers(documents),
    search: makeSearchHandlers(db),
    web: makeWebHandlers({ db, documents }),
    settings: makeSettingsHandlers(db),
    sync: makeSyncHandlers({ db, documents, verify: deps.serviceAccountVerifier }),
    types: makeTypesHandlers(db),
    codes: makeCodesHandlers(db, ai),
  });
}
