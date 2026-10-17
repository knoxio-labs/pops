import { requiredPositiveInteger } from './inventory-catalogue-input.js';
import { optionalUuid } from './inventory-item-input.js';
import { itemMutationResult } from './inventory-item-mutation-result.js';
import { sendItemMutation } from './inventory-sync-client.js';
import { reqStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

/** Sets an item's absolute count at the caller-observed revision with optional retry identity. */
export const itemQuantityTool: ToolDef = {
  name: 'inventory.items.setQuantity',
  readOnly: false,
  description:
    'Set the absolute item count to a positive whole number at the revision returned by inventory.items.get. Containers must have quantity 1. To discard an item, use inventory.items.discard. Supply mutationId and reuse it unchanged when retrying an uncertain call.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', description: 'Item ID' },
      revision: { type: 'integer', minimum: 1, description: 'Revision returned by items.get' },
      quantity: { type: 'integer', minimum: 1, description: 'Absolute item count' },
      mutationId: { type: 'string', format: 'uuid', description: 'Optional idempotency key' },
    },
    required: ['id', 'revision', 'quantity'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const revision = requiredPositiveInteger(args, 'revision');
    if (!revision.ok) return toolError(revision.error);
    const quantity = requiredPositiveInteger(args, 'quantity');
    if (!quantity.ok) return toolError(quantity.error);
    const mutationId = optionalUuid(args, 'mutationId');
    if (!mutationId.ok) return toolError(mutationId.error);
    return itemMutationResult(
      id,
      await sendItemMutation({
        entityId: id,
        op: 'item.setQuantity',
        args: { quantity: quantity.value },
        baseRevision: revision.value,
        ...(mutationId.value === undefined ? {} : { mutationId: mutationId.value }),
      })
    );
  },
};
