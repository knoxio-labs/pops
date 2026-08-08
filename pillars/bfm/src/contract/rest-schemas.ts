import { z } from 'zod';

/**
 * Liveness shape every pillar's `/health` returns. `pillar` is pinned to the
 * literal `bfm` rather than a free string so a misrouted proxy — a request
 * that reached a sibling pillar's health route — fails the client's parse
 * instead of reading as this pillar being up.
 */
export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  status: z.literal('ok'),
  pillar: z.literal('bfm'),
  version: z.string(),
  ts: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
