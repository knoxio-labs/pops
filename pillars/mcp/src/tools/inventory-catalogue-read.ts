import { catalogueClient } from './inventory-catalogue-client.js';
import { mapCallResult, optNum } from './utils.js';

import type { ToolDef } from './tool-def.js';

const catalogueGet: ToolDef = {
  name: 'inventory.catalogue.get',
  description: 'Read the current published inventory type catalogue or an exact revision.',
  inputSchema: {
    type: 'object',
    properties: {
      revision: { type: 'number', description: 'Published revision; omit for the current one' },
    },
  },
  handler: async (args) =>
    mapCallResult(await catalogueClient().read.catalogue({ revision: optNum(args, 'revision') })),
};

const catalogueAudit: ToolDef = {
  name: 'inventory.catalogue.audit',
  description: 'Read inventory catalogue publication and abandonment history, newest first.',
  inputSchema: {
    type: 'object',
    properties: {
      before: { type: 'number', description: 'Return events before this event ID' },
      limit: { type: 'number', description: 'Maximum events to return (default 250, max 500)' },
    },
  },
  handler: async (args) =>
    mapCallResult(
      await catalogueClient().read.audit({
        before: optNum(args, 'before'),
        limit: optNum(args, 'limit'),
      })
    ),
};

/** Read-only tools for immutable catalogue snapshots and audit history. */
export const catalogueReadTools: readonly ToolDef[] = [catalogueGet, catalogueAudit];
