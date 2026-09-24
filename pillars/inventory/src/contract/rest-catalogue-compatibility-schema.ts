import { z } from 'zod';

const CatalogueCompatibilityChangeSchema = z.object({
  classification: z.enum(['compatible', 'protocol_gated', 'migration_required', 'forbidden']),
  definitionId: z.string(),
  code: z.string(),
});

/** Items holding overrides the draft disables; publishing needs a migration that drops them. */
const CatalogueDiscardedOverridesSchema = z.object({
  fieldId: z.uuid(),
  items: z.number().int().positive(),
});

/** A draft's publication compatibility and the live data it would touch. */
export const CatalogueCompatibilitySchema = z.object({
  classification: z.enum(['compatible', 'protocol_gated', 'migration_required', 'forbidden']),
  affectedIds: z.array(z.string()),
  affectedItems: z.number().int().nonnegative(),
  discardedOverrides: z.array(CatalogueDiscardedOverridesSchema),
  changes: z.array(CatalogueCompatibilityChangeSchema),
});
