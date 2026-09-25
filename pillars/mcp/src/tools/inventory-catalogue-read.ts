/**
 * Every catalogue and item tool in this MCP surface identifies a type by its
 * stable `typeId` (the type's immutable id, not its human-readable `key`).
 * There is no separate `typeKey` argument anywhere in the surface.
 */
import { catalogueClient } from './inventory-catalogue-client.js';
import { optionalPositiveInteger } from './inventory-catalogue-input.js';
import { INVENTORY_TYPES_READ_SCOPE } from './inventory-catalogue-scopes.js';
import { mapCallResult, reqStr, toolError } from './utils.js';

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
  scope: INVENTORY_TYPES_READ_SCOPE,
  handler: async (args) => {
    const revision = optionalPositiveInteger(args, 'revision');
    if (!revision.ok) return toolError(revision.error);
    return mapCallResult(
      await catalogueClient().read.catalogue({ revision: revision.value }),
      INVENTORY_TYPES_READ_SCOPE
    );
  },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const catalogueGetType: ToolDef = {
  name: 'inventory.catalogue.getType',
  description:
    'Read one inventory type definition, by its stable id, exactly as the current published catalogue revision or an exact earlier one defined it. Older revisions keep the label, fields and archive state they had then. Answers catalogue_type_unknown when that revision does not define the type, and catalogue_revision_unknown when no such published revision exists.',
  inputSchema: {
    type: 'object',
    properties: {
      typeId: { type: 'string', format: 'uuid', description: 'Stable type id' },
      revision: {
        type: 'integer',
        minimum: 1,
        description: 'Published revision; omit for the current one',
      },
    },
    required: ['typeId'],
  },
  scope: INVENTORY_TYPES_READ_SCOPE,
  handler: async (args) => {
    const typeId = reqStr(args, 'typeId');
    if (typeId === null || !UUID_PATTERN.test(typeId)) {
      return toolError('Missing or invalid required field: typeId');
    }
    const revision = optionalPositiveInteger(args, 'revision');
    if (!revision.ok) return toolError(revision.error);
    return mapCallResult(
      await catalogueClient().read.type({
        typeId,
        ...(revision.value !== undefined ? { revision: revision.value } : {}),
      }),
      INVENTORY_TYPES_READ_SCOPE
    );
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
  scope: INVENTORY_TYPES_READ_SCOPE,
  handler: async (args) => {
    const before = optionalPositiveInteger(args, 'before');
    if (!before.ok) return toolError(before.error);
    const limit = optionalPositiveInteger(args, 'limit', 500);
    if (!limit.ok) return toolError(limit.error);
    return mapCallResult(
      await catalogueClient().read.audit({ before: before.value, limit: limit.value }),
      INVENTORY_TYPES_READ_SCOPE
    );
  },
};

/** Read-only tools for immutable catalogue snapshots and audit history. */
export const catalogueReadTools: readonly ToolDef[] = [
  catalogueGet,
  catalogueGetType,
  catalogueAudit,
];
