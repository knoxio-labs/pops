import { z } from 'zod';

import { KebabIdentifierSchema } from './manifest-primitives.js';

/** Shared tag assignment operations exposed by participating pillars. */
export const TAGGED_LIST_OPERATION_ID = 'tagged.list';
export const TAGGED_ATTACH_OPERATION_ID = 'tagged.attach';
export const TAGGED_DETACH_OPERATION_ID = 'tagged.detach';

/** The kinds of entities a pillar exposes through the shared tag contract. */
export const TagCarrierManifestSchema = z
  .object({
    carriers: z
      .array(
        z
          .object({
            entityType: KebabIdentifierSchema,
          })
          .strict()
      )
      .min(1),
  })
  .strict();

export type TagCarrierManifest = z.infer<typeof TagCarrierManifestSchema>;

const TagIdSchema = z.string().min(1);

/** Request for all entities carrying at least one of the requested tag ids. */
export const TaggedQueryRequestSchema = z
  .object({
    tagIds: z.array(TagIdSchema).min(1).max(500),
    limit: z.int().min(1).max(500).default(200),
    cursor: z.string().optional(),
  })
  .strict();

export type TaggedQueryRequest = z.infer<typeof TaggedQueryRequestSchema>;

/** A carrier entity returned from a shared-tag lookup. */
export const TaggedThingSchema = z
  .object({
    uri: z.string().min(1),
    entityType: KebabIdentifierSchema,
    title: z.string().min(1),
    tagIds: z.array(TagIdSchema),
    date: z.string().nullable(),
    amountCents: z.int().nullable(),
  })
  .strict();

export type TaggedThing = z.infer<typeof TaggedThingSchema>;

export const TaggedQueryResponseSchema = z
  .object({
    items: z.array(TaggedThingSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();

export type TaggedQueryResponse = z.infer<typeof TaggedQueryResponseSchema>;

/** Current shared tags on an entity after an attach or detach operation. */
export const TagAssignmentResponseSchema = z
  .object({
    tagIds: z.array(TagIdSchema),
  })
  .strict();

export type TagAssignmentResponse = z.infer<typeof TagAssignmentResponseSchema>;
