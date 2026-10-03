import { z } from 'zod';

/** One vocabulary entry returned by the tags pillar. */
export const TagSchema = z.object({
  id: z.string().uuid(),
  facet: z.string(),
  name: z.string(),
  parentId: z.string().uuid().nullable(),
  description: z.string().nullable(),
  windowStart: z.string().nullable(),
  windowEnd: z.string().nullable(),
  windowRegion: z.string().nullable(),
  archivedAt: z.string().datetime().nullable(),
  mergedIntoId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/** Response body for `GET /tags`. */
export const TagListResponseSchema = z.object({ tags: z.array(TagSchema) });

/** Inferred tag record returned by the list contract. */
export type Tag = z.infer<typeof TagSchema>;
