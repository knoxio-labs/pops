/**
 * `GET /mobile/bootstrap`'s wire schemas. Split out of `rest-schemas.ts` to
 * keep that file under the line-count cap (POPS-4332); re-exported there so
 * every existing import site keeps working unchanged.
 */
import { z } from 'zod';

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
 * A plain string on the wire, not a `z.enum`. This field sits inside every
 * element of the `features` array on `GET /mobile/bootstrap` — the app's
 * first authenticated call — so a closed enum here is the currency/type
 * hazard already resolved for `MobileTransactionSchema` (see the wire-shape
 * test's comment there), except sharper: a build already on a handset
 * decodes the WHOLE bootstrap payload or none of it, not just the one row
 * carrying the unrecognised value. The day bfm ships a second feature id,
 * every installed build that predates it would fail to launch, on hardware
 * the operator cannot roll forward (ADR-043).
 *
 * `MOBILE_FEATURE_IDS` below is where the closed, exhaustive-switch-friendly
 * list still lives for code written against this pillar today — it is a
 * compile-time convenience, not a wire contract.
 */
export const MobileFeatureIdSchema = z.string();

export type MobileFeatureId = z.infer<typeof MobileFeatureIdSchema>;

/**
 * The known feature ids, closed, for call sites in this pillar that want
 * exhaustiveness now. Never used as the wire schema — see
 * `MobileFeatureIdSchema` for why.
 */
export const MOBILE_FEATURE_IDS = [
  'transactions',
  'accounts',
  'purchases',
  'receipt-capture',
  'inventory',
] as const;

export type KnownMobileFeatureId = (typeof MOBILE_FEATURE_IDS)[number];

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
  /**
   * What this handset's grant holds (ADR-048), so the app can decline to offer
   * what it would only be refused for.
   *
   * Open strings rather than an enum, for the reason every other vocabulary on
   * this wire is open: the app is distributed rather than deployed, so a build
   * already on a phone must be able to decode a payload naming a capability
   * that build has never heard of. It ignores the ones it does not know, which
   * is exactly right — a capability an installed build cannot use is one it
   * has no screen for.
   *
   * The grant, not the vocabulary. Two devices can be told different things
   * here, and that is the point of the model.
   */
  capabilities: z.array(z.string()),
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
