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
 * `/mobile/*` routes declare these two statuses on their own ts-rest
 * responses, and two definitions of one wire shape drift.
 */
export const MobileAuthErrorSchema = z.object({
  code: z.enum(['invalid_token', 'device_revoked']),
  message: z.string(),
});

export type MobileAuthError = z.infer<typeof MobileAuthErrorSchema>;

/**
 * What the `/mobile` perimeter answers when a caller exceeds its request
 * budget (POPS-1468).
 *
 * Separate from {@link MobileAuthErrorSchema} rather than another `code` in
 * its enum, because a 429 is not a statement about the caller's credentials:
 * it is reachable with a perfectly good token, and the phone's recovery —
 * back off, then retry the same request unchanged — is neither of the two
 * recoveries that schema's statuses select between.
 *
 * `retryAfterSeconds` duplicates the `Retry-After` header on purpose. The
 * header is the standard and a proxy may act on it; the body is what the
 * generated Swift client can read as a typed field without reaching for
 * `HTTPURLResponse.allHeaderFields`.
 */
export const MobileRateLimitErrorSchema = z.object({
  code: z.literal('rate_limited'),
  message: z.string(),
  retryAfterSeconds: z.number().int().positive(),
});

export type MobileRateLimitError = z.infer<typeof MobileRateLimitErrorSchema>;

/**
 * How reachable one member of the federation is, as bfm observed it.
 *
 * Four values rather than a boolean, and the same four the cross-pillar
 * gateway already speaks (`src/api/pillars/gateway.ts`), so the answer bfm
 * gives the phone here cannot disagree with the answer a real call gives it a
 * moment later:
 *
 * - `healthy` — answering, and serving a contract bfm could call.
 * - `degraded` — the registry is mid-reconcile about it, and a call would come
 *   back `degraded` too. Worth retrying.
 * - `unavailable` — nobody answered.
 * - `contract-mismatch` — answered, but not with a contract bfm can call.
 *
 * The last two are the pair that must never collapse. "Not answering" and
 * "registered but uncallable" send an operator to different places, and the
 * one moment this endpoint earns its keep is when the fleet is half-broken —
 * exactly when a boolean has thrown the useful half away.
 */
export const ReachabilitySchema = z.enum([
  'healthy',
  'degraded',
  'unavailable',
  'contract-mismatch',
]);

export type Reachability = z.infer<typeof ReachabilitySchema>;

/**
 * The mobile surfaces bfm knows how to serve.
 *
 * An enum rather than a free string: the Swift client is generated from this
 * document, so adding a member here becomes a compile error at the one call
 * site that has to handle it. That is the intended cost.
 */
export const MobileFeatureIdSchema = z.enum(['transactions']);

export type MobileFeatureId = z.infer<typeof MobileFeatureIdSchema>;

/**
 * Where the pillar list came from — the SDK discovery cache's own vocabulary,
 * plus `unavailable` for the case it could not answer at all.
 *
 * The phone needs it to know how far to trust the rest of the payload. A
 * `stale-fallback` list is last-known-good rather than current, and an
 * `unavailable` one carries no pillars and no features — which is a different
 * claim from a federation that genuinely has none.
 */
export const RegistrySourceSchema = z.enum(['fresh', 'cached', 'stale-fallback', 'unavailable']);

export type RegistrySource = z.infer<typeof RegistrySourceSchema>;

export const BootstrapPillarSchema = z.object({
  id: z.string(),
  reachability: ReachabilitySchema,
});

/**
 * A feature carries its own reachability rather than the id of the pillar
 * behind it. That is what keeps the promise the app is built on: it renders
 * what the server says is available, and never has to learn the federation's
 * topology in order to explain why something is missing.
 */
export const BootstrapFeatureSchema = z.object({
  id: MobileFeatureIdSchema,
  reachability: ReachabilitySchema,
});

/**
 * The device as bfm now holds it. `lastSeenAt` is the value this very request
 * wrote rather than the one it superseded, so the response and the row agree.
 */
export const BootstrapDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  lastSeenAt: z.iso.datetime(),
});

export const MobileBootstrapResponseSchema = z.object({
  device: BootstrapDeviceSchema,
  registry: z.object({ source: RegistrySourceSchema }),
  pillars: z.array(BootstrapPillarSchema),
  features: z.array(BootstrapFeatureSchema),
});

export type BootstrapDevice = z.infer<typeof BootstrapDeviceSchema>;
export type BootstrapPillar = z.infer<typeof BootstrapPillarSchema>;
export type BootstrapFeature = z.infer<typeof BootstrapFeatureSchema>;
export type MobileBootstrapResponse = z.infer<typeof MobileBootstrapResponseSchema>;
