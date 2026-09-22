import { getPillar } from '../pillar-client.js';
import {
  optionalObject,
  requiredObjectArray,
  requiredPositiveInteger,
} from './inventory-catalogue-input.js';
import {
  catalogueMigrationSchema,
  catalogueOperationSchema,
} from './inventory-catalogue-schema.js';
import { mapCallResult, nullStr, optNum, optStr, toolError } from './utils.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

import type { ToolDef } from './tool-def.js';

type CatalogueOperation = Record<string, unknown>;
type CatalogueMigration = Record<string, unknown>;

type CatalogueShape = {
  types: {
    read: {
      catalogue: (input: { revision?: number }) => unknown;
      audit: (input: { before?: number; limit?: number }) => unknown;
    };
    manage: {
      createDraft: (input: { baseRevision: number }) => unknown;
      patchDraft: (input: {
        revision: number;
        baseRevision: number;
        operations: CatalogueOperation[];
      }) => unknown;
      publishDraft: (input: {
        revision: number;
        baseRevision: number;
        note?: string | null;
        minimumProtocol?: number;
        migrationName?: string;
        migration?: CatalogueMigration;
      }) => unknown;
      abandonDraft: (input: { revision: number; baseRevision: number }) => unknown;
    };
  };
};

function catalogue(): PillarHandle<CatalogueShape>['types'] {
  return getPillar<CatalogueShape>('inventory').types;
}

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
    mapCallResult(await catalogue().read.catalogue({ revision: optNum(args, 'revision') })),
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
      await catalogue().read.audit({
        before: optNum(args, 'before'),
        limit: optNum(args, 'limit'),
      })
    ),
};

const catalogueCreateDraft: ToolDef = {
  name: 'inventory.catalogue.createDraft',
  description: 'Create the one editable catalogue draft from the current published revision.',
  inputSchema: {
    type: 'object',
    properties: { baseRevision: { type: 'number', description: 'Current published revision' } },
    required: ['baseRevision'],
  },
  handler: async (args) => {
    const baseRevision = requiredPositiveInteger(args, 'baseRevision');
    if (!baseRevision.ok) return toolError(baseRevision.error);
    return mapCallResult(
      await catalogue().manage.createDraft({ baseRevision: baseRevision.value })
    );
  },
};

const cataloguePatchDraft: ToolDef = {
  name: 'inventory.catalogue.patchDraft',
  description:
    'Apply validated operations to a catalogue draft and preview publication compatibility.',
  inputSchema: {
    type: 'object',
    properties: {
      revision: { type: 'number', description: 'Draft revision' },
      baseRevision: { type: 'number', description: 'Published revision the draft is based on' },
      operations: {
        type: 'array',
        items: catalogueOperationSchema,
        minItems: 1,
        maxItems: 100,
      },
    },
    required: ['revision', 'baseRevision', 'operations'],
  },
  handler: async (args) => {
    const revision = requiredPositiveInteger(args, 'revision');
    if (!revision.ok) return toolError(revision.error);
    const baseRevision = requiredPositiveInteger(args, 'baseRevision');
    if (!baseRevision.ok) return toolError(baseRevision.error);
    const operations = requiredObjectArray(args, 'operations');
    if (!operations.ok) return toolError(operations.error);
    return mapCallResult(
      await catalogue().manage.patchDraft({
        revision: revision.value,
        baseRevision: baseRevision.value,
        operations: operations.value,
      })
    );
  },
};

const cataloguePublishDraft: ToolDef = {
  name: 'inventory.catalogue.publishDraft',
  description:
    'Publish a validated catalogue draft atomically, optionally with a named value migration.',
  inputSchema: {
    type: 'object',
    properties: {
      revision: { type: 'number', description: 'Draft revision' },
      baseRevision: { type: 'number', description: 'Published revision the draft is based on' },
      note: { type: ['string', 'null'], description: 'Publication note' },
      minimumProtocol: { type: 'number', description: 'Minimum client protocol for this revision' },
      migrationName: { type: 'string', description: 'Registered server migration name' },
      migration: catalogueMigrationSchema,
    },
    required: ['revision', 'baseRevision'],
  },
  handler: async (args) => {
    const revision = requiredPositiveInteger(args, 'revision');
    if (!revision.ok) return toolError(revision.error);
    const baseRevision = requiredPositiveInteger(args, 'baseRevision');
    if (!baseRevision.ok) return toolError(baseRevision.error);
    const migration = optionalObject(args, 'migration');
    if (!migration.ok) return toolError(migration.error);
    const note = nullStr(args, 'note');
    const minimumProtocol = optNum(args, 'minimumProtocol');
    const migrationName = optStr(args, 'migrationName');
    return mapCallResult(
      await catalogue().manage.publishDraft({
        revision: revision.value,
        baseRevision: baseRevision.value,
        ...(note !== undefined ? { note } : {}),
        ...(minimumProtocol !== undefined ? { minimumProtocol } : {}),
        ...(migrationName !== undefined ? { migrationName } : {}),
        ...(migration.value !== undefined ? { migration: migration.value } : {}),
      })
    );
  },
};

const catalogueAbandonDraft: ToolDef = {
  name: 'inventory.catalogue.abandonDraft',
  description: 'Abandon a catalogue draft while retaining the attempt in audit history.',
  inputSchema: {
    type: 'object',
    properties: {
      revision: { type: 'number', description: 'Draft revision' },
      baseRevision: { type: 'number', description: 'Published revision the draft is based on' },
    },
    required: ['revision', 'baseRevision'],
  },
  handler: async (args) => {
    const revision = requiredPositiveInteger(args, 'revision');
    if (!revision.ok) return toolError(revision.error);
    const baseRevision = requiredPositiveInteger(args, 'baseRevision');
    if (!baseRevision.ok) return toolError(baseRevision.error);
    return mapCallResult(
      await catalogue().manage.abandonDraft({
        revision: revision.value,
        baseRevision: baseRevision.value,
      })
    );
  },
};

export const catalogueTools: readonly ToolDef[] = [
  catalogueGet,
  catalogueAudit,
  catalogueCreateDraft,
  cataloguePatchDraft,
  cataloguePublishDraft,
  catalogueAbandonDraft,
];
