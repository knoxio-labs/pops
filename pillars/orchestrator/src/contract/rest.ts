import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  ErrorBodySchema,
  TaggedQueryRequestSchema,
  TaggedQueryResponseSchema as CarrierQueryResponseSchema,
} from '@pops/types';

const c = initContract();

const TaggedQueryBodySchema = TaggedQueryRequestSchema.pick({
  tagIds: true,
  limit: true,
})
  .partial({ limit: true })
  .strict();

const TaggedQuerySectionSchema = z
  .object({
    pillar: z.string().min(1),
    items: CarrierQueryResponseSchema.shape.items,
    nextCursor: CarrierQueryResponseSchema.shape.nextCursor,
  })
  .strict();

const TaggedQueryPillarSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(['ok', 'unavailable', 'unauthorized']),
  })
  .strict();

const TaggedQueryResponseSchema = z
  .object({
    expandedTagIds: z.array(z.string().min(1)),
    sections: z.array(TaggedQuerySectionSchema),
    pillars: z.array(TaggedQueryPillarSchema),
  })
  .strict();

const taggedContract = c.router({
  query: {
    method: 'POST',
    path: '/tagged/query',
    body: TaggedQueryBodySchema,
    responses: {
      200: TaggedQueryResponseSchema,
      400: ErrorBodySchema,
      503: ErrorBodySchema,
    },
    summary: 'List all registered carrier items matching shared tag ids',
  },
});

/** The orchestrator's REST contract, addressed by operation id `tagged.query`. */
export const orchestratorContract = c.router(
  { tagged: taggedContract },
  { pathPrefix: '', strictStatusCodes: false }
);

/** Type-level view of the orchestrator REST contract. */
export type OrchestratorContract = typeof orchestratorContract;
