/**
 * The refresh state machine, at the level below HTTP.
 *
 * `__tests__/device-refresh.test.ts` drives the same thing through the real
 * routes and asserts statuses. What is proved here is the part a status cannot
 * show: which rows moved, which did not, and in what order the checks run —
 * because the order is the security design and two of the cases below pass for
 * the wrong reason if it is reversed.
 *
 * The keys are generated in-process. They agree with the verifier by
 * construction, which is exactly why they prove nothing about a real handset —
 * that is `device-signature.test.ts`'s job, against a vector CryptoKit
 * produced. What these prove is everything above the bytes.
 */
import { createSecretKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deviceRow, openTempDb, requireRow } from '../../../db/__tests__/helpers.js';
import {
  DEFAULT_REFRESH_TOKEN_TTL_MS,
  devices,
  generateRefreshToken,
  hashRefreshToken,
  insertRefreshToken,
  refreshTokens,
} from '../../../db/index.js';
import { verifyAccessToken } from '../access-token.js';
import { createRefreshChallengeStore } from '../refresh-challenge.js';
import {
  completeRefreshExchange,
  REFRESH_SIGNATURE_DOMAIN,
  refreshSignatureMessage,
} from '../refresh-exchange.js';

import type { KeyObject } from 'node:crypto';

import type { OpenedBfmDb } from '../../../db/index.js';
import type { RefreshChallengeStore } from '../refresh-challenge.js';

const signingKey: KeyObject = createSecretKey(
  Buffer.from('test-signing-key-0123456789abcdef', 'utf8')
);

let open: { opened: OpenedBfmDb; cleanup: () => void } | undefined;
let challenges: RefreshChallengeStore;

function db(): OpenedBfmDb['db'] {
  open ??= openTempDb();
  return open.opened.db;
}

beforeEach(() => {
  challenges = createRefreshChallengeStore();
});

afterEach(() => {
  open?.cleanup();
  open = undefined;
  vi.restoreAllMocks();
});

interface PairedHandset {
  deviceId: string;
  familyId: string;
  refreshToken: string;
  privateKey: KeyObject;
}

/**
 * A device paired with a real P-256 keypair and one live refresh token — the
 * exact state `completePairingExchange` leaves behind.
 */
function pairHandset(overrides: { expiresAt?: string } = {}): PairedHandset {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const device = deviceRow({
    publicKeyDer: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  });
  db().insert(devices).values(device).run();

  const refreshToken = generateRefreshToken();
  const familyId = randomUUID();
  insertRefreshToken(db(), {
    tokenHash: hashRefreshToken(refreshToken),
    deviceId: device.id,
    familyId,
    expiresAt:
      overrides.expiresAt ?? new Date(Date.now() + DEFAULT_REFRESH_TOKEN_TTL_MS).toISOString(),
    createdAt: new Date().toISOString(),
  });

  return { deviceId: device.id, familyId, refreshToken, privateKey };
}

/** What the phone does: sign the domain-separated nonce + token digest, DER, base64. */
function signRefresh(nonce: string, refreshToken: string, privateKey: KeyObject): string {
  return sign(
    'sha256',
    refreshSignatureMessage(nonce, hashRefreshToken(refreshToken)),
    { key: privateKey, dsaEncoding: 'der' }
  ).toString('base64');
}

/** A whole honest exchange: fetch a nonce, sign it, present it. */
function refreshWith(
  handset: Pick<PairedHandset, 'refreshToken' | 'privateKey'>,
  deps: { now?: () => Date } = {}
) {
  const { nonce } = challenges.issue();
  return completeRefreshExchange(
    {
      refreshToken: handset.refreshToken,
      nonce,
      signature: signRefresh(nonce, handset.refreshToken, handset.privateKey),
    },
    { db: db(), accessTokenSigningKey: signingKey, challenges, ...deps }
  );
}

function rowFor(token: string) {
  return requireRow(
    db()
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashRefreshToken(token)))
      .get(),
    'refresh token row'
  );
}

/** Silence the reuse-detection warning, and let a test assert it fired. */
function captureWarnings() {
  return vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}

