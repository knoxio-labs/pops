import { inventoryDocuments } from './inventory-documents-shared.js';
import { objectUri } from './uri.js';
import { mapCallResult, optNum, reqStr, toolError } from './utils.js';

import type { CallResult } from '@pops/pillar-sdk/client';

import type { ToolDef } from './tool-def.js';

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rowsAt(value: unknown, key: string): readonly unknown[] | undefined {
  if (!isRow(value)) return undefined;
  const rows = value[key];
  return Array.isArray(rows) ? rows : undefined;
}

function searchHit(row: unknown): unknown {
  if (!isRow(row)) return row;
  return {
    id: row['id'],
    title: row['title'],
    created: row['created'],
    originalFileName: row['originalFileName'],
  };
}

function compactSearch(result: CallResult<unknown>): CallResult<unknown> {
  if (result.kind !== 'ok') return result;
  const rows = rowsAt(result.value, 'data');
  return rows === undefined ? result : { ...result, value: { data: rows.map(searchHit) } };
}

/** The pops web page that shows an item's documents. */
function itemWebPath(itemId: string): string {
  return `/inventory/items/${encodeURIComponent(itemId)}`;
}

function withWebPath(result: CallResult<unknown>, itemId: string): CallResult<unknown> {
  if (result.kind !== 'ok' || !isRow(result.value)) return result;
  const rows = rowsAt(result.value, 'data');
  if (rows === undefined) return result;
  const webPath = itemWebPath(itemId);
  const data = rows.map((row) => (isRow(row) ? { ...row, webPath } : row));
  return {
    ...result,
    value: { ...result.value, itemUri: objectUri('inventory/item', itemId), webPath, data },
  };
}

const SEARCH_SCOPE = 'inventory.paperless.search';
const LIST_SCOPE = 'inventory.documents.listForItem';

const documentsSearch: ToolDef = {
  name: 'documents.search',
  readOnly: true,
  scope: SEARCH_SCOPE,
  description:
    'Search the Paperless document archive by text (2–200 characters). Returns each match as ' +
    '{ id, title, created, originalFileName }; pass the id as paperlessDocumentId to inventory.documents.link. ' +
    'Fails when Paperless is not configured.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: { type: 'string', minLength: 2, maxLength: 200, description: 'Search text' },
    },
    required: ['query'],
  },
  handler: async (args) => {
    const query = reqStr(args, 'query');
    if (!query) return toolError('Missing required field: query');
    const result = await inventoryDocuments().paperless.search({ query });
    return mapCallResult(compactSearch(result), SEARCH_SCOPE);
  },
};

const documentsList: ToolDef = {
  name: 'inventory.documents.list',
  readOnly: true,
  scope: LIST_SCOPE,
  description:
    "List an item's documents: `data` holds the linked Paperless documents (paginated; `missing` is true when " +
    'Paperless no longer has the file), `pending` the uploads Paperless is still consuming, and `failed` the ' +
    'uploads it refused, each with a reason (clear one with inventory.documents.dismissFailed). `webPath` is the ' +
    "pops web page, relative to the pops web origin, where the item's documents are shown and opened.",
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      itemId: { type: 'string', description: 'Item ID' },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Linked documents per page',
      },
      offset: { type: 'integer', minimum: 0, description: 'Linked documents to skip' },
    },
    required: ['itemId'],
  },
  handler: async (args) => {
    const itemId = reqStr(args, 'itemId');
    if (!itemId) return toolError('Missing required field: itemId');
    const limit = optNum(args, 'limit');
    const offset = optNum(args, 'offset');
    const result = await inventoryDocuments().documents.listForItem({
      itemId,
      ...(limit === undefined ? {} : { limit }),
      ...(offset === undefined ? {} : { offset }),
    });
    return mapCallResult(withWebPath(result, itemId), LIST_SCOPE);
  },
};

/** Read-only document tools: Paperless search and an item's linked, pending and failed documents. */
export const documentReadTools: readonly ToolDef[] = [documentsSearch, documentsList];
