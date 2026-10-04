import { z } from 'zod';

/**
 * Shared zod building blocks for the lists REST contract.
 *
 * Split from `rest.ts` so the per-group route files (`rest-list.ts`,
 * `rest-items.ts`) can stay focused on the path map.
 */
export { ErrorBodySchema } from '@pops/types';

export const KIND_ENUM = z.enum(['shopping', 'packing', 'todo', 'generic']);
export const SORT_ENUM = z.enum(['updated', 'name', 'created']);
export const REF_KIND_ENUM = z.enum(['free', 'ingredient', 'variant', 'recipe', 'custom']);

/**
 * `refKind` minus `'free'` — the subset that has identity (refId) and so
 * can be used as a deduplication key by `POST /lists/:listId/items/upsert-by-ref`.
 */
export const NON_FREE_REF_KIND_ENUM = z.enum(['ingredient', 'variant', 'recipe', 'custom']);

export const UPSERT_CONFLICT_MODE_ENUM = z.enum(['merge-additive', 'replace', 'skip']);

/** Optional note formatting and length bound for reference upserts. */
export const NotesMergeOptionsSchema = z
  .object({
    separator: z
      .string()
      .describe('Text between adjacent note fragments; defaults to a newline when omitted.'),
    maxLength: z
      .number()
      .int()
      .positive()
      .describe('Maximum number of Unicode code points retained in the merged notes.'),
  })
  .describe('Optional formatting and size limit for notes written by an upsert.');

export const LabelFromQtyOptionsSchema = z
  .object({
    prefix: z.string(),
    suffix: z.string(),
    maxFractionDigits: z.number().int().min(0).max(10),
  })
  .describe('Optional formatting for labels rebuilt from the cumulative quantity on merge.');

export const UpsertByRefBodySchema = z.object({
  refKind: NON_FREE_REF_KIND_ENUM,
  refId: z.number().int().positive(),
  label: z.string().trim().min(1),
  qty: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  onConflict: UPSERT_CONFLICT_MODE_ENUM.optional(),
  labelFromQty: LabelFromQtyOptionsSchema.optional().describe(
    'When merging additively, formats the cumulative quantity into the label in the same transaction.'
  ),
  notesMerge: NotesMergeOptionsSchema.optional().describe(
    'Optional note formatting and size limit for this upsert.'
  ),
});

export const UpsertByRefResponseSchema = z.discriminatedUnion('outcome', [
  z.object({
    outcome: z.literal('inserted'),
    itemId: z.number().int().positive(),
    position: z.number().int().nonnegative(),
  }),
  z.object({
    outcome: z.literal('merged'),
    itemId: z.number().int().positive(),
    qty: z.number().nullable().describe('Quantity stored on the merged row after this upsert.'),
  }),
  z.object({ outcome: z.literal('skipped'), itemId: z.number().int().positive() }),
]);

export const PositiveInt = z.number().int().positive();
export const PathPositiveInt = z.coerce.number().int().positive();

export const ListRowSchema = z.object({
  id: PositiveInt,
  name: z.string(),
  kind: KIND_ENUM,
  ownerApp: z.string(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const ListItemRowSchema = z.object({
  id: PositiveInt,
  listId: PositiveInt,
  position: z.number().int().nonnegative(),
  label: z.string(),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
  refKind: REF_KIND_ENUM,
  refId: PositiveInt.nullable(),
  checked: z.number().int().min(0).max(1),
  checkedAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
});

export const ListAggregateRowSchema = z.object({
  id: PositiveInt,
  name: z.string(),
  kind: KIND_ENUM,
  ownerApp: z.string(),
  itemCount: z.number().int().nonnegative(),
  uncheckedCount: z.number().int().nonnegative(),
  lastUpdatedAt: z.string(),
  archivedAt: z.string().nullable(),
});

export const ItemAddBodySchema = z.object({
  label: z.string().trim().min(1),
  qty: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  refKind: REF_KIND_ENUM.optional(),
  refId: PositiveInt.nullable().optional(),
  notes: z.string().nullable().optional(),
  position: z.number().int().nonnegative().optional(),
});

export const OkSchema = z.object({ ok: z.literal(true) });
