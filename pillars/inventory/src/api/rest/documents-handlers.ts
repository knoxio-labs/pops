import { type InventoryDb } from '../../db/index.js';
import * as service from '../modules/documents/service.js';
import { toItemDocument } from '../modules/documents/types.js';
import { paginationMeta } from '../shared/pagination.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { inventoryDocumentsContract } from '../../contract/rest-documents.js';
import type { DocumentsClient } from '../documents/client.js';

type Req = ServerInferRequest<typeof inventoryDocumentsContract>;

const DEFAULT_LIMIT = 50;
const DEFAULT_OFFSET = 0;

/** Build document-link handlers and annotate list results with live Paperless existence. */
export function makeDocumentsHandlers(db: InventoryDb, documents: DocumentsClient) {
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

    listForItem: ({ params, query }: Req['listForItem']) =>
      runHttp(async () => {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const offset = query.offset ?? DEFAULT_OFFSET;
        const { rows, total } = service.listDocumentsForItem(db, params.itemId, limit, offset);
        const data = await Promise.all(
          rows.map(async (row) => ({
            ...toItemDocument(row),
            missing: await documents.paperlessDocumentMissing(row.paperlessDocumentId),
          }))
        );
        return {
          status: 200 as const,
          body: {
            data,
            pagination: paginationMeta(total, limit, offset),
          },
        };
      }),
  };
}
