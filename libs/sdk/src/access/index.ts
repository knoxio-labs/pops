/**
 * `@pops/pillar-sdk/access` — Cloudflare Access identity primitives.
 *
 * A Node-only subpath: it pulls in `jsonwebtoken`. Import it from a pillar's
 * API layer, never from a frontend app.
 */
export {
  CloudflareAccessError,
  createCloudflareAccessVerifier,
  DEFAULT_CACHE_TTL_MS,
  readCloudflareAccessConfig,
  verifyCloudflareAccessJwt,
  verifyCloudflareAccessPrincipal,
  type CloudflareAccessIdentity,
  type CloudflareAccessPrincipal,
  type CloudflareAccessVerifier,
  type CloudflareAccessVerifierOptions,
} from './cloudflare-jwt.js';
