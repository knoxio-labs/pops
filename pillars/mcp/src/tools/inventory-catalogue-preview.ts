import { catalogueClient } from './inventory-catalogue-client.js';
import { requiredObjectArray, requiredPositiveInteger } from './inventory-catalogue-input.js';
import { catalogueOperationSchema } from './inventory-catalogue-schema.js';
import { mapCallResult, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

type DraftOperationInput = {
  readonly revision: number;
  readonly baseRevision: number;
  readonly operations: Record<string, unknown>[];
};

/** Shared MCP schema for mutating or non-mutating draft operation batches. */
export const catalogueDraftOperationInputSchema: ToolDef['inputSchema'] = {
  type: 'object',
  properties: {
    revision: { type: 'integer', minimum: 1, description: 'Draft revision' },
    baseRevision: {
      type: 'integer',
      minimum: 1,
      description: 'Published revision the draft is based on',
    },
    operations: {
      type: 'array',
      items: catalogueOperationSchema,
      minItems: 1,
      maxItems: 100,
    },
  },
  required: ['revision', 'baseRevision', 'operations'],
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
  const operations = requiredObjectArray(args, 'operations');
  if (!operations.ok) return operations;
  return {
    ok: true,
    value: {
      revision: revision.value,
      baseRevision: baseRevision.value,
      operations: operations.value,
    },
  };
}

/** Non-mutating catalogue validation tool. */
export const cataloguePreviewDraft: ToolDef = {
  name: 'inventory.catalogue.previewDraft',
  description:
    'Validate catalogue operations and return revision-bound compatibility diagnostics without changing the draft.',
  inputSchema: catalogueDraftOperationInputSchema,
  handler: async (args) => {
    const input = catalogueDraftOperationInput(args);
    if (!input.ok) return toolError(input.error);
    return mapCallResult(await catalogueClient().manage.previewDraft(input.value));
  },
};
