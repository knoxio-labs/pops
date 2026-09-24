import { z } from 'zod';

/**
 * Archives a type or field. `replacedBy` records the live definition of the
 * same kind that takes over from it: a replacement field belongs to the same
 * type, or to the type that replaces that type. Lineage is set once and never
 * changes after publication; a queued phone change is moved onto the
 * replacement when the replacement accepts its values as they are.
 */
export const CatalogueArchiveDefinitionSchema = z.object({
  kind: z.enum(['archive_type', 'archive_field']),
  id: z.uuid(),
  replacedBy: z.uuid().optional(),
});
