import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { CatalogueAuditEventSchema } from './rest-catalogue-audit-schema.js';
import { CatalogueMigrationSchema } from './rest-catalogue-migration-schemas.js';
import {
  CatalogueCompatibilitySchema,
  CatalogueDraftOperationSchema,
  CatalogueErrorBodySchema,
  CatalogueItemValidationBodySchema,
  CatalogueItemValidationResultSchema,
  CataloguePreviewErrorBodySchema,
  CatalogueReadHeaders,
  ExpectedDraftVersionSchema,
  TypeCatalogueDescriptorSchema,
} from './rest-catalogue-schemas.js';

const c = initContract();
const PageLimit = z.coerce.number().int().min(1).max(500).default(250);

/** Owner-facing immutable reads and draft/publication commands. */
export const inventoryCatalogueContract = c.router({
  read: {
    catalogue: {
      method: 'GET',
      path: '/type-catalogue',
      headers: CatalogueReadHeaders,
      query: z.object({ revision: z.coerce.number().int().positive().optional() }),
      responses: {
        200: TypeCatalogueDescriptorSchema,
        304: c.noBody(),
        401: CatalogueErrorBodySchema,
        404: CatalogueErrorBodySchema,
      },
      summary: 'Read the current or an exact immutable type catalogue revision',
    },
    audit: {
      method: 'GET',
      path: '/type-catalogue/audit',
      query: z.object({ before: z.coerce.number().int().positive().optional(), limit: PageLimit }),
      responses: {
        200: z.object({
          events: z.array(CatalogueAuditEventSchema),
          nextBefore: z.number().int().positive().nullable(),
        }),
        401: CatalogueErrorBodySchema,
      },
      summary: 'Read catalogue publication and abandonment audit events newest first',
    },
    validateItem: {
      method: 'POST',
      path: '/type-catalogue/items/validate',
      body: CatalogueItemValidationBodySchema,
      responses: {
        200: CatalogueItemValidationResultSchema,
        400: CatalogueErrorBodySchema,
        401: CatalogueErrorBodySchema,
      },
      summary: 'Validate and canonicalise a complete item value set without writing it',
    },
  },
  manage: {
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
