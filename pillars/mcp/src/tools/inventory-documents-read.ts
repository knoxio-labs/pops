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

const LIST_SCOPE = 'inventory.documents.listForItem';

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

/** Read the Inventory-owned links, pending uploads and failed uploads for an item. */
export const documentReadTools: readonly ToolDef[] = [documentsList];
