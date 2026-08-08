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

/**
 * What the `/mobile` perimeter answers when it refuses a request.
 *
 * The status code is the contract the phone switches on — 401 means refresh,
 * 403 means return to pairing and wipe the keychain — and `code` is the same
 * decision in a form a log line or a crash report can carry. `message` is for
 * a human reading a proxy log; it is never shown to a user and never carries
 * any part of the presented token.
 *
 * It lives in the contract rather than beside the middleware because the
 * `/mobile/*` routes that land later (POPS-1378, POPS-1379) declare these two
 * statuses on their own ts-rest responses, and two definitions of one wire
 * shape drift.
 */
export const MobileAuthErrorSchema = z.object({
  code: z.enum(['invalid_token', 'device_revoked']),
  message: z.string(),
});

export type MobileAuthError = z.infer<typeof MobileAuthErrorSchema>;
