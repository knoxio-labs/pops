/**
 * The refresh-token primitives, as distinct from the table.
 *
 * `refresh-tokens.test.ts` next door proves the schema — the FK, the unique
 * `replacedBy`, the CHECKs. What is proved here is the three things the
 * pairing exchange relies on and the table cannot enforce: that the draw is
 * wide and unpredictable, that the digest is what lands in the column, and
 * that the plaintext never does.
 */
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_REFRESH_TOKEN_TTL_MS,
  devices,
  findRefreshTokenByHash,
  generateRefreshToken,
  hashRefreshToken,
  insertRefreshToken,
  REFRESH_TOKEN_BYTES,
  refreshTokens,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
} from '../index.js';
import { deviceRow, openTempDb, requireRow } from './helpers.js';

import type { InsertRefreshTokenValues, OpenedBfmDb } from '../index.js';

let open: { opened: OpenedBfmDb; cleanup: () => void } | undefined;

function db(): OpenedBfmDb['db'] {
  open ??= openTempDb();
  return open.opened.db;
}

afterEach(() => {
  open?.cleanup();
  open = undefined;
});

describe('generateRefreshToken', () => {
  it('draws the full declared width', () => {
    // base64url of N bytes, so the decode is the assertion that matters — a
    // generator that quietly halved its entropy would still look like a long
    // opaque string.
    expect(Buffer.from(generateRefreshToken(), 'base64url')).toHaveLength(REFRESH_TOKEN_BYTES);
  });

  it('is URL- and header-safe, so no encoding hop can alter it in transit', () => {
    for (let i = 0; i < 64; i += 1) {
      expect(generateRefreshToken()).toMatch(/^[A-Za-z0-9_-]+$/u);
    }
  });

  it('never repeats across a run', () => {
    const drawn = new Set(Array.from({ length: 512 }, () => generateRefreshToken()));

    expect(drawn.size).toBe(512);
  });
});

