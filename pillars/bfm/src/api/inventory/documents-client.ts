/**
 * bfm's leg into inventory's `documents.*` contract: list an item's links and
 * unfinished uploads, edit a link, unlink it, dismiss an upload. Each call
 * needs the `inventory.documents` scope on bfm's service account.
 *
 * The raw upload and file download are `document-bytes-client.ts`; they have
 * no OpenAPI operation `pillar()` could call.
 */
import { z } from 'zod';

import {
  MobileDocumentIngestionSchema,
  MobileItemDocumentSchema,
  MobileLinkedItemDocumentSchema,
  type MobileItemDocument,
  type MobileItemDocuments,
  type MobileUpdateItemDocumentBody,
} from '../../contract/mobile-inventory-document-schemas.js';
import { isGatewayOk } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';

import type { GatewayOutcome, PillarGateway } from '../pillars/gateway.js';

const INVENTORY_PILLAR_ID = 'inventory';

/** Inventory's own page cap for `documents.listForItem`. */
const LIST_PAGE_LIMIT = 500;

type InventoryDocumentsRouter = {
  documents: {
    listForItem: (input: { itemId: string; limit: number; offset: number }) => Promise<unknown>;
    update: (input: { id: number } & MobileUpdateItemDocumentBody) => Promise<unknown>;
    unlink: (input: { id: number }) => Promise<unknown>;
    dismissIngestion: (input: { id: number }) => Promise<unknown>;
  };
};

const ListPageSchema = z.object({
  data: z.array(MobileLinkedItemDocumentSchema),
  pending: z.array(MobileDocumentIngestionSchema),
  failed: z.array(MobileDocumentIngestionSchema),
  pagination: z.object({ hasMore: z.boolean() }),
});

type ListPage = z.infer<typeof ListPageSchema>;

const UpdatedSchema = z.object({ data: MobileItemDocumentSchema });

const MessageSchema = z.object({ message: z.string() });

export interface MobileInventoryDocumentsClient {
  /** Every link of the item, across inventory's pages, and its pending and failed uploads. */
  list(itemId: string): Promise<GatewayOutcome<MobileItemDocuments>>;
  update(
    id: number,
    body: MobileUpdateItemDocumentBody
  ): Promise<GatewayOutcome<MobileItemDocument>>;
  unlink(id: number): Promise<GatewayOutcome<null>>;
  dismissIngestion(id: number): Promise<GatewayOutcome<null>>;
}

async function listPage(
  gateway: PillarGateway,
  itemId: string,
  offset: number
): Promise<GatewayOutcome<ListPage>> {
  const outcome = await gateway.call<InventoryDocumentsRouter, unknown>(
    INVENTORY_PILLAR_ID,
    (handle) => handle.documents.listForItem({ itemId, limit: LIST_PAGE_LIMIT, offset })
  );
  return parseOrMismatch(INVENTORY_PILLAR_ID, outcome, ListPageSchema, 'documents.listForItem');
}

async function list(
  gateway: PillarGateway,
  itemId: string
): Promise<GatewayOutcome<MobileItemDocuments>> {
  const first = await listPage(gateway, itemId, 0);
  if (!isGatewayOk(first)) return first;
  const linked = [...first.value.data];
  let page = first.value;
  // An empty page that claims more would loop forever; stop on it instead.
  while (page.pagination.hasMore && page.data.length > 0) {
    const next = await listPage(gateway, itemId, linked.length);
    if (!isGatewayOk(next)) return next;
    page = next.value;
    linked.push(...page.data);
  }
  return {
    kind: 'ok',
    value: { linked, pending: first.value.pending, failed: first.value.failed },
  };
}

async function update(
  gateway: PillarGateway,
  id: number,
  body: MobileUpdateItemDocumentBody
): Promise<GatewayOutcome<MobileItemDocument>> {
  const outcome = await gateway.call<InventoryDocumentsRouter, unknown>(
    INVENTORY_PILLAR_ID,
    (handle) => handle.documents.update({ id, ...body })
  );
  const parsed = parseOrMismatch(INVENTORY_PILLAR_ID, outcome, UpdatedSchema, 'documents.update');
  return isGatewayOk(parsed) ? { kind: 'ok', value: parsed.value.data } : parsed;
}

async function remove(
  gateway: PillarGateway,
  operation: 'unlink' | 'dismissIngestion',
  id: number
): Promise<GatewayOutcome<null>> {
  const outcome = await gateway.call<InventoryDocumentsRouter, unknown>(
    INVENTORY_PILLAR_ID,
    (handle) =>
      operation === 'unlink'
        ? handle.documents.unlink({ id })
        : handle.documents.dismissIngestion({ id })
  );
  const parsed = parseOrMismatch(
    INVENTORY_PILLAR_ID,
    outcome,
    MessageSchema,
    `documents.${operation}`
  );
  return isGatewayOk(parsed) ? { kind: 'ok', value: null } : parsed;
}

/** Build the documents client over the inventory gateway. */
export function createMobileInventoryDocumentsClient(
  gateway: PillarGateway
): MobileInventoryDocumentsClient {
  return {
    list: (itemId) => list(gateway, itemId),
    update: (id, body) => update(gateway, id, body),
    unlink: (id) => remove(gateway, 'unlink', id),
    dismissIngestion: (id) => remove(gateway, 'dismissIngestion', id),
  };
}
