import { z } from 'zod';

const UuidSchema = z.string().uuid();
const IsoTimestampSchema = z.iso.datetime();

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** An ISO calendar date without a time component. */
const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, 'Expected a YYYY-MM-DD date')
  .refine(isCalendarDate, 'Expected a valid calendar date');

const TagNameSchema = z.string().refine((name) => name.trim().length > 0, 'Name is required');

/** Date and optional region bounds associated with a tag. */
export const TagWindowSchema = z
  .object({
    start: IsoDateSchema.nullable(),
    end: IsoDateSchema.nullable(),
    region: z.string().nullable(),
  })
  .superRefine(({ start, end, region }, context) => {
    if (start !== null && end !== null && end < start) {
      context.addIssue({
        code: 'custom',
        path: ['end'],
        message: 'Window end must be on or after its start',
      });
    }

    if (region !== null && start === null) {
      context.addIssue({
        code: 'custom',
        path: ['region'],
        message: 'A window region requires a start date',
      });
    }
  });

/** One complete vocabulary entry returned by the tags pillar. */
export const TagSchema = z.object({
  id: UuidSchema,
  facet: z.string().min(1),
  name: TagNameSchema,
  parentId: UuidSchema.nullable(),
  description: z.string().nullable(),
  window: TagWindowSchema.nullable(),
  archived: z.boolean(),
  archivedAt: IsoTimestampSchema.nullable(),
  mergedIntoId: UuidSchema.nullable(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

/** Body accepted when a new shared vocabulary entry is created. */
export const CreateTagBody = z.object({
  facet: z.string().min(1),
  name: TagNameSchema,
  parentId: UuidSchema.nullable().optional(),
  description: z.string().nullable().optional(),
  window: TagWindowSchema.nullable().optional(),
});

/** Mutable vocabulary fields accepted by the tag update route. */
export const UpdateTagBody = z.object({
  name: TagNameSchema.optional(),
  parentId: UuidSchema.nullable().optional(),
  description: z.string().nullable().optional(),
  window: TagWindowSchema.nullable().optional(),
});

/** Filters accepted by the tag-list route. */
export const ListTagsQuery = z.object({
  facet: z.string().min(1).optional(),
  includeArchived: z.enum(['true', 'false']).optional(),
  updatedSince: IsoTimestampSchema.optional(),
});

/** Target tag for merging the path tag into another entry. */
export const MergeTagBody = z.object({ intoId: UuidSchema });

/** Input to expand tag ids through descendants and merged entries. */
export const ExpandTagsBody = z.object({ ids: z.array(UuidSchema).min(1).max(500) });

/** Expanded ids and any requested ids absent from the vocabulary. */
export const ExpandTagsResponse = z.object({
  ids: z.array(UuidSchema),
  unknownIds: z.array(UuidSchema),
});

/** Response body returned by the tag-list route. */
export const TagListResponseSchema = z.object({ tags: z.array(TagSchema) });

export type Tag = z.infer<typeof TagSchema>;
export type CreateTagInput = z.infer<typeof CreateTagBody>;
export type UpdateTagInput = z.infer<typeof UpdateTagBody>;
export type ListTagsInput = z.infer<typeof ListTagsQuery>;
export type MergeTagInput = z.infer<typeof MergeTagBody>;
export type ExpandTagsInput = z.infer<typeof ExpandTagsBody>;
export type ExpandedTags = z.infer<typeof ExpandTagsResponse>;
