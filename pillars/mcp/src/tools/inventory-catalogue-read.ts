import { catalogueClient } from './inventory-catalogue-client.js';
import { optionalPositiveInteger } from './inventory-catalogue-input.js';
import { mapCallResult, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

const catalogueGet: ToolDef = {
  name: 'inventory.catalogue.get',
  description: 'Read the current published inventory type catalogue or an exact revision.',
  inputSchema: {
    type: 'object',
    properties: {
      revision: {
        type: 'integer',
        minimum: 1,
        description: 'Published revision; omit for the current one',
      },
    },
  },
  handler: async (args) => {
    const revision = optionalPositiveInteger(args, 'revision');
    if (!revision.ok) return toolError(revision.error);
    return mapCallResult(await catalogueClient().read.catalogue({ revision: revision.value }));
  },
};

const catalogueAudit: ToolDef = {
  name: 'inventory.catalogue.audit',
  description: 'Read inventory catalogue publication and abandonment history, newest first.',
  inputSchema: {
    type: 'object',
    properties: {
      before: { type: 'integer', minimum: 1, description: 'Return events before this event ID' },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 500,
        description: 'Maximum events to return (default 250, max 500)',
      },
    },
  },
  handler: async (args) => {
    const before = optionalPositiveInteger(args, 'before');
    if (!before.ok) return toolError(before.error);
    const limit = optionalPositiveInteger(args, 'limit', 500);
    if (!limit.ok) return toolError(limit.error);
    return mapCallResult(
      await catalogueClient().read.audit({ before: before.value, limit: limit.value })
    );
  },
};

/** Read-only tools for immutable catalogue snapshots and audit history. */
export const catalogueReadTools: readonly ToolDef[] = [catalogueGet, catalogueAudit];
