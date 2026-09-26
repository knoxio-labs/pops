import { requiredPositiveInteger } from './inventory-catalogue-input.js';
import {
  createFieldValueSchema,
  fieldValuePatchSchema,
  optionalUuid,
  requiredStoredFieldValues,
  requiredUuid,
  storedFieldValueSchema,
} from './inventory-item-input.js';
import {
  parseCreateItemMutationInput,
  parseUpdateItemMutationInput,
} from './inventory-item-mutation-input.js';
import { itemMutationResult } from './inventory-item-mutation-result.js';
import { sendItemMutation } from './inventory-sync-client.js';
import { reqStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

const retryIdentityProperties = {
  mutationId: {
    type: 'string',
    format: 'uuid',
    description: 'Optional idempotency key; reuse it unchanged when retrying an uncertain call',
  },
} as const;

const itemsCreate: ToolDef = {
  name: 'inventory.items.create',
  description:
    'Create a protocol-2 item. Read inventory.catalogue.get first, then send its current revision, stable type ID and complete stable field-value set. To create the item already overriding a computed field whose allowOverride is true, add that field with source "override" and exactly one value; any other field sent as an override is refused. Reuse mutationId and entityId together when retrying an uncertain call.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      itemName: { type: 'string', minLength: 1, description: 'Item name' },
      entityId: {
        type: 'string',
        format: 'uuid',
        description: 'Optional client-minted item ID; reuse it with mutationId on retry',
      },
      catalogueRevision: {
        type: 'integer',
        minimum: 1,
        description: 'Current published revision read from inventory.catalogue.get',
      },
      typeId: {
        type: 'string',
        format: 'uuid',
        description: 'Stable type ID from that catalogue revision',
      },
      fieldValues: { type: 'array', items: createFieldValueSchema },
      note: { type: ['string', 'null'], description: 'Optional note' },
      ...retryIdentityProperties,
    },
    required: ['itemName', 'catalogueRevision', 'typeId', 'fieldValues'],
  },
  handler: async (args) => {
    const input = parseCreateItemMutationInput(args);
    if (!input.ok) return toolError(input.error);
    const retryId = input.value.mutationId ?? input.value.entityId ?? crypto.randomUUID();
    const itemId = input.value.entityId ?? retryId;
    const result = await sendItemMutation({
      entityId: itemId,
      op: 'item.create',
      args: {
        item: {
          name: input.value.itemName,
          typeId: input.value.typeId,
          values: input.value.fieldValues,
          ...(input.value.note === undefined ? {} : { note: input.value.note }),
        },
      },
      baseRevision: null,
      catalogueRevision: input.value.catalogueRevision,
      mutationId: retryId,
    });
    return itemMutationResult(itemId, result);
  },
};

const itemsUpdate: ToolDef = {
  name: 'inventory.items.update',
  description:
    'Edit an item at an observed item revision using the current catalogue revision. Read inventory.items.get and inventory.catalogue.get first. fieldValues is a stable field-ID patch; null clears an optional value.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', description: 'Item ID' },
      revision: { type: 'integer', minimum: 1, description: 'Revision returned by items.get' },
      catalogueRevision: {
        type: 'integer',
        minimum: 1,
        description: 'Current published revision returned by catalogue.get',
      },
      itemName: { type: 'string', minLength: 1, description: 'New item name' },
      note: { type: ['string', 'null'], description: 'New note; null clears it' },
      fieldValues: { type: 'array', minItems: 1, items: fieldValuePatchSchema },
      ...retryIdentityProperties,
    },
    required: ['id', 'revision', 'catalogueRevision'],
  },
  handler: async (args) => {
    const input = parseUpdateItemMutationInput(args);
    if (!input.ok) return toolError(input.error);
    const result = await sendItemMutation({
      entityId: input.value.id,
      op: 'item.edit',
      args: {
        ...(input.value.itemName === undefined ? {} : { name: input.value.itemName }),
        ...(input.value.note === undefined ? {} : { note: input.value.note }),
        ...(input.value.fieldValues === undefined ? {} : { values: input.value.fieldValues }),
      },
      baseRevision: input.value.itemRevision,
      catalogueRevision: input.value.catalogueRevision,
      ...(input.value.mutationId === undefined ? {} : { mutationId: input.value.mutationId }),
    });
    return itemMutationResult(input.value.id, result);
  },
};

const itemsChangeType: ToolDef = {
  name: 'inventory.items.changeType',
  description:
    'Change an item to a stable type ID and replace all its field values. Read the item and current catalogue first; this is an optimistic-concurrency write.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', description: 'Item ID' },
      revision: { type: 'integer', minimum: 1, description: 'Revision returned by items.get' },
      catalogueRevision: {
        type: 'integer',
        minimum: 1,
        description: 'Current published revision returned by catalogue.get',
      },
      typeId: { type: 'string', format: 'uuid', description: 'New stable type ID' },
      fieldValues: { type: 'array', items: storedFieldValueSchema },
      ...retryIdentityProperties,
    },
    required: ['id', 'revision', 'catalogueRevision', 'typeId', 'fieldValues'],
  },
  handler: async (args) => {
    const id = reqStr(args, 'id');
    if (!id) return toolError('Missing required field: id');
    const itemRevision = requiredPositiveInteger(args, 'revision');
    if (!itemRevision.ok) return toolError(itemRevision.error);
    const catalogueRevision = requiredPositiveInteger(args, 'catalogueRevision');
    if (!catalogueRevision.ok) return toolError(catalogueRevision.error);
    const typeId = requiredUuid(args, 'typeId');
    if (!typeId.ok) return toolError(typeId.error);
    const values = requiredStoredFieldValues(args);
    if (!values.ok) return toolError(values.error);
    const mutationId = optionalUuid(args, 'mutationId');
    if (!mutationId.ok) return toolError(mutationId.error);
    const result = await sendItemMutation({
      entityId: id,
      op: 'item.changeType',
      args: { typeId: typeId.value, values: values.value },
      baseRevision: itemRevision.value,
      catalogueRevision: catalogueRevision.value,
      ...(mutationId.value === undefined ? {} : { mutationId: mutationId.value }),
    });
    return itemMutationResult(id, result);
  },
};

export const itemWriteTools: readonly ToolDef[] = [itemsCreate, itemsUpdate, itemsChangeType];
