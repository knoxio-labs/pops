import { catalogueClient, mapDraftCallResult } from './inventory-catalogue-client.js';
import {
  compactCataloguePatchResult,
  compactCatalogueWriteResult,
} from './inventory-catalogue-compact.js';
import {
  cataloguePreviewComputedField,
  cataloguePreviewComputedFieldOnPublished,
} from './inventory-catalogue-computed-preview.js';
import {
  catalogueDraftTarget,
  catalogueInclude,
  catalogueIncludeSchema,
  expectedDraftVersionSchema,
  optionalObject,
  optionalPositiveInteger,
  requiredPositiveInteger,
} from './inventory-catalogue-input.js';
import {
  catalogueDraftOperationInput,
  cataloguePatchDraftInputSchema,
  cataloguePreviewDraft,
} from './inventory-catalogue-preview.js';
import { catalogueReadTools } from './inventory-catalogue-read.js';
import { catalogueMigrationSchema } from './inventory-catalogue-schema.js';
import { INVENTORY_TYPES_MANAGE_SCOPE } from './inventory-catalogue-scopes.js';
import { mapCallResult, nullStr, ok, optStr, toolError } from './utils.js';

import type { ToolDef } from './tool-def.js';

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
    'Read inventory.catalogue.get first, then create the one editable catalogue draft from that published revision. The draft starts at revision.draftVersion 1. Writes return compact revision metadata and changed IDs; pass include: "catalogue" for the full descriptor.',
  inputSchema: {
    type: 'object',
    properties: {
      baseRevision: { type: 'integer', minimum: 1, description: 'Current published revision' },
      include: catalogueIncludeSchema,
    },
    required: ['baseRevision'],
  },
  scope: INVENTORY_TYPES_MANAGE_SCOPE,
  handler: async (args) => {
    const baseRevision = requiredPositiveInteger(args, 'baseRevision');
    if (!baseRevision.ok) return toolError(baseRevision.error);
    const include = catalogueInclude(args);
    if (!include.ok) return toolError(include.error);
    const result = await catalogueClient().manage.createDraft({ baseRevision: baseRevision.value });
    if (include.value || result.kind !== 'ok') {
      return mapCallResult(result, INVENTORY_TYPES_MANAGE_SCOPE);
    }
    return ok(compactCatalogueWriteResult(result.value));
  },
};

const cataloguePatchDraft: ToolDef = {
  name: 'inventory.catalogue.patchDraft',
  description:
    'Read inventory.catalogue.readDraft first, then apply validated operations at its exact draft and base revisions, atomically, and preview publication compatibility. Refused with inventory.catalogue.draft_conflict when expectedDraftVersion is stale; the compact response carries the next revision.draftVersion and changed definition IDs. A subtype\'s items take its ancestors\' fields and capabilities. Create the parent, read its id from `changed`, then create the child in a second patch: ids are server-minted. Pass include: "catalogue" for the full response. Changing the parent of a published type is refused.',
  inputSchema: cataloguePatchDraftInputSchema,
  scope: INVENTORY_TYPES_MANAGE_SCOPE,
  handler: async (args) => {
    const input = catalogueDraftOperationInput(args);
    if (!input.ok) return toolError(input.error);
    const include = catalogueInclude(args);
    if (!include.ok) return toolError(include.error);
    const client = catalogueClient().manage;
    const before = include.value ? undefined : await client.readDraft();
    if (before !== undefined && before.kind !== 'ok') {
      return mapCallResult(before, INVENTORY_TYPES_MANAGE_SCOPE);
    }
    const result = await client.patchDraft(input.value);
    if (result.kind !== 'ok') return mapDraftCallResult(result, INVENTORY_TYPES_MANAGE_SCOPE);
    if (include.value || before === undefined) return ok(result.value);
    return ok(compactCataloguePatchResult(before.value, result.value));
  },
};

const cataloguePublishDraft: ToolDef = {
  name: 'inventory.catalogue.publishDraft',
  description:
    'Read inventory.catalogue.readDraft and previewDraft first, then publish that exact draft atomically, optionally with a named value migration. The response is a compact revision summary; pass include: "catalogue" for the full descriptor.',
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
      include: catalogueIncludeSchema,
    },
    required: ['revision', 'baseRevision', 'expectedDraftVersion'],
  },
  scope: INVENTORY_TYPES_MANAGE_SCOPE,
  handler: async (args) => {
    const target = catalogueDraftTarget(args);
    if (!target.ok) return toolError(target.error);
    const include = catalogueInclude(args);
    if (!include.ok) return toolError(include.error);
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
      INVENTORY_TYPES_MANAGE_SCOPE,
      include.value ? undefined : compactCatalogueWriteResult
    );
  },
};

const catalogueAbandonDraft: ToolDef = {
  name: 'inventory.catalogue.abandonDraft',
  description:
    'Read inventory.catalogue.readDraft first, then abandon that exact draft while retaining the attempt in audit history. The response is a compact revision summary; pass include: "catalogue" for the full descriptor.',
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
      include: catalogueIncludeSchema,
    },
    required: ['revision', 'baseRevision', 'expectedDraftVersion'],
  },
  scope: INVENTORY_TYPES_MANAGE_SCOPE,
  handler: async (args) => {
    const target = catalogueDraftTarget(args);
    if (!target.ok) return toolError(target.error);
    const include = catalogueInclude(args);
    if (!include.ok) return toolError(include.error);
    return mapDraftCallResult(
      await catalogueClient().manage.abandonDraft(target.value),
      INVENTORY_TYPES_MANAGE_SCOPE,
      include.value ? undefined : compactCatalogueWriteResult
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
