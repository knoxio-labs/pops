/**
 * Canonical (new) registry handshake/discovery HTTP paths.
 *
 * Idiomatic slash routes that replace the tRPC-vestigial dotted shape
 * (`/core.registry.*`). LIVE: the registry pillar dual-serves these alongside
 * {@link LEGACY_REGISTRY_PATHS} (each operation mounted on both paths, same
 * handler), and the SDK transport/discovery prefer the slash path, falling back
 * to the legacy dotted path on a 404 during the rolling-deploy window. The
 * legacy aliases are removed once every pillar image is on the new SDK and the
 * legacy-path-hit metric reads zero.
 */
export const REGISTRY_PATHS = {
  register: '/registry/register',
  heartbeat: '/registry/heartbeat',
  deregister: '/registry/deregister',
  snapshot: '/registry/pillars',
} as const;

/**
 * Legacy (dotted, tRPC-vestigial) registry paths kept alive across the
 * rolling-deploy window so an old-SDK pillar can register against a new core
 * and a new-SDK pillar can fall back against an old core. Removed once every
 * pillar image is on the new SDK and the legacy-path metric reads zero.
 */
export const LEGACY_REGISTRY_PATHS = {
  register: '/core.registry.register',
  heartbeat: '/core.registry.heartbeat',
  deregister: '/core.registry.deregister',
  snapshot: '/core.registry.list',
} as const;

/** A registry operation key shared by the canonical and legacy path maps. */
export type RegistryPathKey = keyof typeof REGISTRY_PATHS;

/**
 * Service-account self-introspection: the presenting `X-API-Key` is
 * authenticated against the registry's own table and its principal returned.
 *
 * Deliberately outside {@link REGISTRY_PATHS}, which pairs every entry with a
 * dotted legacy alias — this route never had a tRPC-era name and needs no
 * fallback leg. It is how a producer other than the registry learns whether a
 * presented key is live and what it is granted; the caller must hold the key to
 * learn anything, so the route is no more of an oracle than the registry
 * already is.
 */
export const REGISTRY_SERVICE_ACCOUNT_SELF_PATH = '/service-accounts/self';
