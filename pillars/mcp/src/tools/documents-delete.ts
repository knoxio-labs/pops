import {
  documentsPillar,
  inventoryDocuments,
  paperlessIdProperty,
  reqPositiveInt,
} from './inventory-documents-shared.js';
import { mapCallResult, ok, optBool, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

const DELETE_SCOPE = 'documents.write.delete';
const LINK_LOOKUP_SCOPE = 'inventory.documents.listForPaperlessDocument';

/** Delete a Paperless document through documents, refusing while inventory items still link it. */
export const deleteDocumentTool: ToolDef = {
  name: 'documents.delete',
  readOnly: false,
  scope: DELETE_SCOPE,
  description:
    'Delete a document from Paperless (Paperless moves it to its trash). This removes the file for EVERY item ' +
    'linked to it. The tool first asks inventory which items link it and refuses, listing them, while any do: ' +
    'unlink it from each with inventory.documents.unlink, then call again. force: true skips that check and ' +
    'deletes anyway; the remaining links then show the document as missing.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      paperlessDocumentId: paperlessIdProperty,
      force: {
        type: 'boolean',
        description:
          'Delete even while items still link the document, without checking them (default false)',
      },
    },
    required: ['paperlessDocumentId'],
  },
  handler: async (args) => {
    const id = reqPositiveInt(args, 'paperlessDocumentId');
    if (id === null) {
      return toolError(
        'Missing or invalid required field: paperlessDocumentId (a positive integer)'
      );
    }
    if (optBool(args, 'force') !== true) {
      const links = await inventoryDocuments().documents.listForPaperlessDocument({
        paperlessDocumentId: id,
      });
      if (links.kind !== 'ok') return mapCallResult(links, LINK_LOOKUP_SCOPE);
      const linked = links.value.data;
      if (linked.length > 0) {
        const items = linked
          .map((entry) => `item ${entry.itemId} (link ${String(entry.id)})`)
          .join(', ');
        return toolError(
          `Refusing to delete Paperless document ${String(id)}: ${String(linked.length)} inventory link(s) ` +
            `still use it: ${items}. Unlink each with inventory.documents.unlink and call again, or pass ` +
            'force: true to delete anyway.'
        );
      }
    }
    const result = await documentsPillar().write.delete({ id });
    if (result.kind !== 'ok') return mapCallResult(result, DELETE_SCOPE);
    return ok({ deleted: true, paperlessDocumentId: id });
  },
};