describe('refreshSignatureMessage', () => {
  it('is the exact byte string the Swift side has to reproduce', () => {
    // Written out as a literal rather than rebuilt from the constants. This is
    // half of a cross-language contract that no compiler checks, so the test
    // has to fail when the format changes — which a test that rebuilt the
    // string the same way the code does would not.
    expect(refreshSignatureMessage('NONCE', 'DIGEST').toString('utf8')).toBe(
      'BFM-REFRESH-V1\nNONCE\nDIGEST'
    );
  });

  it('carries no trailing newline, the classic way two sides sign different bytes', () => {
    expect(refreshSignatureMessage('n', 'd').toString('utf8')).not.toMatch(/\n$/u);
  });

  it('is domain-separated, so a signature cannot be replayed into another context', () => {
    expect(refreshSignatureMessage('n', 'd').toString('utf8').startsWith(REFRESH_SIGNATURE_DOMAIN)).toBe(
      true
    );
  });

  it('binds the digest rather than the token, so the preimage carries no secret', () => {
    const token = generateRefreshToken();

    expect(refreshSignatureMessage('n', hashRefreshToken(token)).toString('utf8')).not.toContain(
      token
    );
  });

  it('is UTF-8 encoded, so a non-ASCII nonce would still agree byte for byte', () => {
    expect(refreshSignatureMessage('é', 'd')).toEqual(Buffer.from('BFM-REFRESH-V1\né\nd', 'utf8'));
  });
});

