import { z } from 'zod';

export const CatalogueActorSchema = z.object({
  kind: z.enum(['web', 'service', 'migration']),
  id: z.string().nullable(),
  label: z.string().nullable(),
});

export const CatalogueAuditEventSchema = z.object({
  id: z.number().int().positive(),
  revision: z.number().int().positive(),
  kind: z.enum(['published', 'abandoned']),
  actor: CatalogueActorSchema,
  before: z.record(z.string(), z.unknown()),
  after: z.record(z.string(), z.unknown()),
  migrationName: z.string().nullable(),
  affectedItems: z.number().int().min(0),
  serverTime: z.string(),
});
