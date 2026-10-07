/**
 * A Cloudflare Access stand-in for tests: a real RSA key pair, tokens signed
 * with it in the shape Access issues, and a `fetch` that serves the matching
 * certs document.
 *
 * Real keys rather than a canned token, because every assertion a consumer
 * makes is about whether a signature verifies, and a hard-coded string would
 * only prove that `jsonwebtoken` can parse what we wrote by hand.
 */
import { generateKeyPairSync } from 'node:crypto';

import jwt from 'jsonwebtoken';

/** A PEM-encoded RSA key pair. */
export interface AccessKeyPair {
  readonly privateKey: string;
  readonly publicKey: string;
}

/** Generate a fresh 2048-bit RSA pair, for the fixture or for an impostor signer. */
export function generateAccessKeyPair(): AccessKeyPair {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

/** The certs document Access serves at `/cdn-cgi/access/certs`, for one key. */
export function accessCertsResponse(publicKey: string, kid: string): Response {
  return new Response(JSON.stringify({ public_certs: [{ kid, cert: publicKey }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

export interface AccessJwtFixtureOptions {
  /** Team name the consumer's verifier is configured with. */
  readonly teamName?: string;
  /** Key id the certs document and every signed token carry by default. */
  readonly kid?: string;
  /** `aud` stamped on {@link AccessJwtFixture.signForEmail} tokens, when set. */
  readonly audience?: string;
}

/** Ways to sign a token the verifier should refuse. */
export interface AccessJwtSignOverrides {
  /** Sign with another key, such as an impostor's private key. */
  readonly key?: string;
  readonly kid?: string;
  readonly algorithm?: 'RS256' | 'HS256';
  /** Seconds, or a `jsonwebtoken` span. Negative produces an expired token. */
  readonly expiresIn?: number | `${number}m`;
}

export interface AccessJwtFixture extends AccessKeyPair {
  readonly teamName: string;
  readonly kid: string;
  /** Sign an arbitrary claim set. Valid for five minutes unless overridden. */
  readonly sign: (claims: Record<string, unknown>, overrides?: AccessJwtSignOverrides) => string;
  /** Sign the token Access issues for a human session with this email. */
  readonly signForEmail: (email: string, overrides?: AccessJwtSignOverrides) => string;
  /** Serves the fixture's certs document for any URL. Pass as the verifier's `fetchImpl`. */
  readonly fetchImpl: typeof globalThis.fetch;
}

/** Build a fixture with its own key pair. One per test file is enough. */
export function createAccessJwtFixture(options: AccessJwtFixtureOptions = {}): AccessJwtFixture {
  const { teamName = 'pops-test-team', kid = 'kid-1', audience } = options;
  const keys = generateAccessKeyPair();

  const sign: AccessJwtFixture['sign'] = (claims, overrides = {}) =>
    jwt.sign(claims, overrides.key ?? keys.privateKey, {
      algorithm: overrides.algorithm ?? 'RS256',
      keyid: overrides.kid ?? kid,
      expiresIn: overrides.expiresIn ?? '5m',
    });

  return {
    ...keys,
    teamName,
    kid,
    sign,
    signForEmail: (email, overrides) =>
      sign(audience === undefined ? { email } : { email, aud: audience }, overrides),
    fetchImpl: () => Promise.resolve(accessCertsResponse(keys.publicKey, kid)),
  };
}