describe('the happy path', () => {
  it('rotates: the presented token dies, its successor lives, the family holds', () => {
    const handset = pairHandset();

    const result = refreshWith(handset);

    expect(result.outcome).toBe('refreshed');
    if (result.outcome !== 'refreshed') return;

    const spent = rowFor(handset.refreshToken);
    expect(spent.consumedAt).not.toBeNull();
    expect(spent.replacedBy).toBe(hashRefreshToken(result.refreshToken));

    const successor = rowFor(result.refreshToken);
    expect(successor.familyId).toBe(handset.familyId);
    expect(successor.consumedAt).toBeNull();
    expect(successor.revokedAt).toBeNull();
  });

  it('hands back a working access token for the same device', () => {
    const handset = pairHandset();

    const result = refreshWith(handset);

    expect(result.outcome).toBe('refreshed');
    if (result.outcome !== 'refreshed') return;
    expect(verifyAccessToken(result.accessToken, signingKey).sub).toBe(handset.deviceId);
    expect(result.deviceId).toBe(handset.deviceId);
  });

  it('lets the successor rotate in turn, so a handset keeps working indefinitely', () => {
    const handset = pairHandset();
    const first = refreshWith(handset);
    expect(first.outcome).toBe('refreshed');
    if (first.outcome !== 'refreshed') return;

    const second = refreshWith({ refreshToken: first.refreshToken, privateKey: handset.privateKey });

    expect(second.outcome).toBe('refreshed');
    if (second.outcome !== 'refreshed') return;
    expect(rowFor(second.refreshToken).familyId).toBe(handset.familyId);
  });

  it('re-ups the successor expiry from now rather than inheriting the old one', () => {
    // The whole reason thirty days is a drawer limit and not a phone-works-for
    // limit: an inherited expiry would make a family die a month after pairing
    // however often it rotated.
    const handset = pairHandset({ expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const refreshedAt = new Date(Date.now() + 30_000);

    const result = refreshWith(handset, { now: () => refreshedAt });

    expect(result.outcome).toBe('refreshed');
    if (result.outcome !== 'refreshed') return;
    expect(rowFor(result.refreshToken).expiresAt).toBe(
      new Date(refreshedAt.getTime() + DEFAULT_REFRESH_TOKEN_TTL_MS).toISOString()
    );
  });
});

describe('proof of possession', () => {
  it('refuses a valid signature made over a different nonce', () => {
    const handset = pairHandset();
    const presented = challenges.issue();
    const other = challenges.issue();

    const result = completeRefreshExchange(
      {
        refreshToken: handset.refreshToken,
        nonce: presented.nonce,
        // Correctly signed — by this device, over the other challenge. Without
        // the nonce in the message, this would authorise the refresh.
        signature: signRefresh(other.nonce, handset.refreshToken, handset.privateKey),
      },
      { db: db(), accessTokenSigningKey: signingKey, challenges }
    );

    expect(result).toEqual({ outcome: 'rejected' });
    expect(rowFor(handset.refreshToken).consumedAt).toBeNull();
  });

  it('refuses a replayed nonce', () => {
    const handset = pairHandset();
    const { nonce } = challenges.issue();
    const signature = signRefresh(nonce, handset.refreshToken, handset.privateKey);
    const request = { refreshToken: handset.refreshToken, nonce, signature };
    const deps = { db: db(), accessTokenSigningKey: signingKey, challenges };
    expect(completeRefreshExchange(request, deps).outcome).toBe('refreshed');

    // Byte-identical replay of a request that just worked.
    expect(completeRefreshExchange(request, deps)).toEqual({ outcome: 'challenge-expired' });
  });

  it('refuses an expired nonce', () => {
    const handset = pairHandset();
    let at = 1_000_000;
    challenges = createRefreshChallengeStore({ ttlMs: 60_000, now: () => at });
    const { nonce } = challenges.issue();
    at += 60_001;

    const result = completeRefreshExchange(
      {
        refreshToken: handset.refreshToken,
        nonce,
        signature: signRefresh(nonce, handset.refreshToken, handset.privateKey),
      },
      { db: db(), accessTokenSigningKey: signingKey, challenges }
    );

    expect(result).toEqual({ outcome: 'challenge-expired' });
  });

  it('refuses a signature from a different key over the right nonce', () => {
    const handset = pairHandset();
    const impostor = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
    const { nonce } = challenges.issue();

    const result = completeRefreshExchange(
      {
        refreshToken: handset.refreshToken,
        nonce,
        signature: signRefresh(nonce, handset.refreshToken, impostor),
      },
      { db: db(), accessTokenSigningKey: signingKey, challenges }
    );

    expect(result).toEqual({ outcome: 'rejected' });
    expect(rowFor(handset.refreshToken).consumedAt).toBeNull();
  });

  it('refuses a signature that is not a signature at all', () => {
    // Malformed DER reaches the same 401 as a well-formed wrong one. A caller
    // able to choose between a 401 and a 500 with 40 arbitrary bytes would have
    // found something more useful than an authentication failure.
    const handset = pairHandset();
    const { nonce } = challenges.issue();

    const result = completeRefreshExchange(
      { refreshToken: handset.refreshToken, nonce, signature: 'bm90LWEtc2lnbmF0dXJl' },
      { db: db(), accessTokenSigningKey: signingKey, challenges }
    );

    expect(result).toEqual({ outcome: 'rejected' });
  });

  it('spends the nonce even when the attempt fails, so it cannot be tried again', () => {
    const handset = pairHandset();
    const impostor = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey;
    const { nonce } = challenges.issue();
    const deps = { db: db(), accessTokenSigningKey: signingKey, challenges };
    completeRefreshExchange(
      { refreshToken: handset.refreshToken, nonce, signature: signRefresh(nonce, handset.refreshToken, impostor) },
      deps
    );

    // The real key, the same nonce. A nonce that survived the failed attempt
    // would be one an attacker could keep trying signatures against.
    const result = completeRefreshExchange(
      {
        refreshToken: handset.refreshToken,
        nonce,
        signature: signRefresh(nonce, handset.refreshToken, handset.privateKey),
      },
      deps
    );

    expect(result).toEqual({ outcome: 'challenge-expired' });
  });
});

describe('reuse detection', () => {
  it('burns the whole family when a spent token comes back, successor included', () => {
    const warn = captureWarnings();
    const handset = pairHandset();
    const first = refreshWith(handset);
    expect(first.outcome).toBe('refreshed');
    if (first.outcome !== 'refreshed') return;

    // The original token again — the signal that two parties hold what should
    // be one credential.
    const replay = refreshWith(handset);

    expect(replay).toEqual({ outcome: 'rejected' });
    expect(rowFor(handset.refreshToken).revokedAt).not.toBeNull();
    expect(rowFor(first.refreshToken).revokedAt).not.toBeNull();
    expect(warn.mock.calls[0]?.[0]).toContain('reuse detected');
  });

  it('stops the successor working, which is the point of burning the family', () => {
    captureWarnings();
    const handset = pairHandset();
    const first = refreshWith(handset);
    expect(first.outcome).toBe('refreshed');
    if (first.outcome !== 'refreshed') return;
    refreshWith(handset);

    // The honest phone's own live token, now dead. It has to be: nothing here
    // can tell which of the two holders was honest.
    const afterBurn = refreshWith({
      refreshToken: first.refreshToken,
      privateKey: handset.privateKey,
    });

    expect(afterBurn).toEqual({ outcome: 'rejected' });
  });

  it('fires on the token alone, before the signature is checked', () => {
    // The order that matters most in this file. A thief who stole the token but
    // not the phone cannot produce a signature — so verifying first would mean
    // they never trip the detector, and the family they stole from stays alive.
    const warn = captureWarnings();
    const handset = pairHandset();
    refreshWith(handset);
    const { nonce } = challenges.issue();

    const result = completeRefreshExchange(
      { refreshToken: handset.refreshToken, nonce, signature: 'bm90LWEtc2lnbmF0dXJl' },
      { db: db(), accessTokenSigningKey: signingKey, challenges }
    );

    expect(result).toEqual({ outcome: 'rejected' });
    expect(rowFor(handset.refreshToken).revokedAt).not.toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('leaves another handset alone', () => {
    captureWarnings();
    const mine = pairHandset();
    const theirs = pairHandset();
    refreshWith(mine);

    refreshWith(mine);

    expect(rowFor(theirs.refreshToken).revokedAt).toBeNull();
    expect(refreshWith(theirs).outcome).toBe('refreshed');
  });

  it('burns the family when the rotation itself loses a race', () => {
    // The same fork, detected one statement later: the row was live when it was
    // read and spent by the time the UPDATE ran. Only reachable with a second
    // writer, so it is substituted here rather than left as the one branch on
    // this path no test covers — see the `rotate` dep's own note.
    const warn = captureWarnings();
    const handset = pairHandset();
    const { nonce } = challenges.issue();

    const result = completeRefreshExchange(
      {
        refreshToken: handset.refreshToken,
        nonce,
        signature: signRefresh(nonce, handset.refreshToken, handset.privateKey),
      },
      {
        db: db(),
        accessTokenSigningKey: signingKey,
        challenges,
        rotate: () => ({ outcome: 'not-rotated' }),
      }
    );

    expect(result).toEqual({ outcome: 'rejected' });
    expect(rowFor(handset.refreshToken).revokedAt).not.toBeNull();
    expect(warn.mock.calls[0]?.[0]).toContain('reuse detected');
  });

  it('does not log again once the family is already dead', () => {
    // The bound on this log line: reaching it needs a real token, and every
    // later presentation of it finds the family revoked and takes the silent
    // path. It is not a flooding primitive.
    const warn = captureWarnings();
    const handset = pairHandset();
    refreshWith(handset);
    refreshWith(handset);
    warn.mockClear();

    refreshWith(handset);

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('tokens that cannot be spent', () => {
  it('refuses a token nobody issued', () => {
    const handset = pairHandset();

    const result = refreshWith({
      refreshToken: generateRefreshToken(),
      privateKey: handset.privateKey,
    });

    expect(result).toEqual({ outcome: 'rejected' });
  });

  it('refuses an expired refresh token', () => {
    const handset = pairHandset({ expiresAt: new Date(Date.now() + 60_000).toISOString() });

    const result = refreshWith(handset, { now: () => new Date(Date.now() + 120_000) });

    expect(result).toEqual({ outcome: 'rejected' });
    expect(rowFor(handset.refreshToken).consumedAt).toBeNull();
  });

  it('honours a token at the last moment before it expires', () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const handset = pairHandset({ expiresAt: expiresAt.toISOString() });

    const result = refreshWith(handset, { now: () => new Date(expiresAt.getTime() - 1) });

    expect(result.outcome).toBe('refreshed');
  });

  it('refuses a token whose device was revoked, and says so distinctly', () => {
    const handset = pairHandset();
    db()
      .update(devices)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(devices.id, handset.deviceId))
      .run();

    // `device-revoked`, not `rejected`. They select different recoveries on the
    // phone and only one of them means "wipe the keychain".
    expect(refreshWith(handset)).toEqual({ outcome: 'device-revoked' });
  });

  it('answers device-revoked ahead of anything about the token itself', () => {
    // `revokeDevice` kills the family in the same transaction, so a revoked
    // device's token is also a revoked token. Checking the device first is what
    // stops that arriving as a bare 401 the app cannot act on.
    const handset = pairHandset();
    db()
      .update(refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(refreshTokens.familyId, handset.familyId))
      .run();
    db()
      .update(devices)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(devices.id, handset.deviceId))
      .run();

    expect(refreshWith(handset)).toEqual({ outcome: 'device-revoked' });
  });

  it('refuses a revoked token whose device is still trusted', () => {
    const handset = pairHandset();
    db()
      .update(refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(refreshTokens.familyId, handset.familyId))
      .run();

    expect(refreshWith(handset)).toEqual({ outcome: 'rejected' });
  });

  it('refuses a token whose device row is gone rather than claiming a revocation', () => {
    // A state the schema forbids: the FK cascades, so a live token cannot
    // outlive its device through any write this pillar makes. It is reachable
    // only through a restore or a hand-edited file, which is why the pragma is
    // dropped to build it — the assertion is about what the exchange does when
    // it finds one, and `rejected` rather than `device-revoked` is the point.
    // Telling the phone it was revoked would send it to a screen explaining an
    // event that did not happen.
    const handset = pairHandset();
    const raw = requireRow(open, 'temp db').opened.raw;
    raw.pragma('foreign_keys = OFF');
    db().delete(devices).where(eq(devices.id, handset.deviceId)).run();
    raw.pragma('foreign_keys = ON');

    expect(refreshWith(handset)).toEqual({ outcome: 'rejected' });
  });
});
