/**
 * The BFM half of the refresh signed-message contract, asserted against the
 * vector this pillar owns at `pillars/bfm/contracts/refresh-message-v1.json`.
 *
 * The format is defined once, in `refresh-exchange.ts`'s header, and
 * `clients/ios` reproduces the construction in Swift. No compiler sees both
 * halves, and a disagreement over the domain prefix, the separator count, the
 * digest or the hex case produces a signature that does not verify — which
 * reaches the app as an ordinary `401`, indistinguishable from an expired token
 * with nothing in either log to tell them apart.
 *
 * So both languages read the same committed bytes. This is the canonical copy,
 * because the format is this pillar's to define and this pillar is the party
 * that rejects a wrong one; `clients/ios/Contracts/` holds a vendored one,
 * `RefreshSignatureMessageTests` asserts the Swift construction against it, and
 * `scripts/ci/check-refresh-message-fixture.mjs` fails the build if the two
 * ever differ by a byte or if the vector stops holding the format's properties.
 *
 * `refresh-exchange.test.ts` covers the state machine around this and states
 * the format as a readable literal. What is proved HERE is the thing a literal
 * in one language cannot be: that the bytes on disk, which Swift also reads,
 * are the bytes this server builds and verifies.
 */
import { createSecretKey, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { deviceRow, openTempDb } from '../../../db/__tests__/helpers.js';
import {
  DEFAULT_REFRESH_TOKEN_TTL_MS,
  devices,
  hashRefreshToken,
  insertRefreshToken,
} from '../../../db/index.js';
import { createRefreshChallengeStore } from '../refresh-challenge.js';
import {
  completeRefreshExchange,
  REFRESH_SIGNATURE_DOMAIN,
  refreshSignatureMessage,
} from '../refresh-exchange.js';

import type { KeyObject } from 'node:crypto';

interface RefreshMessageFixture {
  version: number;
  domain: string;
  nonce: string;
  refreshToken: string;
  refreshTokenSha256Hex: string;
  messageBase64: string;
}

const pillarRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/** This pillar's own copy. Never the one under `clients/` — see ADR-043. */
const fixturePath = join(pillarRoot, 'contracts', 'refresh-message-v1.json');

const fixture: RefreshMessageFixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const expectedMessage = Buffer.from(fixture.messageBase64, 'base64');

const ACCESS_TOKEN_KEY: KeyObject = createSecretKey(
  Buffer.from('refresh-message-fixture-signing-key-0123', 'utf8')
);

describe('the committed vector', () => {
  it('pins the version and domain this pillar actually uses', () => {
    // A pin that reads its own value from the code it pins proves nothing, so
    // the constant is compared to the file rather than the file to itself.
    expect(fixture.version).toBe(1);
    expect(fixture.domain).toBe(REFRESH_SIGNATURE_DOMAIN);
  });

  it('carries the digest of the token beside it, as this pillar computes it', () => {
    expect(hashRefreshToken(fixture.refreshToken)).toBe(fixture.refreshTokenSha256Hex);
  });

  it('never carries the token itself — the preimage binds a digest', () => {
    expect(expectedMessage.toString('utf8')).not.toContain(fixture.refreshToken);
  });
});

describe('refreshSignatureMessage', () => {
  it('builds byte-for-byte what clients/ios signs', () => {
    const built = refreshSignatureMessage(fixture.nonce, fixture.refreshTokenSha256Hex);

    expect(built.toString('utf8')).toBe(expectedMessage.toString('utf8'));
    expect(built.equals(expectedMessage)).toBe(true);
  });

  it('is fed the digest by the exchange, not the token', () => {
    // The failure this catches is a call site that passes the wrong argument:
    // the construction below would still be correct and its own test still
    // green, while every handset in the field started signing different bytes.
    const wrongArgument = refreshSignatureMessage(fixture.nonce, fixture.refreshToken);

    expect(wrongArgument.equals(expectedMessage)).toBe(false);
  });
});

describe('the exchange itself', () => {
  /**
   * Signing the committed bytes rather than the bytes
   * {@link refreshSignatureMessage} returns is the whole point of this case.
   * Every other test of this route asks the implementation what to sign and
   * then verifies it against itself, so all of them stay green if the exchange
   * starts building a different message. This one asks the file — the same file
   * Swift asks — so a change to what the exchange verifies over fails here.
   */
  it('verifies a signature made over exactly the committed bytes', () => {
    const { opened, cleanup } = openTempDb();
    try {
      const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const device = deviceRow({
        publicKeyDer: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
      });
      opened.db.insert(devices).values(device).run();
      insertRefreshToken(opened.db, {
        tokenHash: fixture.refreshTokenSha256Hex,
        deviceId: device.id,
        familyId: 'fixture-family',
        expiresAt: new Date(Date.now() + DEFAULT_REFRESH_TOKEN_TTL_MS).toISOString(),
        createdAt: new Date().toISOString(),
      });

      const challenges = createRefreshChallengeStore({ generateNonce: () => fixture.nonce });
      const { nonce } = challenges.issue();
      const signature = sign('sha256', expectedMessage, {
        key: privateKey,
        dsaEncoding: 'der',
      }).toString('base64');

      const result = completeRefreshExchange(
        { refreshToken: fixture.refreshToken, nonce, signature },
        { db: opened.db, accessTokenSigningKey: ACCESS_TOKEN_KEY, challenges }
      );

      expect(nonce).toBe(fixture.nonce);
      expect(result.outcome).toBe('refreshed');
    } finally {
      cleanup();
    }
  });
});
