import { z } from 'zod';

const UuidSchema = z.string().uuid();
const IsoDateSchema = z.iso.date();
const IsoTimestampSchema = z.iso.datetime();

/** Date and optional region bounds associated with a shared tag. */
const TagWindowSchema = z.object({
  start: IsoDateSchema.nullable(),
  end: IsoDateSchema.nullable(),
  region: z.string().nullable(),
});

/** The wire shape Finance consumes from the tags pillar. */
export const SharedTagSchema = z.object({
  id: UuidSchema,
  // Keep the facet open so adding a producer facet remains wire-compatible.
  facet: z.string().min(1),
  name: z.string().refine((name) => name.trim().length > 0),
  parentId: UuidSchema.nullable(),
  description: z.string().nullable(),
  window: TagWindowSchema.nullable(),
  archived: z.boolean(),
  archivedAt: IsoTimestampSchema.nullable(),
  mergedIntoId: UuidSchema.nullable(),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

/** Response body returned by `tags.list`. */
export const TagsListResponseSchema = z.object({ tags: z.array(SharedTagSchema) });

export type SharedTag = z.infer<typeof SharedTagSchema>;
export type TagsListResponse = z.infer<typeof TagsListResponseSchema>;

/** Flat query arguments accepted by `tags.list`. */
export type TagsListQuery = {
  facet?: string;
  includeArchived?: 'true' | 'false';
  updatedSince?: string;
};

/** Flat body arguments accepted by `tags.create`. */
export type CreateSharedTagInput = {
  facet: string;
  name: string;
  parentId?: string | null;
  description?: string | null;
  window?: z.infer<typeof TagWindowSchema> | null;
};
