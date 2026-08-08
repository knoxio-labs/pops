import { generateKeyPairSync } from 'node:crypto';

import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCloudflareAccessVerifier,
  readCloudflareAccessConfig,
  type CloudflareAccessVerifierOptions,
} from '../cloudflare-jwt.js';

const TEAM = 'pops-test-team';
const AUDIENCE = 'aud-under-test';
const KID = 'kid-1';

/**
 * A real RSA keypair rather than a fixture: every assertion below is about
 * whether a signature verifies, and a hard-coded token would only prove that
 * `jsonwebtoken` can parse a string we wrote by hand.
 */
function rsaKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey, publicKey };
}

const signer = rsaKeyPair();

function signAccessToken(
  claims: Record<string, unknown>,
  overrides: { key?: string; kid?: string; algorithm?: jwt.Algorithm } = {}
): string {
  const { key = signer.privateKey, kid = KID, algorithm = 'RS256' } = overrides;
  return jwt.sign(claims, key, { algorithm, keyid: kid, expiresIn: '5m' });
}

function certsResponse(publicKey: string, kid = KID): Response {
  return new Response(JSON.stringify({ public_certs: [{ kid, cert: publicKey }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function makeVerifier(
  overrides: Omit<CloudflareAccessVerifierOptions, 'teamName' | 'fetchImpl'> = {}
) {
  const fetchImpl = vi.fn<typeof globalThis.fetch>(async () => certsResponse(signer.publicKey));
  return {
    fetchImpl,
    verifier: createCloudflareAccessVerifier({
      teamName: TEAM,
      fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
      ...overrides,
    }),
  };
}

describe('createCloudflareAccessVerifier', () => {
  it('resolves the email claim of a token signed by the team JWKS', async () => {
    const { verifier } = makeVerifier();

    await expect(
      verifier.verify(signAccessToken({ email: 'operator@pops.local' }))
    ).resolves.toEqual({ email: 'operator@pops.local' });
  });

  it('fetches the JWKS from the team hostname derived from the team name', async () => {
    const { verifier, fetchImpl } = makeVerifier();

    await verifier.verify(signAccessToken({ email: 'operator@pops.local' }));

    expect(fetchImpl).toHaveBeenCalledWith(
      `https://${TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`
    );
  });

  it('rejects a token signed by a different key, even with a known kid', async () => {
    const impostor = rsaKeyPair();
    const { verifier } = makeVerifier();

    await expect(
      verifier.verify(
        signAccessToken({ email: 'operator@pops.local' }, { key: impostor.privateKey })
      )
    ).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const { verifier } = makeVerifier();
    const expired = jwt.sign({ email: 'operator@pops.local' }, signer.privateKey, {
      algorithm: 'RS256',
      keyid: KID,
      expiresIn: -10,
    });

    await expect(verifier.verify(expired)).rejects.toThrow();
  });

  it('rejects a tampered payload', async () => {
    const { verifier } = makeVerifier();
    const token = signAccessToken({ email: 'operator@pops.local' });
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ email: 'attacker@evil.test' })).toString(
      'base64url'
    );

    await expect(verifier.verify(`${header}.${forgedPayload}.${signature}`)).rejects.toThrow();
  });

  /**
   * The `alg: none` class. A verifier that trusted the header would accept
   * this because there is nothing to check; pinning `algorithms: ['RS256']`
   * is what makes it a rejection.
   */
  it('rejects an unsigned token claiming alg none', async () => {
    const { verifier } = makeVerifier();
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT', kid: KID })).toString(
      'base64url'
    );
    const payload = Buffer.from(JSON.stringify({ email: 'attacker@evil.test' })).toString(
      'base64url'
    );

    await expect(verifier.verify(`${header}.${payload}.`)).rejects.toThrow();
  });

  /**
   * The HMAC confusion class: the attacker signs HS256 using the *public* key
   * as the shared secret, which they can fetch, and hopes the verifier picks
   * its algorithm from the header.
   */
  it('rejects an HS256 token signed with the public key as the secret', async () => {
    const { verifier } = makeVerifier();
    const forged = jwt.sign({ email: 'attacker@evil.test' }, signer.publicKey, {
      algorithm: 'HS256',
      keyid: KID,
      expiresIn: '5m',
    });

    await expect(verifier.verify(forged)).rejects.toThrow();
  });

  it('rejects a token whose kid is absent from the JWKS', async () => {
    const { verifier } = makeVerifier();

    await expect(
      verifier.verify(signAccessToken({ email: 'operator@pops.local' }, { kid: 'kid-unknown' }))
    ).rejects.toThrow(/public key not found/);
  });

  it('rejects a token with no kid at all', async () => {
    const { verifier } = makeVerifier();
    const noKid = jwt.sign({ email: 'operator@pops.local' }, signer.privateKey, {
      algorithm: 'RS256',
      expiresIn: '5m',
    });

    await expect(verifier.verify(noKid)).rejects.toThrow(/missing kid/);
  });

  it('rejects a structurally valid token that carries no email claim', async () => {
    const { verifier } = makeVerifier();

    await expect(verifier.verify(signAccessToken({ sub: 'no-email' }))).rejects.toThrow(
      /missing email claim/
    );
  });

  describe('audience', () => {
    it('accepts a token whose aud array contains the configured audience', async () => {
      const { verifier } = makeVerifier({ audience: AUDIENCE });

      await expect(
        verifier.verify(signAccessToken({ email: 'operator@pops.local', aud: [AUDIENCE] }))
      ).resolves.toEqual({ email: 'operator@pops.local' });
    });

    /**
     * The sibling-application case: same team, same signing keys, different
     * Access app. Without the `aud` check this token is indistinguishable from
     * one minted for us.
     */
    it('rejects a validly signed token minted for a different Access application', async () => {
      const { verifier } = makeVerifier({ audience: AUDIENCE });

      await expect(
        verifier.verify(
          signAccessToken({ email: 'operator@pops.local', aud: ['some-other-application'] })
        )
      ).rejects.toThrow(/audience mismatch/);
    });

    it('rejects a token with no aud at all when an audience is configured', async () => {
      const { verifier } = makeVerifier({ audience: AUDIENCE });

      await expect(
        verifier.verify(signAccessToken({ email: 'operator@pops.local' }))
      ).rejects.toThrow(/audience mismatch/);
    });

    it('ignores aud entirely when none is configured', async () => {
      const { verifier } = makeVerifier();

      await expect(
        verifier.verify(signAccessToken({ email: 'operator@pops.local', aud: ['anything-at-all'] }))
      ).resolves.toEqual({ email: 'operator@pops.local' });
    });
  });

  describe('JWKS cache', () => {
    it('fetches once across repeated verifications inside the TTL', async () => {
      const { verifier, fetchImpl } = makeVerifier({ now: () => 1_000 });
      const token = signAccessToken({ email: 'operator@pops.local' });

      await verifier.verify(token);
      await verifier.verify(token);
      await verifier.verify(token);

      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('re-fetches once the TTL has elapsed, so a key rotation is picked up', async () => {
      let clock = 1_000;
      const { verifier, fetchImpl } = makeVerifier({ cacheTtlMs: 60_000, now: () => clock });
      const token = signAccessToken({ email: 'operator@pops.local' });

      await verifier.verify(token);
      clock += 60_001;
      await verifier.verify(token);

      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failed fetch', async () => {
      const fetchImpl = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(new Response('nope', { status: 503, statusText: 'Unavailable' }))
        .mockResolvedValueOnce(certsResponse(signer.publicKey));
      const verifier = createCloudflareAccessVerifier({
        teamName: TEAM,
        fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
      });
      const token = signAccessToken({ email: 'operator@pops.local' });

      await expect(verifier.verify(token)).rejects.toThrow(/Failed to fetch Cloudflare certs/);
      await expect(verifier.verify(token)).resolves.toEqual({ email: 'operator@pops.local' });
    });

    it('rejects a JWKS response carrying no usable keys', async () => {
      const fetchImpl = vi.fn<typeof globalThis.fetch>(
        async () => new Response(JSON.stringify({ public_certs: [] }), { status: 200 })
      );
      const verifier = createCloudflareAccessVerifier({
        teamName: TEAM,
        fetchImpl: fetchImpl as unknown as typeof globalThis.fetch,
      });

      await expect(
        verifier.verify(signAccessToken({ email: 'operator@pops.local' }))
      ).rejects.toThrow(/no usable keys/);
    });
  });
});

describe('readCloudflareAccessConfig', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the team name and audience from the environment', () => {
    expect(
      readCloudflareAccessConfig({
        CLOUDFLARE_ACCESS_TEAM_NAME: TEAM,
        CLOUDFLARE_ACCESS_AUD: AUDIENCE,
      })
    ).toEqual({ teamName: TEAM, audience: AUDIENCE });
  });

  it('omits the audience when it is unset, rather than carrying an empty string', () => {
    expect(readCloudflareAccessConfig({ CLOUDFLARE_ACCESS_TEAM_NAME: TEAM })).toEqual({
      teamName: TEAM,
    });
  });

  it('treats an empty audience as unset', () => {
    expect(
      readCloudflareAccessConfig({ CLOUDFLARE_ACCESS_TEAM_NAME: TEAM, CLOUDFLARE_ACCESS_AUD: '' })
    ).toEqual({ teamName: TEAM });
  });

  it.each([
    ['absent', {}],
    ['empty', { CLOUDFLARE_ACCESS_TEAM_NAME: '' }],
  ])('returns null when the team name is %s', (_label, env) => {
    expect(readCloudflareAccessConfig(env)).toBeNull();
  });
});
