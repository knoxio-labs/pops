import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { CatalogueAuditEventSchema } from './rest-catalogue-audit-schema.js';
import {
  CatalogueErrorBodySchema,
  CatalogueItemValidationBodySchema,
  CatalogueItemValidationResultSchema,
  CatalogueReadHeaders,
  TypeCatalogueDescriptorSchema,
  TypeCatalogueTypeDescriptorSchema,
} from './rest-catalogue-schemas.js';

const c = initContract();
const PageLimit = z.coerce.number().int().min(1).max(500).default(250);

/** Immutable catalogue reads and non-mutating item validation, under `inventory.types.read`. */
export const inventoryCatalogueReadContract = c.router({
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
  type: {
    method: 'GET',
    path: '/type-catalogue/types/:typeId',
    pathParams: z.object({ typeId: z.uuid() }),
    headers: CatalogueReadHeaders,
    query: z.object({ revision: z.coerce.number().int().positive().optional() }),
    responses: {
      200: TypeCatalogueTypeDescriptorSchema,
      304: c.noBody(),
      401: CatalogueErrorBodySchema,
      404: CatalogueErrorBodySchema,
    },
    summary: 'Read one type definition at the current or an exact published catalogue revision',
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
});
