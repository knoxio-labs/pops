import { catalogueClient, mapDraftCallResult } from './inventory-catalogue-client.js';
import {
  expectedDraftVersionSchema,
  requiredPositiveInteger,
} from './inventory-catalogue-input.js';
import { catalogueOperationSchema, expressionSchemaDefs } from './inventory-catalogue-schema.js';
import { INVENTORY_TYPES_MANAGE_SCOPE } from './inventory-catalogue-scopes.js';
import { optStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

type PreviewField = { readonly id: string } | { readonly key: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function previewField(args: Record<string, unknown>): PreviewField | null {
  const fieldId = optStr(args, 'fieldId');
  const fieldKey = optStr(args, 'fieldKey');
  if ((fieldId === undefined) === (fieldKey === undefined)) return null;
  return fieldId === undefined ? { key: fieldKey ?? '' } : { id: fieldId };
}

function optionalOperations(args: Record<string, unknown>): Record<string, unknown>[] | null {
  const value = args['operations'];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isRecord)) return null;
  return value;
}

/**
 * Non-mutating "try on an item": evaluates a draft computed field on one item,
 * optionally after unsaved operations, and returns the raw outcome (value,
 * unavailable with every missing input, the item it was read on and why, or an evaluation error code) with the
 * dependencies and items it read.
 */
export const cataloguePreviewComputedField: ToolDef = {
  name: 'inventory.catalogue.previewComputedField',
  description:
    'Read inventory.catalogue.readDraft first, then evaluate one computed field of that draft on one item, optionally after unsaved operations, without writing anything. Name the field by fieldId, or by fieldKey when an operation creates it. Returns the value, or why it is unavailable as missingInputs (each input with no value, the item it was read on, and its reason), or the raw evaluation error code (e.g. division_by_zero), plus the dependencies read and the item names. Refused with catalogue_draft_conflict when expectedDraftVersion is stale, and with the save issue paths when the operations are invalid.',
  inputSchema: {
    type: 'object',
    $defs: expressionSchemaDefs,
    properties: {
      revision: { type: 'integer', minimum: 1, description: 'Draft revision' },
      baseRevision: {
        type: 'integer',
        minimum: 1,
        description: 'Published revision the draft is based on',
      },
      expectedDraftVersion: expectedDraftVersionSchema,
      operations: {
        type: 'array',
        items: catalogueOperationSchema,
        maxItems: 100,
        description: 'Unsaved operations applied, validated and rolled back around the evaluation',
      },
      typeId: { type: 'string', format: 'uuid', description: 'Type that owns the computed field' },
      fieldId: { type: 'string', format: 'uuid', description: 'Computed field id' },
      fieldKey: { type: 'string', description: 'Key of a computed field an operation creates' },
      itemId: { type: 'string', description: 'Item of that type to evaluate on' },
    },
    required: ['revision', 'baseRevision', 'expectedDraftVersion', 'typeId', 'itemId'],
  },
  scope: INVENTORY_TYPES_MANAGE_SCOPE,
  handler: async (args) => {
    const revision = requiredPositiveInteger(args, 'revision');
    if (!revision.ok) return toolError(revision.error);
    const baseRevision = requiredPositiveInteger(args, 'baseRevision');
    if (!baseRevision.ok) return toolError(baseRevision.error);
    const expectedDraftVersion = requiredPositiveInteger(args, 'expectedDraftVersion');
    if (!expectedDraftVersion.ok) return toolError(expectedDraftVersion.error);
    const typeId = optStr(args, 'typeId');
    const itemId = optStr(args, 'itemId');
    if (typeId === undefined || itemId === undefined)
      return toolError('Missing or invalid required field: typeId and itemId');
    const field = previewField(args);
    if (field === null) return toolError('Give exactly one of fieldId or fieldKey');
    const operations = optionalOperations(args);
    if (operations === null) return toolError('Invalid field: operations');
    return mapDraftCallResult(
      await catalogueClient().manage.previewComputedField({
        revision: revision.value,
        baseRevision: baseRevision.value,
        expectedDraftVersion: expectedDraftVersion.value,
        operations,
        typeId,
        field,
        itemId,
      }),
      INVENTORY_TYPES_MANAGE_SCOPE
    );
  },
};

/**
 * Non-mutating "try on an item" against the published catalogue: evaluates an
 * unsaved computed field on one item, optionally after unsaved operations,
 * with no draft required or created. Nothing is written.
 */
export const cataloguePreviewComputedFieldOnPublished: ToolDef = {
  name: 'inventory.catalogue.previewComputedFieldOnPublished',
  description:
    'Evaluate one computed field against the published catalogue on one item, optionally after unsaved operations, without creating a draft and without writing anything. Name the field by fieldId, or by fieldKey when an operation creates it. Returns the value, or why it is unavailable as missingInputs (each input with no value, the item it was read on, and its reason), or the raw evaluation error code (e.g. division_by_zero), plus the dependencies read and the item names. Refused with catalogue_conflict when the published catalogue has moved since baseRevision was read.',
  inputSchema: {
    type: 'object',
    $defs: expressionSchemaDefs,
    properties: {
      baseRevision: {
        type: 'integer',
        minimum: 1,
        description: 'Published revision to preview against',
      },
      operations: {
        type: 'array',
        items: catalogueOperationSchema,
        maxItems: 100,
        description: 'Unsaved operations applied, validated and rolled back around the evaluation',
      },
      typeId: { type: 'string', format: 'uuid', description: 'Type that owns the computed field' },
      fieldId: { type: 'string', format: 'uuid', description: 'Computed field id' },
      fieldKey: { type: 'string', description: 'Key of a computed field an operation creates' },
      itemId: { type: 'string', description: 'Item of that type to evaluate on' },
    },
    required: ['baseRevision', 'typeId', 'itemId'],
  },
  scope: INVENTORY_TYPES_MANAGE_SCOPE,
  handler: async (args) => {
    const baseRevision = requiredPositiveInteger(args, 'baseRevision');
    if (!baseRevision.ok) return toolError(baseRevision.error);
    const typeId = optStr(args, 'typeId');
    const itemId = optStr(args, 'itemId');
    if (typeId === undefined || itemId === undefined)
      return toolError('Missing or invalid required field: typeId and itemId');
    const field = previewField(args);
    if (field === null) return toolError('Give exactly one of fieldId or fieldKey');
    const operations = optionalOperations(args);
    if (operations === null) return toolError('Invalid field: operations');
    return mapDraftCallResult(
      await catalogueClient().manage.previewComputedFieldOnPublished({
        baseRevision: baseRevision.value,
        operations,
        typeId,
        field,
        itemId,
      }),
      INVENTORY_TYPES_MANAGE_SCOPE
    );
  },
};
