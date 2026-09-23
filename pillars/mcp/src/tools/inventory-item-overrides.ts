import { requiredPositiveInteger } from './inventory-catalogue-input.js';
import { optionalUuid, requiredUuid } from './inventory-item-input.js';
import { itemMutationResult } from './inventory-item-mutation-result.js';
import { sendItemMutation } from './inventory-sync-client.js';
import { toolError } from './utils.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { ToolDef } from './tool-def.js';

type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; error: string };

interface OverrideTarget {
  readonly id: string;
  readonly itemRevision: number;
  readonly catalogueRevision: number;
  readonly fieldId: string;
  readonly mutationId?: string;
}

const targetProperties = {
  id: { type: 'string', format: 'uuid', description: 'Item ID' },
  revision: { type: 'integer', minimum: 1, description: 'Revision returned by items.get' },
  catalogueRevision: {
    type: 'integer',
    minimum: 1,
    description: 'Current published revision returned by catalogue.get',
  },
  fieldId: {
    type: 'string',
    format: 'uuid',
    description: 'Stable ID of a computed field whose definition has allowOverride',
  },
  mutationId: {
    type: 'string',
    format: 'uuid',
    description: 'Optional idempotency key; reuse it unchanged when retrying an uncertain call',
  },
} as const;

function parseTarget(args: Record<string, unknown>): Parsed<OverrideTarget> {
  const id = requiredUuid(args, 'id');
  if (!id.ok) return id;
  const itemRevision = requiredPositiveInteger(args, 'revision');
  if (!itemRevision.ok) return itemRevision;
  const catalogueRevision = requiredPositiveInteger(args, 'catalogueRevision');
  if (!catalogueRevision.ok) return catalogueRevision;
  const fieldId = requiredUuid(args, 'fieldId');
  if (!fieldId.ok) return fieldId;
  const mutationId = optionalUuid(args, 'mutationId');
  if (!mutationId.ok) return mutationId;
  return {
    ok: true,
    value: {
      id: id.value,
      itemRevision: itemRevision.value,
      catalogueRevision: catalogueRevision.value,
      fieldId: fieldId.value,
      ...(mutationId.value === undefined ? {} : { mutationId: mutationId.value }),
    },
  };
}

async function sendOverride(
  target: OverrideTarget,
  op: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const result = await sendItemMutation({
    entityId: target.id,
    op,
    args: { fieldId: target.fieldId, ...args },
    baseRevision: target.itemRevision,
    catalogueRevision: target.catalogueRevision,
    ...(target.mutationId === undefined ? {} : { mutationId: target.mutationId }),
  });
  return itemMutationResult(target.id, result);
}

const itemsSetOverride: ToolDef = {
  name: 'inventory.items.setOverride',
  description:
    "Supersede a computed field with one explicit value until the override is cleared, whatever later happens to the fields its expression reads. Only a computed field with allowOverride accepts it. The value uses the field kind's stored-value shape from inventory.catalogue.get.",
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      ...targetProperties,
      value: { description: "The single override value, in the field kind's wire shape" },
    },
    required: ['id', 'revision', 'catalogueRevision', 'fieldId', 'value'],
  },
  handler: async (args) => {
    const target = parseTarget(args);
    if (!target.ok) return toolError(target.error);
    if (args['value'] === undefined || args['value'] === null) {
      return toolError('Missing required field: value');
    }
    return sendOverride(target.value, 'item.setOverride', { values: [args['value']] });
  },
};

const itemsClearOverride: ToolDef = {
  name: 'inventory.items.clearOverride',
  description:
    "Remove a computed field's override so the server evaluates its expression again on the next read. Clearing a field with no override changes nothing.",
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: targetProperties,
    required: ['id', 'revision', 'catalogueRevision', 'fieldId'],
  },
  handler: async (args) => {
    const target = parseTarget(args);
    if (!target.ok) return toolError(target.error);
    return sendOverride(target.value, 'item.clearOverride', {});
  },
};

/** MCP tools that set and clear an explicit override on an overridable computed field. */
export const itemOverrideTools: readonly ToolDef[] = [itemsSetOverride, itemsClearOverride];
