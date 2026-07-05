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
}): ReturnType<typeof server.router<typeof inventoryContract>> {
  const db = deps.inventoryDb.db;
  return server.router(inventoryContract, {
    items: makeItemsHandlers(db),
    locations: makeLocationsHandlers(db),
    connections: makeConnectionsHandlers(db),
    fixtures: makeFixturesHandlers(db),
    photos: makePhotosHandlers(db),
    documents: makeDocumentsHandlers(db),
    documentFiles: makeDocumentFilesHandlers(db),
    reports: makeReportsHandlers(db),
    paperless: makePaperlessHandlers(deps.documents ?? createDocumentsClient()),
    search: makeSearchHandlers(db),
    settings: makeSettingsHandlers(db),
  });
}
