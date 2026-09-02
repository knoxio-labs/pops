/**
 * Cloudflare Access JWT verification — the operator-identity primitive shared
 * by every pillar that sits behind Access.
 *
 * Access terminates the human login at the edge and forwards the session as a
 * `cf-access-jwt-assertion` header. Verifying it is the whole of "is this a
 * real operator", which is why it lives here rather than being re-derived per
 * pillar: two copies of a signature check drift, and the copy that drifts is
 * the one nobody is looking at.
 *
 * Three properties are load-bearing and each has a way of being lost:
 *
 * - **The algorithm is pinned to RS256.** `jsonwebtoken` will otherwise honour
 *   whatever the token header claims, which is the `alg: none` and
 *   HMAC-with-the-public-key confusion class in one.
 * - **The audience is checked when configured.** Access issues one JWT per
 *   application on the same team domain, so a token minted for a *different*
 *   protected app carries a valid signature from the same keys. Without the
 *   `aud` check, any app on the team is a way in.
 * - **The signing keys are fetched from the team's own JWKS**, cached for
 *   {@link DEFAULT_CACHE_TTL_MS}. The cache is per-verifier rather than
 *   module-global so a test can drive expiry without leaking key material into
 *   the next test.
 */
import jwt from 'jsonwebtoken';

/** The verified human principal — the only claim any caller needs. */
export interface CloudflareAccessIdentity {
  email: string;
}

/**
 * Either party Access will vouch for.
 *
 * A human session carries `email`. A service token — the credential a
 * headless caller presents as `CF-Access-Client-Id`/`-Secret`, which Access
 * exchanges for a JWT at the edge — carries no email at all; its identity is
 * the token's `common_name`. The two are kept as distinct variants rather
 * than an optional email so a caller must decide what a service principal is
 * allowed to do, instead of discovering `undefined` where it expected a
 * person.
 */
export type CloudflareAccessPrincipal =
  | { kind: 'user'; email: string }
  | { kind: 'service'; commonName: string };

export interface CloudflareAccessVerifierOptions {
  /** Cloudflare Zero Trust team name; the JWKS host is derived from it. */
  teamName: string;
  /**
   * Expected `aud`. Optional because a single-application tunnel has nothing
   * to confuse itself with, but set it wherever the team hosts more than one
   * Access application — see the header.
   */
  audience?: string | undefined;
  /** Injectable for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof globalThis.fetch;
  /** Injectable for tests. Defaults to {@link DEFAULT_CACHE_TTL_MS}. */
  cacheTtlMs?: number;
  /** Injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

export interface CloudflareAccessVerifier {
  /**
   * Resolve a `cf-access-jwt-assertion` value to a human session, or throw.
   * A service-token JWT is rejected here exactly as it always was ("missing
   * email claim"); a pillar that admits service tokens opts in through
   * {@link CloudflareAccessVerifier.verifyPrincipal}.
   */
  verify(token: string): Promise<CloudflareAccessIdentity>;
  /**
   * Resolve a `cf-access-jwt-assertion` value to whichever principal it
   * carries — a human session or a service token — or throw. The signature,
   * algorithm and audience checks are the same as {@link verify}; only the
   * claim read at the end differs.
   */
  verifyPrincipal(token: string): Promise<CloudflareAccessPrincipal>;
}

/** How long a fetched JWKS is trusted. Cloudflare rotates on a far slower cadence. */
export const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;

/** Thrown for every rejection reason. Callers treat any failure as "not authenticated". */
export class CloudflareAccessError extends Error {
  override readonly name = 'CloudflareAccessError' as const;
}

interface CachedKeys {
  keys: ReadonlyMap<string, string>;
  expiresAt: number;
}

function parseCerts(payload: unknown): ReadonlyMap<string, string> {
  if (payload === null || typeof payload !== 'object' || !('public_certs' in payload)) {
    throw new CloudflareAccessError('Cloudflare certs response has no public_certs array');
  }
  const certs = (payload as { public_certs: unknown }).public_certs;
  if (!Array.isArray(certs)) {
    throw new CloudflareAccessError('Cloudflare certs response has no public_certs array');
  }
  const keys = new Map<string, string>();
  for (const entry of certs) {
    if (entry === null || typeof entry !== 'object') continue;
    const { kid, cert } = entry as { kid?: unknown; cert?: unknown };
    if (typeof kid === 'string' && typeof cert === 'string') keys.set(kid, cert);
  }
  if (keys.size === 0) {
    throw new CloudflareAccessError('Cloudflare certs response carried no usable keys');
  }
  return keys;
}

/**
 * Build a verifier bound to one team. Holds its own JWKS cache, so callers
 * should create one per process and reuse it rather than per request.
 */
