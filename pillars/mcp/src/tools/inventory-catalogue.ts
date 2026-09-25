import { catalogueClient, mapDraftCallResult } from './inventory-catalogue-client.js';
import {
  cataloguePreviewComputedField,
  cataloguePreviewComputedFieldOnPublished,
} from './inventory-catalogue-computed-preview.js';
import {
  expectedDraftVersionSchema,
  optionalObject,
  optionalPositiveInteger,
  requiredPositiveInteger,
} from './inventory-catalogue-input.js';
import {
  catalogueDraftOperationInput,
  catalogueDraftOperationInputSchema,
  cataloguePreviewDraft,
} from './inventory-catalogue-preview.js';
import { catalogueReadTools } from './inventory-catalogue-read.js';
import { catalogueMigrationSchema } from './inventory-catalogue-schema.js';
import { INVENTORY_TYPES_MANAGE_SCOPE } from './inventory-catalogue-scopes.js';
import { mapCallResult, nullStr, optStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

function draftTarget(args: Record<string, unknown>):
  | {
      readonly ok: true;
      readonly value: { revision: number; baseRevision: number; expectedDraftVersion: number };
    }
  | { readonly ok: false; readonly error: string } {
  const revision = requiredPositiveInteger(args, 'revision');
  if (!revision.ok) return revision;
  const baseRevision = requiredPositiveInteger(args, 'baseRevision');
  if (!baseRevision.ok) return baseRevision;
  const expectedDraftVersion = requiredPositiveInteger(args, 'expectedDraftVersion');
  if (!expectedDraftVersion.ok) return expectedDraftVersion;
  return {
    ok: true,
    value: {
      revision: revision.value,
      baseRevision: baseRevision.value,
      expectedDraftVersion: expectedDraftVersion.value,
    },
  };
}

const catalogueReadDraft: ToolDef = {
  name: 'inventory.catalogue.readDraft',
  description:
    'Read the current editable catalogue draft so an interrupted edit can resume. Its revision.draftVersion is the expectedDraftVersion for the next patch, preview, publish or abandon.',
  inputSchema: { type: 'object', properties: {} },
  scope: INVENTORY_TYPES_MANAGE_SCOPE,
  handler: async () =>
    mapCallResult(await catalogueClient().manage.readDraft(), INVENTORY_TYPES_MANAGE_SCOPE),
};

const catalogueCreateDraft: ToolDef = {
  name: 'inventory.catalogue.createDraft',
  description:
    'Read inventory.catalogue.get first, then create the one editable catalogue draft from that published revision. The draft starts at revision.draftVersion 1.',
  inputSchema: {
    type: 'object',
    properties: {
      baseRevision: { type: 'integer', minimum: 1, description: 'Current published revision' },
    },
    required: ['baseRevision'],
  },
  scope: INVENTORY_TYPES_MANAGE_SCOPE,
  handler: async (args) => {
    const baseRevision = requiredPositiveInteger(args, 'baseRevision');
    if (!baseRevision.ok) return toolError(baseRevision.error);
    return mapCallResult(
      await catalogueClient().manage.createDraft({ baseRevision: baseRevision.value }),
      INVENTORY_TYPES_MANAGE_SCOPE
    );
  },
};

const cataloguePatchDraft: ToolDef = {
  name: 'inventory.catalogue.patchDraft',
  description:
    'Read inventory.catalogue.readDraft first, then apply validated operations at its exact draft and base revisions, atomically, and preview publication compatibility. Refused with catalogue_draft_conflict when expectedDraftVersion is stale; the returned draft carries the next revision.draftVersion.',
  inputSchema: catalogueDraftOperationInputSchema,
  scope: INVENTORY_TYPES_MANAGE_SCOPE,
  handler: async (args) => {
    const input = catalogueDraftOperationInput(args);
    if (!input.ok) return toolError(input.error);
    return mapDraftCallResult(
      await catalogueClient().manage.patchDraft(input.value),
      INVENTORY_TYPES_MANAGE_SCOPE
    );
  },
};

const cataloguePublishDraft: ToolDef = {
  name: 'inventory.catalogue.publishDraft',
  description:
    'Read inventory.catalogue.readDraft and previewDraft first, then publish that exact draft atomically, optionally with a named value migration.',
  inputSchema: {
    type: 'object',
    properties: {
      revision: { type: 'integer', minimum: 1, description: 'Draft revision' },
      baseRevision: {
        type: 'integer',
        minimum: 1,
        description: 'Published revision the draft is based on',
      },
      expectedDraftVersion: expectedDraftVersionSchema,
      note: { type: ['string', 'null'], maxLength: 2_000, description: 'Publication note' },
      minimumProtocol: {
        type: 'integer',
        minimum: 1,
        description: 'Minimum client protocol for this revision',
      },
      migrationName: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
        description: 'Registered server migration name',
      },
      migration: catalogueMigrationSchema,
    },
    required: ['revision', 'baseRevision', 'expectedDraftVersion'],
  },
  scope: INVENTORY_TYPES_MANAGE_SCOPE,
  handler: async (args) => {
    const target = draftTarget(args);
    if (!target.ok) return toolError(target.error);
    const migration = optionalObject(args, 'migration');
    if (!migration.ok) return toolError(migration.error);
    const note = nullStr(args, 'note');
    const minimumProtocol = optionalPositiveInteger(args, 'minimumProtocol');
    if (!minimumProtocol.ok) return toolError(minimumProtocol.error);
    const migrationName = optStr(args, 'migrationName');
    return mapDraftCallResult(
      await catalogueClient().manage.publishDraft({
        ...target.value,
        ...(note !== undefined ? { note } : {}),
        ...(minimumProtocol.value !== undefined ? { minimumProtocol: minimumProtocol.value } : {}),
        ...(migrationName !== undefined ? { migrationName } : {}),
        ...(migration.value !== undefined ? { migration: migration.value } : {}),
      }),
      INVENTORY_TYPES_MANAGE_SCOPE
    );
  },
};

const catalogueAbandonDraft: ToolDef = {
  name: 'inventory.catalogue.abandonDraft',
  description:
    'Read inventory.catalogue.readDraft first, then abandon that exact draft while retaining the attempt in audit history.',
  inputSchema: {
    type: 'object',
    properties: {
      revision: { type: 'integer', minimum: 1, description: 'Draft revision' },
      baseRevision: {
        type: 'integer',
        minimum: 1,
        description: 'Published revision the draft is based on',
      },
      expectedDraftVersion: expectedDraftVersionSchema,
    },
    required: ['revision', 'baseRevision', 'expectedDraftVersion'],
  },
  scope: INVENTORY_TYPES_MANAGE_SCOPE,
  handler: async (args) => {
    const target = draftTarget(args);
    if (!target.ok) return toolError(target.error);
    return mapDraftCallResult(
      await catalogueClient().manage.abandonDraft(target.value),
      INVENTORY_TYPES_MANAGE_SCOPE
    );
  },
};

export const catalogueTools: readonly ToolDef[] = [
  ...catalogueReadTools,
  catalogueReadDraft,
  catalogueCreateDraft,
  cataloguePatchDraft,
  cataloguePreviewDraft,
  cataloguePreviewComputedField,
  cataloguePreviewComputedFieldOnPublished,
  cataloguePublishDraft,
  catalogueAbandonDraft,
];
