import { catalogueClient, mapDraftCallResult } from './inventory-catalogue-client.js';
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
  handler: async () => mapCallResult(await catalogueClient().manage.readDraft()),
};

const catalogueCreateDraft: ToolDef = {
  name: 'inventory.catalogue.createDraft',
  description:
    'Create the one editable catalogue draft from the current published revision. The draft starts at revision.draftVersion 1.',
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
    'Apply validated operations to a catalogue draft atomically and preview publication compatibility. Refused with catalogue_draft_conflict when expectedDraftVersion is stale; the returned draft carries the next revision.draftVersion.',
  inputSchema: catalogueDraftOperationInputSchema,
  handler: async (args) => {
    const input = catalogueDraftOperationInput(args);
    if (!input.ok) return toolError(input.error);
    return mapDraftCallResult(await catalogueClient().manage.patchDraft(input.value));
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
      expectedDraftVersion: expectedDraftVersionSchema,
      note: { type: ['string', 'null'], description: 'Publication note' },
      minimumProtocol: {
        type: 'integer',
        minimum: 1,
        description: 'Minimum client protocol for this revision',
      },
      migrationName: { type: 'string', description: 'Registered server migration name' },
      migration: catalogueMigrationSchema,
    },
    required: ['revision', 'baseRevision', 'expectedDraftVersion'],
  },
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
      expectedDraftVersion: expectedDraftVersionSchema,
    },
    required: ['revision', 'baseRevision', 'expectedDraftVersion'],
  },
  handler: async (args) => {
    const target = draftTarget(args);
    if (!target.ok) return toolError(target.error);
    return mapDraftCallResult(await catalogueClient().manage.abandonDraft(target.value));
  },
};

export const catalogueTools: readonly ToolDef[] = [
  ...catalogueReadTools,
  catalogueReadDraft,
  catalogueCreateDraft,
  cataloguePatchDraft,
  cataloguePreviewDraft,
  cataloguePublishDraft,
  catalogueAbandonDraft,
];
