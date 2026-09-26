/**
 * REST contract for the inventory pillar — ts-rest single source of truth.
 *
 * Composes the module sub-routers (items, locations, connections,
 * fixtures, photos, documents, documentFiles, reports, paperless, search,
 * web search, web batch, settings, and the sync protocol's sync, types and codes) into the public
 * wire surface.
 * `generateOpenApi(inventoryContract, …)`
 * projects this to `openapi/inventory.openapi.json`; `openapi-typescript`
 * then projects the JSON to `src/contract/api-types.generated.ts`.
 *
 * Lego principle: this is the ONLY description of the inventory wire
 * format. Don't hand-author OpenAPI or hand-author paths anywhere else.
 */
import { initContract } from '@ts-rest/core';

import { inventoryConnectionsContract } from './rest-connections.js';
import { inventoryDocumentFilesContract } from './rest-document-files.js';
import { inventoryDocumentsContract } from './rest-documents.js';
import { inventoryFixturesContract } from './rest-fixtures.js';
import { inventoryItemsContract } from './rest-items.js';
import { inventoryLocationsContract } from './rest-locations.js';
import { inventoryPaperlessContract } from './rest-paperless.js';
import { inventoryPhotosContract } from './rest-photos.js';
import { inventoryReportsContract } from './rest-reports.js';
import { inventorySearchContract } from './rest-search.js';
import { inventorySettingsContract } from './rest-settings.js';
import {
  inventoryCodesContract,
  inventorySyncContract,
  inventoryTypesContract,
} from './rest-sync.js';
import { inventoryWebBatchContract } from './rest-web-batch.js';
import { inventoryWebChangesContract } from './rest-web-changes.js';
import { inventoryWebEventsContract } from './rest-web-events.js';
import { inventoryWebLocationsContract } from './rest-web-locations.js';
import { inventoryWebSearchContract } from './rest-web-search.js';
import { inventoryWebSummaryContract } from './rest-web-summary.js';
import { inventoryWebContract } from './rest-web.js';

const c = initContract();

export const inventoryContract = c.router(
  {
    items: inventoryItemsContract,
    locations: inventoryLocationsContract,
    connections: inventoryConnectionsContract,
    fixtures: inventoryFixturesContract,
    photos: inventoryPhotosContract,
    documents: inventoryDocumentsContract,
    documentFiles: inventoryDocumentFilesContract,
    reports: inventoryReportsContract,
    paperless: inventoryPaperlessContract,
    search: inventorySearchContract,
    web: inventoryWebContract,
    webBatch: inventoryWebBatchContract,
    webChanges: inventoryWebChangesContract,
    webEvents: inventoryWebEventsContract,
    webLocations: inventoryWebLocationsContract,
    webSearch: inventoryWebSearchContract,
    webSummary: inventoryWebSummaryContract,
    settings: inventorySettingsContract,
    sync: inventorySyncContract,
    types: inventoryTypesContract,
    codes: inventoryCodesContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type InventoryRestContract = typeof inventoryContract;
