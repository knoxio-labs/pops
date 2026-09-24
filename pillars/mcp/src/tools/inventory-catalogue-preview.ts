import { catalogueClient, mapDraftCallResult } from './inventory-catalogue-client.js';
import {
  expectedDraftVersionSchema,
  objectArray,
  requiredPositiveInteger,
} from './inventory-catalogue-input.js';
import { catalogueOperationSchema, expressionSchemaDefs } from './inventory-catalogue-schema.js';
import { toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

type DraftOperationInput = {
  readonly revision: number;
  readonly baseRevision: number;
  readonly expectedDraftVersion: number;
  readonly operations: Record<string, unknown>[];
};

function draftOperationInputSchema(minItems: number): ToolDef['inputSchema'] {
  return {
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
        minItems,
        maxItems: 100,
      },
    },
    required: ['revision', 'baseRevision', 'expectedDraftVersion', 'operations'],
  };
}

/** Shared MCP schema for mutating draft operation batches: at least one operation. */
export const catalogueDraftOperationInputSchema: ToolDef['inputSchema'] =
  draftOperationInputSchema(1);

/**
 * MCP schema for non-mutating preview batches: an empty `operations` array is
 * valid and re-checks the current draft as it stands, since item data (live
 * counts, held overrides) can change compatibility without any draft edit.
 */
export const cataloguePreviewInputSchema: ToolDef['inputSchema'] = draftOperationInputSchema(0);

function parseDraftOperationInput(
  args: Record<string, unknown>,
  minOperations: number
):
  | { readonly ok: true; readonly value: DraftOperationInput }
  | { readonly ok: false; error: string } {
  const revision = requiredPositiveInteger(args, 'revision');
  if (!revision.ok) return revision;
  const baseRevision = requiredPositiveInteger(args, 'baseRevision');
  if (!baseRevision.ok) return baseRevision;
  const expectedDraftVersion = requiredPositiveInteger(args, 'expectedDraftVersion');
  if (!expectedDraftVersion.ok) return expectedDraftVersion;
  const operations = objectArray(args, 'operations', minOperations);
  if (!operations.ok) return operations;
  return {
    ok: true,
    value: {
      revision: revision.value,
      baseRevision: baseRevision.value,
      expectedDraftVersion: expectedDraftVersion.value,
      operations: operations.value,
    },
  };
}

/** Parses a complete draft operation batch (at least one operation) from MCP arguments. */
export function catalogueDraftOperationInput(
  args: Record<string, unknown>
):
  | { readonly ok: true; readonly value: DraftOperationInput }
  | { readonly ok: false; error: string } {
  return parseDraftOperationInput(args, 1);
}

/** Parses a preview operation batch, whose `operations` may be empty, from MCP arguments. */
export function cataloguePreviewInput(
  args: Record<string, unknown>
):
  | { readonly ok: true; readonly value: DraftOperationInput }
  | { readonly ok: false; error: string } {
  return parseDraftOperationInput(args, 0);
}

/** Non-mutating catalogue validation tool. */
export const cataloguePreviewDraft: ToolDef = {
  name: 'inventory.catalogue.previewDraft',
  description:
    'Read inventory.catalogue.readDraft first, then validate operations at its exact revisions and return compatibility diagnostics without changing the draft or its revision.draftVersion. An empty operations array re-checks the current draft as it stands (useful after item data changed). Refused with catalogue_draft_conflict when expectedDraftVersion is stale.',
  inputSchema: cataloguePreviewInputSchema,
  handler: async (args) => {
    const input = cataloguePreviewInput(args);
    if (!input.ok) return toolError(input.error);
    return mapDraftCallResult(await catalogueClient().manage.previewDraft(input.value));
  },
};
