/**
 * The refresh-token primitives, as distinct from the table.
 *
 * `refresh-tokens.test.ts` next door proves the schema — the FK, the unique
 * `replacedBy`, the CHECKs. What is proved here is the three things the
 * pairing exchange relies on and the table cannot enforce: that the draw is
 * wide and unpredictable, that the digest is what lands in the column, and
 * that the plaintext never does.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_REFRESH_TOKEN_TTL_MS,
  devices,
  generateRefreshToken,
  hashRefreshToken,
  insertRefreshToken,
  REFRESH_TOKEN_BYTES,
  refreshTokens,
} from '../index.js';
import { deviceRow, openTempDb, requireRow } from './helpers.js';

import type { OpenedBfmDb } from '../index.js';

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
