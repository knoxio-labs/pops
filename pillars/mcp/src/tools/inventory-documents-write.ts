import { deleteDocumentTool } from './documents-delete.js';
import {
  coerceDocumentType,
  documentTypeProperty,
  inventoryDocuments,
  paperlessIdProperty,
  reqPositiveInt,
  titleProperty,
} from './inventory-documents-shared.js';
import { mapCallResult, optStr, reqStr, toolError } from './utils.js';

import type { DocumentType } from '../uploads/upload-tokens.js';
import type { ToolDef } from './tool-def.js';

const linkIdProperty = {
  type: 'integer',
  minimum: 1,
  description: "The document link's id (`data[].id` from inventory.documents.list)",
} as const;

const LINK_SCOPE = 'inventory.documents.link';
const UPDATE_SCOPE = 'inventory.documents.update';
const UNLINK_SCOPE = 'inventory.documents.unlink';
const DISMISS_SCOPE = 'inventory.documents.dismissIngestion';

const link: ToolDef = {
  name: 'inventory.documents.link',
  readOnly: false,
  scope: LINK_SCOPE,
  description:
    'Link a document already in Paperless (find it with documents.search) to an item. ' +
    'Linking the same document to the same item twice is refused as a conflict.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      itemId: { type: 'string', description: 'Item ID' },
      paperlessDocumentId: paperlessIdProperty,
      documentType: documentTypeProperty,
      title: { type: 'string', description: 'Optional title for the link' },
    },
    required: ['itemId', 'paperlessDocumentId', 'documentType'],
  },
  handler: async (args) => {
    const itemId = reqStr(args, 'itemId');
    if (!itemId) return toolError('Missing required field: itemId');
    const paperlessDocumentId = reqPositiveInt(args, 'paperlessDocumentId');
    if (paperlessDocumentId === null) {
      return toolError(
        'Missing or invalid required field: paperlessDocumentId (a positive integer)'
      );
    }
    const title = optStr(args, 'title');
    const result = await inventoryDocuments().documents.link({
      itemId,
      paperlessDocumentId,
      documentType: coerceDocumentType(args['documentType']),
      ...(title === undefined ? {} : { title }),
    });
    return mapCallResult(result, LINK_SCOPE);
  },
};

const update: ToolDef = {
  name: 'inventory.documents.update',
  readOnly: false,
  scope: UPDATE_SCOPE,
  description:
    'Change the kind or title of a linked document; only the fields given change. A new title is set in ' +
    'Paperless first, and nothing changes when Paperless refuses it or no longer has the document.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: { id: linkIdProperty, documentType: documentTypeProperty, title: titleProperty },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqPositiveInt(args, 'id');
    if (id === null) return toolError('Missing or invalid required field: id (a positive integer)');
    const patch: { documentType?: DocumentType; title?: string } = {};
    if ('documentType' in args) patch.documentType = coerceDocumentType(args['documentType']);
    const title = optStr(args, 'title');
    if (title !== undefined) patch.title = title;
    if (Object.keys(patch).length === 0) {
      return toolError('Nothing to change: pass documentType, title, or both.');
    }
    return mapCallResult(
      await inventoryDocuments().documents.update({ id, ...patch }),
      UPDATE_SCOPE
    );
  },
};

const ingestionIdProperty = {
  type: 'integer',
  minimum: 1,
  description: 'The upload id (`pending[].id` or `failed[].id` from inventory.documents.list)',
} as const;

type IdToolDefinition = Pick<ToolDef, 'name' | 'description'> & {
  readonly scope: string;
  readonly idKey: string;
  readonly idProperty: typeof linkIdProperty | typeof ingestionIdProperty;
};

function idTool(
  definition: IdToolDefinition,
  call: (id: number) => ReturnType<ReturnType<typeof inventoryDocuments>['documents']['unlink']>
): ToolDef {
  const { idKey, idProperty, ...rest } = definition;
  return {
    ...rest,
    readOnly: false,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { [idKey]: idProperty },
      required: [idKey],
    },
    handler: async (args) => {
      const id = reqPositiveInt(args, idKey);
      if (id === null) {
        return toolError(`Missing or invalid required field: ${idKey} (a positive integer)`);
      }
      return mapCallResult(await call(id), definition.scope);
    },
  };
}

const unlink = idTool(
  {
    name: 'inventory.documents.unlink',
    scope: UNLINK_SCOPE,
    idKey: 'id',
    idProperty: linkIdProperty,
    description:
      'Remove a document link from an item. The document stays in Paperless and on any other item it is linked to; ' +
      'deleting it from Paperless is documents.delete.',
  },
  (id) => inventoryDocuments().documents.unlink({ id })
);

const dismissFailed = idTool(
  {
    name: 'inventory.documents.dismissFailed',
    scope: DISMISS_SCOPE,
    idKey: 'ingestionId',
    idProperty: ingestionIdProperty,
    description:
      "Clear a failed upload from an item's document list (a stuck pending one too). Nothing is deleted from Paperless.",
  },
  (id) => inventoryDocuments().documents.dismissIngestion({ id })
);

/** Document link writes over inventory, plus deletion from Paperless through documents. */
export const documentWriteTools: readonly ToolDef[] = [
  link,
  update,
  unlink,
  dismissFailed,
  deleteDocumentTool,
];
