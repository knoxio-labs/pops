import { eq } from 'drizzle-orm';

import { loadPublishedCatalogue } from '../../catalogue/index.js';
import { PROTOCOL_HEADER } from '../../contract/rest-sync.js';
import { items } from '../../db/index.js';
import { readProtocol1Catalogue } from '../sync/catalogue.js';
import { SyncRequestError } from '../sync/errors.js';
import { readMinProtocol } from '../sync/meta.js';
import { requireProtocol } from '../sync/protocol.js';
import { loadItemExtras, projectItemsWithIssues } from '../sync/wire.js';

import type { ServerInferRequest, ServerInferResponses } from '@ts-rest/core';

import type { inventorySyncContract } from '../../contract/rest-sync.js';
import type { InventoryDb } from '../../db/index.js';
import type { DocumentsClient } from '../documents/client.js';

type SyncReq = ServerInferRequest<typeof inventorySyncContract>;
type ItemSuccess = Extract<
  ServerInferResponses<typeof inventorySyncContract.item>,
  { status: 200 }
>;

/** Creates the targeted item read used to retry an item-specific sync issue. */
export function makeItemSyncHandler(
  db: InventoryDb,
  documents: DocumentsClient
): (request: SyncReq['item']) => Promise<ItemSuccess> {
  return async ({ params, headers }: SyncReq['item']) => {
    const { row, page, catalogue, catalogueRevision } = db.transaction((tx) => {
      const minimumProtocol = readMinProtocol(tx);
      const protocol = requireProtocol(headers[PROTOCOL_HEADER], minimumProtocol);
      const row = tx.select().from(items).where(eq(items.id, params.id)).get();
      if (!row) return { row: null, page: null, catalogue: null, catalogueRevision: null };
      return {
        row,
        page: { items: [row], extras: loadItemExtras(tx, [row.id], protocol) },
        catalogue: readProtocol1Catalogue(tx),
        catalogueRevision: loadPublishedCatalogue(tx)?.revision.revision ?? null,
      };
    });
    if (!row || !page) {
      throw new SyncRequestError(404, 'not_found', `item '${params.id}' not found`);
    }
    const projected = await projectItemsWithIssues(page, documents);
    return {
      status: 200 as const,
      body: {
        item: projected.items[0] ?? null,
        issues: projected.issues,
        catalogueVersion: catalogue?.version ?? '',
        catalogueRevision,
      },
    };
  };
}