export function createCloudflareAccessVerifier(
  options: CloudflareAccessVerifierOptions
): CloudflareAccessVerifier {
  const {
    teamName,
    audience,
    fetchImpl = globalThis.fetch,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    now = Date.now,
  } = options;

  const certsUrl = `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`;
  let cache: CachedKeys | null = null;

  async function signingKeys(): Promise<ReadonlyMap<string, string>> {
    const at = now();
    if (cache && cache.expiresAt > at) return cache.keys;

    const response = await fetchImpl(certsUrl);
    if (!response.ok) {
      throw new CloudflareAccessError(`Failed to fetch Cloudflare certs: ${response.statusText}`);
    }
    const keys = parseCerts(await response.json());
    cache = { keys, expiresAt: at + cacheTtlMs };
    return keys;
  }

  async function verifiedClaims(token: string): Promise<jwt.JwtPayload> {
    const kid = readKid(token);
    const publicKey = (await signingKeys()).get(kid);
    if (!publicKey) {
      throw new CloudflareAccessError(`Invalid JWT: public key not found for kid ${kid}`);
    }

    // `algorithms` is the pin. Never widen it to read the token's own header.
    const payload = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    if (typeof payload === 'string') {
      throw new CloudflareAccessError('Invalid JWT: payload is not a claim set');
    }

    assertAudience(payload.aud, audience);
    return payload;
  }

  return {
    async verify(token: string): Promise<CloudflareAccessIdentity> {
      return { email: readEmail(await verifiedClaims(token)) };
    },
    async verifyPrincipal(token: string): Promise<CloudflareAccessPrincipal> {
      return readPrincipal(await verifiedClaims(token));
    },
  };
}

/** The key id the token was signed under, from its unverified header. */
function readKid(token: string): string {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string') {
    throw new CloudflareAccessError('Invalid JWT: unable to decode header');
  }
  const kid = decoded.header.kid;
  if (!kid) {
    throw new CloudflareAccessError('Invalid JWT: missing kid in header');
  }
  return kid;
}

function assertAudience(
  claimed: string | string[] | undefined,
  expected: string | undefined
): void {
  if (expected === undefined || expected === '') return;
  const matches =
    typeof claimed === 'string' ? claimed === expected : (claimed?.includes(expected) ?? false);
  if (!matches) {
    throw new CloudflareAccessError('Invalid JWT: audience mismatch');
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function readEmail(payload: jwt.JwtPayload): string {
  const email = nonEmptyString((payload as { email?: unknown }).email);
  if (email === undefined) {
    throw new CloudflareAccessError('Invalid JWT: missing email claim');
  }
  return email;
}

/**
 * `email` wins when both are present: Access never issues a token carrying
 * both, so a token that does is at best malformed and is read as the more
 * constrained (human) principal rather than the broader one.
 */
function readPrincipal(payload: jwt.JwtPayload): CloudflareAccessPrincipal {
  const claims = payload as { email?: unknown; common_name?: unknown };
  const email = nonEmptyString(claims.email);
  if (email !== undefined) return { kind: 'user', email };
  const commonName = nonEmptyString(claims.common_name);
  if (commonName !== undefined) return { kind: 'service', commonName };
  throw new CloudflareAccessError('Invalid JWT: missing email and common_name claims');
}

/**
 * Read the Access configuration a pillar was deployed with.
 *
 * Returns `null` when `CLOUDFLARE_ACCESS_TEAM_NAME` is unset, which is the
 * signal that Access is not configured for this process. What that *means* is
 * the caller's decision and differs by pillar: a service reached only through
 * an Access-protected tunnel may treat it as "trust the tunnel", while one
 * whose hostname deliberately bypasses Access must treat it as "reject".
 */
export function readCloudflareAccessConfig(
  env: NodeJS.ProcessEnv = process.env
): { teamName: string; audience?: string } | null {
  const teamName = env['CLOUDFLARE_ACCESS_TEAM_NAME'];
  if (teamName === undefined || teamName === '') return null;
  const audience = env['CLOUDFLARE_ACCESS_AUD'];
  return audience === undefined || audience === '' ? { teamName } : { teamName, audience };
}

const verifiersByConfig = new Map<string, CloudflareAccessVerifier>();

/**
 * Verify against the ambient environment, memoising one verifier (and so one
 * JWKS cache) per distinct configuration.
 *
 * Env is read per call rather than at module load because a pillar's tests
 * set and clear `CLOUDFLARE_ACCESS_TEAM_NAME` between cases, and a snapshot
 * taken at import time would make the first test's value the whole suite's.
 */
export async function verifyCloudflareAccessJwt(
  token: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<CloudflareAccessIdentity> {
  return ambientVerifier(env).verify(token);
}

/**
 * The {@link CloudflareAccessVerifier.verifyPrincipal} counterpart of
 * {@link verifyCloudflareAccessJwt}: same memoised verifier, same
 * configuration, but a service-token JWT resolves to a service principal
 * instead of being rejected. Only a pillar that has decided what a service
 * principal may do should call this one.
 */
export async function verifyCloudflareAccessPrincipal(
  token: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<CloudflareAccessPrincipal> {
  return ambientVerifier(env).verifyPrincipal(token);
}

function ambientVerifier(env: NodeJS.ProcessEnv): CloudflareAccessVerifier {
  const config = readCloudflareAccessConfig(env);
  if (!config) {
    throw new CloudflareAccessError('CLOUDFLARE_ACCESS_TEAM_NAME not configured');
  }
  // `\0` written as an escape, never as a raw byte. It is the right separator
  // — neither a team name nor an audience can contain one, so no two distinct
  // configurations can collide onto one key — but a literal control character
  // in source is invisible in review and mangled by tooling.
  const cacheKey = `${config.teamName}\0${config.audience ?? ''}`;
  let verifier = verifiersByConfig.get(cacheKey);
  if (!verifier) {
    verifier = createCloudflareAccessVerifier(config);
    verifiersByConfig.set(cacheKey, verifier);
  }
  return verifier;
}
