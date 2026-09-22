import { z } from 'zod';

import { CatalogueActorSchema } from './rest-catalogue-audit-schema.js';
import { ErrorBodySchema } from './rest-schemas.js';
export const CataloguePrimitiveKindSchema = z.enum([
  'short_text',
  'long_text',
  'integer',
  'decimal',
  'boolean',
  'enum',
  'measurement',
  'date',
  'date_time',
  'url',
  'reference',
]);

const CatalogueEnumOptionSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  label: z.string(),
  sortOrder: z.number().int().min(0),
  archivedAt: z.string().nullable(),
});

const CatalogueRevisionSchema = z.object({
  revision: z.number().int().positive(),
  baseRevision: z.number().int().positive().nullable(),
  status: z.enum(['draft', 'published', 'abandoned']),
  minimumProtocol: z.number().int().positive(),
  created: z.object({ actor: CatalogueActorSchema, at: z.string() }),
  published: z
    .object({
      actor: CatalogueActorSchema,
      at: z.string(),
      note: z.string().nullable(),
    })
    .nullable(),
  abandoned: z.object({ actor: CatalogueActorSchema, at: z.string() }).nullable(),
});

const CatalogueDefinitionFieldSchema = z.object({
  id: z.uuid(),
  typeId: z.uuid(),
  key: z.string(),
  label: z.string(),
  help: z.string().nullable(),
  sortOrder: z.number().int().min(0),
  kind: CataloguePrimitiveKindSchema,
  cardinality: z.enum(['one', 'many']),
  required: z.boolean(),
  storage: z.enum(['stored', 'computed']),
  fixedUnit: z.string().nullable(),
  referenceKinds: z.array(z.enum(['item', 'location'])),
  referenceTypeIds: z.array(z.uuid()),
  expressionVersion: z.number().int().positive().nullable(),
  expression: z.unknown().nullable(),
  allowOverride: z.boolean(),
  presentation: z.record(z.string(), z.unknown()),
  archivedAt: z.string().nullable(),
  enumOptions: z.array(CatalogueEnumOptionSchema),
});

const CatalogueDefinitionTypeSchema = z.object({
  revision: z.number().int().positive(),
  id: z.uuid(),
  key: z.string(),
  label: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int().min(0),
  capabilities: z.array(z.string()),
  legacyLabels: z.array(z.string()),
  presentation: z.record(z.string(), z.unknown()),
  archivedAt: z.string().nullable(),
  fields: z.array(CatalogueDefinitionFieldSchema),
});

export const TypeCatalogueDescriptorSchema = z.object({
  revision: CatalogueRevisionSchema,
  types: z.array(CatalogueDefinitionTypeSchema),
});

const CatalogueCompatibilityChangeSchema = z.object({
  classification: z.enum(['compatible', 'protocol_gated', 'migration_required', 'forbidden']),
  definitionId: z.string(),
  code: z.string(),
});

export const CatalogueCompatibilitySchema = z.object({
  classification: z.enum(['compatible', 'protocol_gated', 'migration_required', 'forbidden']),
  affectedIds: z.array(z.string()),
  changes: z.array(CatalogueCompatibilityChangeSchema),
});

export const CataloguePutTypeSchema = z.object({
  kind: z.literal('put_type'),
  id: z.uuid().optional(),
  key: z.string().trim().min(1).max(100).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2_000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  capabilities: z.array(z.string().min(1).max(64)).max(16).optional(),
  legacyLabels: z.array(z.string().min(1).max(200)).max(50).optional(),
  presentation: z.record(z.string(), z.unknown()).optional(),
  archivedAt: z.string().nullable().optional(),
});

export const CataloguePutFieldSchema = z.object({
  kind: z.literal('put_field'),
  id: z.uuid().optional(),
  typeId: z.uuid(),
  key: z.string().trim().min(1).max(100).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  help: z.string().max(2_000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  fieldKind: CataloguePrimitiveKindSchema.optional(),
  cardinality: z.enum(['one', 'many']).optional(),
  required: z.boolean().optional(),
  storage: z.enum(['stored', 'computed']).optional(),
  fixedUnit: z.string().trim().min(1).max(32).nullable().optional(),
  referenceKinds: z
    .array(z.enum(['item', 'location']))
    .max(2)
    .optional(),
  referenceTypeIds: z.array(z.uuid()).max(100).optional(),
  expressionVersion: z.number().int().positive().nullable().optional(),
  expression: z.unknown().nullable().optional(),
  allowOverride: z.boolean().optional(),
  presentation: z.record(z.string(), z.unknown()).optional(),
  archivedAt: z.string().nullable().optional(),
});

export const CataloguePutEnumOptionSchema = z.object({
  kind: z.literal('put_enum_option'),
  id: z.uuid().optional(),
  fieldId: z.uuid(),
  key: z.string().trim().min(1).max(100).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  sortOrder: z.number().int().min(0).optional(),
  archivedAt: z.string().nullable().optional(),
});

export const CatalogueDraftOperationSchema = z.discriminatedUnion('kind', [
  CataloguePutTypeSchema,
  CataloguePutFieldSchema,
  CataloguePutEnumOptionSchema,
  z.object({
    kind: z.enum(['archive_type', 'archive_field', 'archive_enum_option']),
    id: z.uuid(),
  }),
  z.object({
    kind: z.literal('reorder'),
    definition: z.enum(['type', 'field', 'enum_option']),
    parentId: z.uuid().nullable().optional(),
    ids: z.array(z.uuid()).min(1).max(500),
  }),
]);

export const CatalogueErrorBodySchema = ErrorBodySchema.extend({
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
});

export const CatalogueReadHeaders = z.object({ 'if-none-match': z.string().optional() });
