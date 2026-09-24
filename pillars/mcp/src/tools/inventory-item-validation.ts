import { catalogueClient } from './inventory-catalogue-client.js';
import { requiredPositiveInteger } from './inventory-catalogue-input.js';
import { INVENTORY_TYPES_READ_SCOPE } from './inventory-catalogue-scopes.js';
import {
  requiredUuid,
  requiredValidationFieldValues,
  validationFieldValueSchema,
} from './inventory-item-input.js';
import { mapCallResult, optStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

/** Non-mutating, producer-authoritative validation for a complete item value set. */
export const itemValidationTool: ToolDef = {
  name: 'inventory.items.validate',
  description:
    'Validate and canonicalise a complete stable-ID item value set without writing. Read inventory.catalogue.get first and copy its revision, type ID, field IDs, enum option IDs, cardinalities and constraints.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      catalogueRevision: {
        type: 'integer',
        minimum: 1,
        description: 'Exact published revision read from inventory.catalogue.get',
      },
      typeId: { type: 'string', format: 'uuid', description: 'Stable type ID in that revision' },
      existingItemId: {
        type: 'string',
        minLength: 1,
        description: 'Existing item when validating retained archived values or an edit',
      },
      fieldValues: { type: 'array', items: validationFieldValueSchema },
    },
    required: ['catalogueRevision', 'typeId', 'fieldValues'],
  },
  scope: INVENTORY_TYPES_READ_SCOPE,
  handler: async (args) => {
    const revision = requiredPositiveInteger(args, 'catalogueRevision');
    if (!revision.ok) return toolError(revision.error);
    const typeId = requiredUuid(args, 'typeId');
    if (!typeId.ok) return toolError(typeId.error);
    const fieldValues = requiredValidationFieldValues(args);
    if (!fieldValues.ok) return toolError(fieldValues.error);
    const existingItemId = optStr(args, 'existingItemId');
    if ('existingItemId' in args && (!existingItemId || existingItemId.length === 0)) {
      return toolError('Invalid field: existingItemId');
    }
    return mapCallResult(
      await catalogueClient().read.validateItem({
        catalogueRevision: revision.value,
        typeId: typeId.value,
        fieldValues: fieldValues.value,
        ...(existingItemId === undefined ? {} : { existingItemId }),
      }),
      INVENTORY_TYPES_READ_SCOPE
    );
  },
};
