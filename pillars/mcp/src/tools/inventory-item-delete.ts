import { requiredPositiveInteger } from './inventory-catalogue-input.js';
import { optionalUuid } from './inventory-item-input.js';
import { itemMutationResult } from './inventory-item-mutation-result.js';
import { sendItemMutation } from './inventory-sync-client.js';
import { reqStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

/** Optimistic, idempotent item tombstone command. */
export const itemDeleteTool: ToolDef = {
  name: 'inventory.items.delete',
  description:
    'Delete an item at the revision returned by inventory.items.get. Supply mutationId and reuse it unchanged when retrying an uncertain call.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', description: 'Item ID' },
      revision: { type: 'integer', minimum: 1, description: 'Revision returned by items.get' },
      mutationId: { type: 'string', format: 'uuid', description: 'Optional idempotency key' },
    },
    required: ['id', 'revision'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const revision = requiredPositiveInteger(args, 'revision');
    if (!revision.ok) return toolError(revision.error);
    const mutationId = optionalUuid(args, 'mutationId');
    if (!mutationId.ok) return toolError(mutationId.error);
    return itemMutationResult(
      id,
      await sendItemMutation({
        entityId: id,
        op: 'item.delete',
        args: {},
        baseRevision: revision.value,
        ...(mutationId.value === undefined ? {} : { mutationId: mutationId.value }),
      })
    );
  },
};
