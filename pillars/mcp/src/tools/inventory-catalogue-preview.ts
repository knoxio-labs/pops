import { catalogueClient, mapDraftCallResult } from './inventory-catalogue-client.js';
import {
  expectedDraftVersionSchema,
  requiredObjectArray,
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

/** Shared MCP schema for mutating or non-mutating draft operation batches. */
export const catalogueDraftOperationInputSchema: ToolDef['inputSchema'] = {
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
      minItems: 1,
      maxItems: 100,
    },
  },
  required: ['revision', 'baseRevision', 'expectedDraftVersion', 'operations'],
};

/** Parses a complete draft operation batch from MCP arguments. */
export function catalogueDraftOperationInput(
  args: Record<string, unknown>
):
  | { readonly ok: true; readonly value: DraftOperationInput }
  | { readonly ok: false; error: string } {
  const revision = requiredPositiveInteger(args, 'revision');
  if (!revision.ok) return revision;
  const baseRevision = requiredPositiveInteger(args, 'baseRevision');
  if (!baseRevision.ok) return baseRevision;
  const expectedDraftVersion = requiredPositiveInteger(args, 'expectedDraftVersion');
  if (!expectedDraftVersion.ok) return expectedDraftVersion;
  const operations = requiredObjectArray(args, 'operations');
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

/** Non-mutating catalogue validation tool. */
export const cataloguePreviewDraft: ToolDef = {
  name: 'inventory.catalogue.previewDraft',
  description:
    'Read inventory.catalogue.readDraft first, then validate operations at its exact revisions and return compatibility diagnostics without changing the draft or its revision.draftVersion. Refused with catalogue_draft_conflict when expectedDraftVersion is stale.',
  inputSchema: catalogueDraftOperationInputSchema,
  handler: async (args) => {
    const input = catalogueDraftOperationInput(args);
    if (!input.ok) return toolError(input.error);
    return mapDraftCallResult(await catalogueClient().manage.previewDraft(input.value));
  },
};
