import { sendItemMutation, withCurrentRevision } from './inventory-sync-client.js';
/**
 * Container tools (open/close, mark full) and lifecycle tools (discard,
 * restore), each over the sync mutation protocol (Inventory ADR-002).
 * `item.setAccess`, `item.setFull` and `item.setLifecycle` need the item's
 * current revision first, same as the placement ops; `item.restoreDeleted`
 * checks its own precondition and takes none.
 */
import { mapCallResult, optBool, optStr, reqStr, toolError } from './utils.js';

import type { ToolDef } from './index.js';

function setAccessTool(name: string, access: 'open' | 'closed'): ToolDef {
  return {
    name,
    description: `Mark a container item as ${access}.`,
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Item ID (must be a container)' } },
      required: ['id'],
    },
    handler: async (args) => {
      const id = reqStr(args, 'id');
      if (!id) return toolError('Missing required field: id');
      return mapCallResult(
        await withCurrentRevision(id, (baseRevision) =>
          sendItemMutation(id, 'item.setAccess', { access }, baseRevision)
        )
      );
    },
  };
}

const itemsSetFull: ToolDef = {
  name: 'inventory.items.setFull',
  description: 'Mark a container item as full or not full.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Item ID (must be a container)' },
      full: { type: 'boolean', description: 'Whether the container is full' },
    },
    required: ['id', 'full'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const full = optBool(args, 'full');
    if (full === undefined) return toolError('Missing required field: full');
    return mapCallResult(
      await withCurrentRevision(id, (baseRevision) =>
        sendItemMutation(id, 'item.setFull', { full }, baseRevision)
      )
    );
  },
};

const itemsDiscard: ToolDef = {
  name: 'inventory.items.discard',
  description: 'Discard an item (soft-deletes it). Restorable with inventory.items.restore.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Item ID' },
      reason: { type: 'string', description: 'Why it was discarded (e.g. "broken", "donated")' },
    },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const reason = optStr(args, 'reason');
    return mapCallResult(
      await withCurrentRevision(id, (baseRevision) =>
        sendItemMutation(
          id,
          'item.setLifecycle',
          { lifecycle: 'discarded', ...(reason !== undefined ? { reason } : {}) },
          baseRevision
        )
      )
    );
  },
};

const itemsRestore: ToolDef = {
  name: 'inventory.items.restore',
  description:
    'Restore a discarded (soft-deleted) item. Has no effect on an item that is not deleted.',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string', description: 'Item ID' } },
    required: ['id'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    return mapCallResult(await sendItemMutation(id, 'item.restoreDeleted', {}, null));
  },
};

export const lifecycleTools: readonly ToolDef[] = [
  setAccessTool('inventory.items.open', 'open'),
  setAccessTool('inventory.items.close', 'closed'),
  itemsSetFull,
  itemsDiscard,
  itemsRestore,
];
