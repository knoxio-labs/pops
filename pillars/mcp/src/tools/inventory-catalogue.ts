import { catalogueClient } from './inventory-catalogue-client.js';
import {
  optionalObject,
  optionalPositiveInteger,
  requiredObjectArray,
  requiredPositiveInteger,
} from './inventory-catalogue-input.js';
import { catalogueReadTools } from './inventory-catalogue-read.js';
import {
  catalogueMigrationSchema,
  catalogueOperationSchema,
} from './inventory-catalogue-schema.js';
import { mapCallResult, nullStr, optStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

const catalogueReadDraft: ToolDef = {
  name: 'inventory.catalogue.readDraft',
  description: 'Read the current editable catalogue draft so an interrupted edit can resume.',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => mapCallResult(await catalogueClient().manage.readDraft()),
};

const catalogueCreateDraft: ToolDef = {
  name: 'inventory.catalogue.createDraft',
  description: 'Create the one editable catalogue draft from the current published revision.',
  inputSchema: {
    type: 'object',
    properties: {
      baseRevision: { type: 'integer', minimum: 1, description: 'Current published revision' },
    },
    required: ['baseRevision'],
  },
  handler: async (args) => {
    const baseRevision = requiredPositiveInteger(args, 'baseRevision');
    if (!baseRevision.ok) return toolError(baseRevision.error);
    return mapCallResult(
      await catalogueClient().manage.createDraft({ baseRevision: baseRevision.value })
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
  },
  handler: async (args) => {
    const revision = requiredPositiveInteger(args, 'revision');
    if (!revision.ok) return toolError(revision.error);
    const baseRevision = requiredPositiveInteger(args, 'baseRevision');
    if (!baseRevision.ok) return toolError(baseRevision.error);
    const operations = requiredObjectArray(args, 'operations');
    if (!operations.ok) return toolError(operations.error);
    return mapCallResult(
      await catalogueClient().manage.patchDraft({
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
      revision: { type: 'integer', minimum: 1, description: 'Draft revision' },
      baseRevision: {
        type: 'integer',
        minimum: 1,
        description: 'Published revision the draft is based on',
      },
      note: { type: ['string', 'null'], description: 'Publication note' },
      minimumProtocol: {
        type: 'integer',
        minimum: 1,
        description: 'Minimum client protocol for this revision',
      },
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
    const minimumProtocol = optionalPositiveInteger(args, 'minimumProtocol');
    if (!minimumProtocol.ok) return toolError(minimumProtocol.error);
    const migrationName = optStr(args, 'migrationName');
    return mapCallResult(
      await catalogueClient().manage.publishDraft({
        revision: revision.value,
        baseRevision: baseRevision.value,
        ...(note !== undefined ? { note } : {}),
        ...(minimumProtocol.value !== undefined ? { minimumProtocol: minimumProtocol.value } : {}),
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
      revision: { type: 'integer', minimum: 1, description: 'Draft revision' },
      baseRevision: {
        type: 'integer',
        minimum: 1,
        description: 'Published revision the draft is based on',
      },
    },
    required: ['revision', 'baseRevision'],
  },
  handler: async (args) => {
    const revision = requiredPositiveInteger(args, 'revision');
    if (!revision.ok) return toolError(revision.error);
    const baseRevision = requiredPositiveInteger(args, 'baseRevision');
    if (!baseRevision.ok) return toolError(baseRevision.error);
    return mapCallResult(
      await catalogueClient().manage.abandonDraft({
        revision: revision.value,
        baseRevision: baseRevision.value,
      })
    );
  },
};

export const catalogueTools: readonly ToolDef[] = [
  ...catalogueReadTools,
  catalogueReadDraft,
  catalogueCreateDraft,
  cataloguePatchDraft,
  cataloguePublishDraft,
  catalogueAbandonDraft,
];