describe('hashRefreshToken', () => {
  it('is a hex SHA-256 — the form the column stores', () => {
    expect(hashRefreshToken('anything')).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('is stable, so a presented token finds its own row', () => {
    const token = generateRefreshToken();

    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });

  it('separates tokens that differ by one character', () => {
    expect(hashRefreshToken('token-a')).not.toBe(hashRefreshToken('token-b'));
  });
});

describe('insertRefreshToken', () => {
  it('writes the digest and nothing that could reconstruct the token', () => {
    const device = deviceRow();
    db().insert(devices).values(device).run();
    const token = generateRefreshToken();
    const createdAt = new Date().toISOString();

    insertRefreshToken(db(), {
      tokenHash: hashRefreshToken(token),
      deviceId: device.id,
      familyId: crypto.randomUUID(),
      expiresAt: new Date(Date.now() + DEFAULT_REFRESH_TOKEN_TTL_MS).toISOString(),
      createdAt,
    });

    const row = requireRow(db().select().from(refreshTokens).get(), 'refresh token');
    expect(row.tokenHash).toBe(hashRefreshToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.consumedAt).toBeNull();
    expect(row.revokedAt).toBeNull();
    expect(row.replacedBy).toBeNull();
  });

  it('refuses a row whose expiry precedes its creation', () => {
    // The table's CHECK, reached through this function — the reason it writes
    // `createdAt` explicitly instead of letting SQLite's clock fill it.
    const device = deviceRow();
    db().insert(devices).values(device).run();
    const now = new Date();

    expect(() =>
      insertRefreshToken(db(), {
        tokenHash: hashRefreshToken(generateRefreshToken()),
        deviceId: device.id,
        familyId: crypto.randomUUID(),
        expiresAt: new Date(now.getTime() - 1_000).toISOString(),
        createdAt: now.toISOString(),
      })
    ).toThrow(/CHECK constraint failed/iu);
  });

  it('refuses a token for a device that does not exist', () => {
    expect(() =>
      insertRefreshToken(db(), {
        tokenHash: hashRefreshToken(generateRefreshToken()),
        deviceId: 'no-such-device',
        familyId: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
      })
    ).toThrow(/FOREIGN KEY constraint failed/iu);
  });
});

describe('DEFAULT_REFRESH_TOKEN_TTL_MS', () => {
  it('is thirty days — the drawer limit, not the phone-works-for limit', () => {
    expect(DEFAULT_REFRESH_TOKEN_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

/**
 * A device with one live refresh token — the state pairing leaves behind, and
 * the starting point for every rotation below.
 */
function pairedDevice(): { deviceId: string; familyId: string; tokenHash: string } {
  const device = deviceRow();
  db().insert(devices).values(device).run();
  const familyId = crypto.randomUUID();
  const tokenHash = hashRefreshToken(generateRefreshToken());
  insertRefreshToken(db(), {
    tokenHash,
    deviceId: device.id,
    familyId,
    expiresAt: new Date(Date.now() + DEFAULT_REFRESH_TOKEN_TTL_MS).toISOString(),
    createdAt: new Date().toISOString(),
  });
  return { deviceId: device.id, familyId, tokenHash };
}

function successorOf(
  seed: { deviceId: string; familyId: string },
  at: Date = new Date()
): InsertRefreshTokenValues {
  return {
    tokenHash: hashRefreshToken(generateRefreshToken()),
    deviceId: seed.deviceId,
    familyId: seed.familyId,
    expiresAt: new Date(at.getTime() + DEFAULT_REFRESH_TOKEN_TTL_MS).toISOString(),
    createdAt: at.toISOString(),
  };
}

function rowFor(tokenHash: string) {
  return requireRow(
    db().select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).get(),
    `refresh token ${tokenHash}`
  );
}

describe('findRefreshTokenByHash', () => {
  it('finds a live token by its digest', () => {
    const seed = pairedDevice();

    expect(findRefreshTokenByHash(db(), seed.tokenHash)).toMatchObject({
      tokenHash: seed.tokenHash,
      deviceId: seed.deviceId,
      familyId: seed.familyId,
      consumedAt: null,
      revokedAt: null,
    });
  });

  it('is undefined for a digest nobody issued', () => {
    pairedDevice();

    expect(findRefreshTokenByHash(db(), hashRefreshToken('never issued'))).toBeUndefined();
  });

  it('never selects `replacedBy`, so a successor cannot leak into a response', () => {
    const seed = pairedDevice();
    const successor = successorOf(seed);
    rotateRefreshToken(db(), {
      presentedHash: seed.tokenHash,
      successor,
      consumedAt: new Date().toISOString(),
    });

    // The column is set — the row below proves the chain is walkable — and the
    // read path still does not carry it.
    expect(rowFor(seed.tokenHash).replacedBy).toBe(successor.tokenHash);
    expect(findRefreshTokenByHash(db(), seed.tokenHash)).not.toHaveProperty('replacedBy');
  });
});

describe('rotateRefreshToken', () => {
  it('spends the presented token and links it to its successor', () => {
    const seed = pairedDevice();
    const successor = successorOf(seed);
    const consumedAt = new Date().toISOString();

    const result = rotateRefreshToken(db(), {
      presentedHash: seed.tokenHash,
      successor,
      consumedAt,
    });

    expect(result).toEqual({ outcome: 'rotated' });
    const predecessor = rowFor(seed.tokenHash);
    expect(predecessor.consumedAt).toBe(consumedAt);
    expect(predecessor.replacedBy).toBe(successor.tokenHash);
    // Spent, NOT killed. The two columns answer different forensic questions
    // and collapsing them would make a normal rotation read as a theft.
    expect(predecessor.revokedAt).toBeNull();
    expect(rowFor(successor.tokenHash)).toMatchObject({
      familyId: seed.familyId,
      consumedAt: null,
      revokedAt: null,
      replacedBy: null,
    });
  });

  it('refuses to rotate the same token twice, and writes nothing on the second try', () => {
    const seed = pairedDevice();
    const first = successorOf(seed);
    rotateRefreshToken(db(), {
      presentedHash: seed.tokenHash,
      successor: first,
      consumedAt: new Date().toISOString(),
    });

    const second = successorOf(seed);
    const result = rotateRefreshToken(db(), {
      presentedHash: seed.tokenHash,
      successor: second,
      consumedAt: new Date().toISOString(),
    });

    expect(result).toEqual({ outcome: 'not-rotated' });
    // The whole point of the sentinel rollback: a losing rotation must not
    // leave a second live token in the family behind it.
    expect(findRefreshTokenByHash(db(), second.tokenHash)).toBeUndefined();
    expect(rowFor(seed.tokenHash).replacedBy).toBe(first.tokenHash);
  });

  it('refuses to rotate a revoked token, even one never consumed', () => {
    const seed = pairedDevice();
    revokeRefreshTokenFamily(db(), seed.familyId, new Date().toISOString());
    const successor = successorOf(seed);

    const result = rotateRefreshToken(db(), {
      presentedHash: seed.tokenHash,
      successor,
      consumedAt: new Date().toISOString(),
    });

    expect(result).toEqual({ outcome: 'not-rotated' });
    expect(findRefreshTokenByHash(db(), successor.tokenHash)).toBeUndefined();
  });

  it('rolls the successor back rather than reporting a rotation that did not happen', () => {
    // An unknown predecessor is the same shape of failure as a raced one: the
    // conditional UPDATE matches nothing. What is asserted is that the insert
    // does not survive it.
    const seed = pairedDevice();
    const successor = successorOf(seed);

    const result = rotateRefreshToken(db(), {
      presentedHash: hashRefreshToken('a token from another deployment'),
      successor,
      consumedAt: new Date().toISOString(),
    });

    expect(result).toEqual({ outcome: 'not-rotated' });
    expect(db().select().from(refreshTokens).all()).toHaveLength(1);
  });

  it('lets a real database error through rather than reporting a lost race', () => {
    const seed = pairedDevice();

    expect(() =>
      rotateRefreshToken(db(), {
        presentedHash: seed.tokenHash,
        // Expiry before creation: the table's CHECK rejects the successor
        // insert, which is a bug in the caller and not a race.
        successor: { ...successorOf(seed), expiresAt: '1999-01-01T00:00:00.000Z' },
        consumedAt: new Date().toISOString(),
      })
    ).toThrow(/CHECK constraint failed/iu);
    expect(rowFor(seed.tokenHash).consumedAt).toBeNull();
  });
});

describe('revokeRefreshTokenFamily', () => {
  it('kills every live token in the family, spent ones included', () => {
    const seed = pairedDevice();
    const successor = successorOf(seed);
    rotateRefreshToken(db(), {
      presentedHash: seed.tokenHash,
      successor,
      consumedAt: new Date().toISOString(),
    });
    const revokedAt = new Date().toISOString();

    expect(revokeRefreshTokenFamily(db(), seed.familyId, revokedAt)).toBe(2);

    // The consumed predecessor is killed too. Leaving it alive would leave the
    // fork's other branch redeemable, which is the state this call exists to end.
    expect(rowFor(seed.tokenHash).revokedAt).toBe(revokedAt);
    expect(rowFor(successor.tokenHash).revokedAt).toBe(revokedAt);
  });

  it('leaves another family untouched', () => {
    const mine = pairedDevice();
    const theirs = pairedDevice();

    revokeRefreshTokenFamily(db(), mine.familyId, new Date().toISOString());

    expect(rowFor(theirs.tokenHash).revokedAt).toBeNull();
  });

  it('preserves the instant that killed a token rather than moving it', () => {
    const seed = pairedDevice();
    const firstKill = new Date(Date.now() - 60_000).toISOString();
    revokeRefreshTokenFamily(db(), seed.familyId, firstKill);

    expect(revokeRefreshTokenFamily(db(), seed.familyId, new Date().toISOString())).toBe(0);

    expect(rowFor(seed.tokenHash).revokedAt).toBe(firstKill);
  });
});
