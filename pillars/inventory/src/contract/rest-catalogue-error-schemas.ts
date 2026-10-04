import { z } from 'zod';

import { CatalogueCompatibilitySchema } from './rest-catalogue-compatibility-schema.js';
import { ErrorBodySchema } from './rest-schemas.js';

const CatalogueErrorDetailsSchema = z
  .object({
    currentDraftVersion: z.number().int().positive().optional(),
    issues: z
      .array(
        z.object({
          definitionId: z.string().nullable(),
          path: z.string(),
          code: z.string(),
          message: z.string(),
        })
      )
      .optional(),
    preview: z
      .object({
        baseRevision: z.number().int().positive(),
        draftRevision: z.number().int().positive(),
        compatibility: CatalogueCompatibilitySchema,
      })
      .optional(),
  })
  .passthrough();

/** ADR-054 catalogue error envelope with typed conflict, issue, and preview details. */
export const CatalogueErrorBodySchema = ErrorBodySchema.extend({
  details: CatalogueErrorDetailsSchema.optional(),
}).meta({ id: 'CatalogueErrorBody' });

/** Catalogue error envelope used by routes that can return preview details. */
export const CataloguePreviewErrorBodySchema = CatalogueErrorBodySchema;
