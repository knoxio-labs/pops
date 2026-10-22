import { type InventoryDb } from '../../db/index.js';
import { resolveIngestions } from '../modules/documents/ingestions.js';
import * as service from '../modules/documents/service.js';
import { toDocumentIngestion, toItemDocument } from '../modules/documents/types.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';
import { titleSyncError } from './paperless-failures.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryDocumentsContract } from '../../contract/rest-documents.js';
import type { DocumentsClient } from '../documents/client.js';
import type { DocumentUploadsClient } from '../documents/uploads-client.js';

type Req = ServerInferRequest<typeof inventoryDocumentsContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;
const PAPERLESS_PROBE_CONCURRENCY = 16;

async function annotateDocuments(rows: readonly ItemDocumentRow[], documents: DocumentsClient) {
  const annotated = [];
  for (let offset = 0; offset < rows.length; offset += PAPERLESS_PROBE_CONCURRENCY) {
    const batch = rows.slice(offset, offset + PAPERLESS_PROBE_CONCURRENCY);
    annotated.push(
      ...(await Promise.all(
        batch.map(async (row) => ({
          ...toItemDocument(row),
          missing: await documents.paperlessDocumentMissing(row.paperlessDocumentId),
        }))
      ))
    );
  }
  return annotated;
}

type ItemDocumentRow = ReturnType<typeof service.listDocumentsForItem>['rows'][number];

/**
 * Build document-link handlers. Listing first resolves the item's pending
 * uploads, then annotates links with live Paperless existence.
 */
export function makeDocumentsHandlers(
  db: InventoryDb,
  documents: DocumentsClient,
  uploads: DocumentUploadsClient
) {
  return {
    link: ({ params, body }: Req['link']) =>
      runHttp(() => {
        const row = service.linkDocument(db, {
          itemId: params.itemId,
          paperlessDocumentId: body.paperlessDocumentId,
          documentType: body.documentType,
          title: body.title,
        });
        return {
          status: 201 as const,
          body: { data: toItemDocument(row), message: 'Document linked' },
        };
      }),

    unlink: ({ params }: Req['unlink']) =>
      runHttp(() => {
        service.unlinkDocument(db, params.id);
        return { status: 200 as const, body: { message: 'Document unlinked' } };
      }),

    update: ({ params, body }: Req['update']) =>
      runHttp(async () => {
        const link = service.getDocument(db, params.id);
        if (body.title !== undefined) {
          const synced = await uploads.updateTitle(link.paperlessDocumentId, body.title);
          if (!synced.ok) throw titleSyncError(synced.failure);
        }
        const row = service.updateDocument(db, params.id, body);
        return {
          status: 200 as const,
          body: { data: toItemDocument(row), message: 'Document updated' },
        };
      }),

    dismissIngestion: ({ params }: Req['dismissIngestion']) =>
      runHttp(() => {
        service.dismissIngestion(db, params.id);
        return { status: 200 as const, body: { message: 'Upload dismissed' } };
      }),

    listForItem: ({ params, query }: Req['listForItem']) =>
      runHttp(async () => {
        await resolveIngestions(db, uploads, params.itemId);
        const ingestions = service
          .listIngestionsForItem(db, params.itemId)
          .map(toDocumentIngestion);
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = service.listDocumentsForItem(db, params.itemId, limit, offset);
        const data = await annotateDocuments(rows, documents);
        return {
          status: 200 as const,
          body: {
            data,
            pending: ingestions.filter((row) => row.state === 'pending'),
            failed: ingestions.filter((row) => row.state === 'failed'),
            pagination: paginationMeta(total, limit, offset),
          },
        };
      }),
  };
}
