/**
 * Verification is the half that matters. Every test that forges a token here
 * builds it with the real `jsonwebtoken` signer rather than a hand-assembled
 * string, so what is asserted is that `verifyAccessToken` refuses a token an
 * actual attacker could produce — not that it refuses malformed input.
 */
import { createSecretKey, generateKeyPairSync } from 'node:crypto';

import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  ACCESS_TOKEN_TYPE,
  AccessTokenError,
  mintAccessToken,
  verifyAccessToken,
} from '../access-token.js';

const signingKey = createSecretKey(Buffer.from('the-key-this-deployment-signs-with', 'utf8'));
const otherKey = createSecretKey(Buffer.from('a-key-from-some-other-deployment!!', 'utf8'));

const DEVICE_ID = '6f1d0a0e-6c8e-4b0f-9c9e-2f6a5f2f5a11';

function decodedHeader(token: string): Record<string, unknown> {
  const decoded = jwt.decode(token, { complete: true });
  if (decoded === null || typeof decoded === 'string') throw new Error('undecodable token');
  return decoded.header as unknown as Record<string, unknown>;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('mintAccessToken', () => {
  it('produces a token that verifies and names the device', () => {
    const { token } = mintAccessToken(DEVICE_ID, signingKey);

    expect(verifyAccessToken(token, signingKey)).toMatchObject({
      sub: DEVICE_ID,
      typ: ACCESS_TOKEN_TYPE,
    });
  });

  it('pins HS256 in the header rather than letting the library pick', () => {
    const { token } = mintAccessToken(DEVICE_ID, signingKey);

    expect(decodedHeader(token)['alg']).toBe('HS256');
  });

  it('expires in minutes, not hours', () => {
    const { token, expiresInSeconds } = mintAccessToken(DEVICE_ID, signingKey);

    const { iat, exp } = verifyAccessToken(token, signingKey);
    expect(exp - iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(expiresInSeconds).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(ACCESS_TOKEN_TTL_SECONDS).toBeLessThanOrEqual(30 * 60);
  });

  it('carries nothing beyond the four claims the guard reads', () => {
    const { token } = mintAccessToken(DEVICE_ID, signingKey);

    const payload = jwt.decode(token);
    expect(Object.keys(payload as object).toSorted()).toEqual(['exp', 'iat', 'sub', 'typ']);
  });

  it('refuses to mint a token that names no device', () => {
    expect(() => mintAccessToken('   ', signingKey)).toThrow(AccessTokenError);
  });
});

describe('verifyAccessToken', () => {
  it('accepts a token minted moments ago', () => {
    const { token } = mintAccessToken(DEVICE_ID, signingKey);

    expect(() => verifyAccessToken(token, signingKey)).not.toThrow();
  });

  it('rejects an expired token', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T00:00:00Z'));
    const { token } = mintAccessToken(DEVICE_ID, signingKey);

    vi.setSystemTime(new Date(Date.now() + (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000));

    expect(() => verifyAccessToken(token, signingKey)).toThrow(AccessTokenError);
  });

  it('still accepts a token one second before it expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T00:00:00Z'));
    const { token } = mintAccessToken(DEVICE_ID, signingKey);

    vi.setSystemTime(new Date(Date.now() + (ACCESS_TOKEN_TTL_SECONDS - 1) * 1000));

    expect(verifyAccessToken(token, signingKey).sub).toBe(DEVICE_ID);
  });

  it('rejects a tampered payload', () => {
    const { token } = mintAccessToken(DEVICE_ID, signingKey);
    const [header, payload, signature] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload as string, 'base64url').toString('utf8')) as {
      sub: string;
    };
    decoded.sub = 'some-other-device';
    const forged = [
      header,
      Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url'),
      signature,
    ].join('.');

    expect(() => verifyAccessToken(forged, signingKey)).toThrow(AccessTokenError);
  });

  it('rejects a token signed with a different key', () => {
    const { token } = mintAccessToken(DEVICE_ID, otherKey);

    expect(() => verifyAccessToken(token, signingKey)).toThrow(AccessTokenError);
  });

  it('rejects an unsigned `alg: none` token', () => {
    // The classic bypass: strip the signature, claim the algorithm is `none`,
    // and hope the verifier trusts the header.
    const forged = `${[
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' }), 'utf8').toString('base64url'),
      Buffer.from(
        JSON.stringify({
          sub: DEVICE_ID,
          typ: ACCESS_TOKEN_TYPE,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        'utf8'
      ).toString('base64url'),
    ].join('.')}.`;

    expect(() => verifyAccessToken(forged, signingKey)).toThrow(AccessTokenError);
  });

  it('rejects a token whose header claims a stronger HMAC than we pin', () => {
    const forged = jwt.sign({ typ: ACCESS_TOKEN_TYPE }, signingKey, {
      algorithm: 'HS512',
      subject: DEVICE_ID,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    expect(() => verifyAccessToken(forged, signingKey)).toThrow(AccessTokenError);
  });

  it('rejects an RS256 token, the HS-versus-RS confusion case', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const forged = jwt.sign({ typ: ACCESS_TOKEN_TYPE }, privateKey, {
      algorithm: 'RS256',
      subject: DEVICE_ID,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    expect(() => verifyAccessToken(forged, signingKey)).toThrow(AccessTokenError);
  });

  it('rejects a correctly signed token that carries no expiry', () => {
    // `jwt.verify` treats `exp` as optional, so without an explicit check this
    // is a permanent credential.
    const forged = jwt.sign({ typ: ACCESS_TOKEN_TYPE, sub: DEVICE_ID }, signingKey, {
      algorithm: 'HS256',
      noTimestamp: true,
    });

    expect(() => verifyAccessToken(forged, signingKey)).toThrow(AccessTokenError);
  });

  it('rejects a correctly signed token of another kind', () => {
    const forged = jwt.sign({ typ: 'bfm-refresh' }, signingKey, {
      algorithm: 'HS256',
      subject: DEVICE_ID,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    expect(() => verifyAccessToken(forged, signingKey)).toThrow(AccessTokenError);
  });

  it('rejects a correctly signed token that names no device', () => {
    const forged = jwt.sign({ typ: ACCESS_TOKEN_TYPE, sub: '' }, signingKey, {
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    expect(() => verifyAccessToken(forged, signingKey)).toThrow(AccessTokenError);
  });

  it.each([
    ['an empty string', ''],
    ['a non-JWT string', 'not-a-token'],
    ['a two-segment string', 'aaa.bbb'],
  ])('rejects %s', (_label, value) => {
    expect(() => verifyAccessToken(value, signingKey)).toThrow(AccessTokenError);
  });

  it('never puts the presented token in the error it throws', () => {
    const { token } = mintAccessToken(DEVICE_ID, otherKey);

    let message = '';
    try {
      verifyAccessToken(token, signingKey);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toBe('');
    for (const segment of token.split('.')) {
      expect(message).not.toContain(segment);
    }
  });
});
