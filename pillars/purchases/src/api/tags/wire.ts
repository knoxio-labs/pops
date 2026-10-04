import { z } from 'zod';

/** The fields purchases needs from the tags pillar to validate and cache a tag. */
export const SharedTagWireSchema = z.object({
  id: z.string().uuid(),
  facet: z.string().min(1),
  name: z.string().refine((name) => name.trim().length > 0, 'Name is required'),
  archived: z.boolean(),
  mergedIntoId: z.string().uuid().nullable(),
});

/** The complete response from tags.tags.list, including archived entries. */
export const SharedTagListWireSchema = z
  .object({ tags: z.array(SharedTagWireSchema) })
  .superRefine(({ tags }, context) => {
    const seen = new Set<string>();
    for (const [index, tag] of tags.entries()) {
      if (seen.has(tag.id)) {
        context.addIssue({
          code: 'custom',
          path: ['tags', index, 'id'],
          message: 'Tag ids must be unique',
        });
      }
      seen.add(tag.id);
    }
  });

export type SharedTagWire = z.infer<typeof SharedTagWireSchema>;
