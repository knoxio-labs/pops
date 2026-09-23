import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { CatalogueMigrationSchema } from './rest-catalogue-migration-schemas.js';
import { inventoryCatalogueReadContract } from './rest-catalogue-read.js';
import {
  CatalogueCompatibilitySchema,
  CatalogueDraftOperationSchema,
  CatalogueErrorBodySchema,
  CataloguePreviewErrorBodySchema,
  ExpectedDraftVersionSchema,
  ProtocolRolloutStateSchema,
  TypeCatalogueDescriptorSchema,
} from './rest-catalogue-schemas.js';

const c = initContract();

/** Owner-facing immutable reads and draft/publication commands. */
export const inventoryCatalogueContract = c.router({
  read: inventoryCatalogueReadContract,
  manage: {
    readProtocolRollout: {
      method: 'GET',
      path: '/type-catalogue/protocol-rollout',
      responses: {
        200: ProtocolRolloutStateSchema,
        401: CatalogueErrorBodySchema,
      },
      summary: 'Read the persistent protocol minimum governing catalogue publication and sync',
    },
    activateProtocolRollout: {
      method: 'POST',
      path: '/type-catalogue/protocol-rollout',
      body: z.object({
        expectedMinimumProtocol: z.number().int().positive(),
        minimumProtocol: z.number().int().positive(),
      }),
      responses: {
        200: ProtocolRolloutStateSchema,
        400: CatalogueErrorBodySchema,
        401: CatalogueErrorBodySchema,
        409: CatalogueErrorBodySchema,
      },
      summary: 'Atomically raise the inventory sync protocol minimum before catalogue publication',
    },
    readDraft: {
      method: 'GET',
      path: '/type-catalogue/drafts/current',
      responses: {
        200: TypeCatalogueDescriptorSchema,
        401: CatalogueErrorBodySchema,
        404: CatalogueErrorBodySchema,
      },
      summary: 'Read the current editable catalogue draft',
    },
    createDraft: {
      method: 'POST',
      path: '/type-catalogue/drafts',
      body: z.object({ baseRevision: z.number().int().positive() }),
      responses: {
        201: TypeCatalogueDescriptorSchema,
        400: CatalogueErrorBodySchema,
        401: CatalogueErrorBodySchema,
        409: CatalogueErrorBodySchema,
      },
      summary: 'Create the one editable draft from the current published catalogue',
    },
    patchDraft: {
      method: 'PATCH',
      path: '/type-catalogue/drafts/:revision',
      pathParams: z.object({ revision: z.coerce.number().int().positive() }),
      body: z.object({
        baseRevision: z.number().int().positive(),
        expectedDraftVersion: ExpectedDraftVersionSchema,
        operations: z.array(CatalogueDraftOperationSchema).min(1).max(100),
      }),
      responses: {
        200: z.object({
          draft: TypeCatalogueDescriptorSchema,
          compatibility: CatalogueCompatibilitySchema,
        }),
        400: CataloguePreviewErrorBodySchema,
        401: CatalogueErrorBodySchema,
        404: CatalogueErrorBodySchema,
        409: CataloguePreviewErrorBodySchema,
      },
      summary: 'Apply validated operations to a draft and preview publication compatibility',
    },
    previewDraft: {
      method: 'POST',
      path: '/type-catalogue/drafts/:revision/preview',
      pathParams: z.object({ revision: z.coerce.number().int().positive() }),
      body: z.object({
        baseRevision: z.number().int().positive(),
        expectedDraftVersion: ExpectedDraftVersionSchema,
        operations: z.array(CatalogueDraftOperationSchema).min(1).max(100),
      }),
      responses: {
        200: z.object({
          baseRevision: z.number().int().positive(),
          draftRevision: z.number().int().positive(),
          compatibility: CatalogueCompatibilitySchema,
        }),
        400: CataloguePreviewErrorBodySchema,
        401: CatalogueErrorBodySchema,
        404: CatalogueErrorBodySchema,
        409: CataloguePreviewErrorBodySchema,
      },
      summary: 'Validate draft operations and preview compatibility without mutating the draft',
    },
    publishDraft: {
      method: 'POST',
      path: '/type-catalogue/drafts/:revision/publish',
      pathParams: z.object({ revision: z.coerce.number().int().positive() }),
      body: z.object({
        baseRevision: z.number().int().positive(),
        expectedDraftVersion: ExpectedDraftVersionSchema,
        note: z.string().trim().max(2_000).nullable().optional(),
        minimumProtocol: z.number().int().positive().optional(),
        migrationName: z.string().trim().min(1).max(200).optional(),
        migration: CatalogueMigrationSchema.optional(),
      }),
      responses: {
        200: TypeCatalogueDescriptorSchema,
        400: CatalogueErrorBodySchema,
        401: CatalogueErrorBodySchema,
        404: CatalogueErrorBodySchema,
        409: CatalogueErrorBodySchema,
      },
      summary: 'Publish a validated draft atomically, including any named value migration',
    },
    abandonDraft: {
      method: 'POST',
      path: '/type-catalogue/drafts/:revision/abandon',
      pathParams: z.object({ revision: z.coerce.number().int().positive() }),
      body: z.object({
        baseRevision: z.number().int().positive(),
        expectedDraftVersion: ExpectedDraftVersionSchema,
      }),
      responses: {
        200: TypeCatalogueDescriptorSchema,
        401: CatalogueErrorBodySchema,
        404: CatalogueErrorBodySchema,
        409: CatalogueErrorBodySchema,
      },
      summary: 'Abandon a draft without deleting its attempt from history',
    },
  },
});
