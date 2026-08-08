/**
 * The exchange as a unit, for the properties HTTP cannot reach.
 *
 * `api/__tests__/device-pairing.test.ts` drives the route and covers what a
 * caller can observe. What is left here is the inside of the transaction: that
 * a failure partway through leaves nothing behind, and that the ordering the
 * module's header argues for is the ordering it actually has.
 *
 * The rollback case is driven by a **real database error**, not a test-only
 * hook. The seam is `generateRefreshToken`, which the exchange takes as an
 * injectable dependency: hand it a value whose digest is already in
 * `refresh_tokens` and the insert violates the primary key — after the code has
 * been spent and the device written. That is the exact interleaving the
 * transaction exists for, and a hook that threw on request would prove
 * something weaker (that a throw rolls back) than what is asserted here (that
 * the third of three writes failing undoes the first two).
 */
import { describe, expect, it } from 'vitest';

import {
  deviceRow,
  openTempDb,
  refreshTokenRow,
  spkiPublicKeyBase64,
} from '../../../db/__tests__/helpers.js';
import {
  devices,
  generatePairingCode,
  hashRefreshToken,
  issuePairingCode,
  pairingCodes,
  refreshTokens,
} from '../../../db/index.js';
import { testSigningKey } from '../../__tests__/harness.js';
import { verifyAccessToken } from '../access-token.js';
import { completePairingExchange, type PairingExchangeInput } from '../pairing-exchange.js';

import type { BfmDb } from '../../../db/index.js';

function input(overrides: Partial<PairingExchangeInput> = {}): PairingExchangeInput {
  return {
    code: generatePairingCode(),
    publicKey: spkiPublicKeyBase64(),
    deviceName: "Joao's iPhone",
    deviceModel: 'iPhone17,1',
    ...overrides,
  };
}

function withDb<T>(body: (db: BfmDb) => T): T {
  const { opened, cleanup } = openTempDb();
  try {
    return body(opened.db);
  } finally {
    cleanup();
  }
}

/**
 * Set the trap and spring it: a live code, a refresh-token row already holding
 * the digest the exchange is about to write, and the exchange told to draw
 * exactly that plaintext.
 *
 * The collision lands on the third of three writes, after the `UPDATE` that
 * spends the code and the `INSERT` that creates the device — which is the
 * whole point. Returns what survived, for the caller to assert on.
 */
function failMidTransaction(db: BfmDb): { code: string; plantedDeviceId: string } {
  const { code } = issuePairingCode(db);
  const collidingPlaintext = 'a-token-that-is-already-in-the-table';

  const planted = deviceRow();
  db.insert(devices).values(planted).run();
  db.insert(refreshTokens)
    .values(refreshTokenRow(planted.id, { tokenHash: hashRefreshToken(collidingPlaintext) }))
    .run();

  expect(() =>
    completePairingExchange(input({ code }), {
      db,
      accessTokenSigningKey: testSigningKey(),
      generateRefreshToken: () => collidingPlaintext,
    })
  ).toThrow();

  return { code, plantedDeviceId: planted.id };
}

describe('a failure partway through', () => {
  it('rolls back the spent code and the device when the last write fails', () => {
    withDb((db) => {
      const { plantedDeviceId } = failMidTransaction(db);

      // The code is unconsumed. Without the transaction it would have been
      // spent by the `UPDATE` that ran before the failing insert, and the
      // operator would be minting a replacement for a code nothing used.
      const [codeRow] = db.select().from(pairingCodes).all();
      expect(codeRow?.consumedAt).toBeNull();

      // And no orphan device. Only the row the trap planted survives.
      const deviceIds = db
        .select({ id: devices.id })
        .from(devices)
        .all()
        .map((row) => row.id);
      expect(deviceIds).toEqual([plantedDeviceId]);

      expect(db.select().from(refreshTokens).all()).toHaveLength(1);
    });
  });

  it('leaves the code spendable, provably — the retry succeeds', () => {
    // Stronger than reading `consumedAt`: it exercises the same path the
    // handset would, which is the one that matters after a crashed attempt.
    withDb((db) => {
      const { code } = failMidTransaction(db);

      const retried = completePairingExchange(input({ code }), {
        db,
        accessTokenSigningKey: testSigningKey(),
      });

      expect(retried.outcome).toBe('paired');
    });
  });
});

describe('the order of the checks', () => {
  it('rejects a bad key without touching the code', () => {
    withDb((db) => {
      const { code } = issuePairingCode(db);

      const result = completePairingExchange(input({ code, publicKey: 'nonsense' }), {
        db,
        accessTokenSigningKey: testSigningKey(),
      });

      expect(result.outcome).toBe('invalid-key');
      const [row] = db.select().from(pairingCodes).all();
      expect(row?.consumedAt).toBeNull();
    });
  });

  it('rejects a bad key even when the code is also bad, so 400 outranks 403', () => {
    // The oracle this ordering closes: if the code were checked first, a
    // caller could tell a real code from an invented one by whether it got a
    // 403 or a 400 while sending a key it knew was broken.
    withDb((db) => {
      const result = completePairingExchange(input({ publicKey: 'nonsense' }), {
        db,
        accessTokenSigningKey: testSigningKey(),
      });

      expect(result.outcome).toBe('invalid-key');
    });
  });

  it('does not mint anything for a code it will refuse', () => {
    withDb((db) => {
      const result = completePairingExchange(input(), {
        db,
        accessTokenSigningKey: testSigningKey(),
      });

      expect(result).toEqual({ outcome: 'rejected' });
      expect(db.select().from(devices).all()).toHaveLength(0);
      expect(db.select().from(refreshTokens).all()).toHaveLength(0);
    });
  });
});

describe('what a successful exchange produces', () => {
  it('signs the access token with the key it was handed', () => {
    withDb((db) => {
      const signingKey = testSigningKey();
      const { code } = issuePairingCode(db);

      const result = completePairingExchange(input({ code }), {
        db,
        accessTokenSigningKey: signingKey,
      });

      if (result.outcome !== 'paired') throw new Error(`expected paired, got ${result.outcome}`);
      expect(verifyAccessToken(result.accessToken, signingKey).sub).toBe(result.deviceId);
      expect(() =>
        verifyAccessToken(result.accessToken, testSigningKey('a-completely-different-secret'))
      ).toThrow();
    });
  });

  it('stores the refresh token only as a digest of the value it returned', () => {
    withDb((db) => {
      const { code } = issuePairingCode(db);

      const result = completePairingExchange(input({ code }), {
        db,
        accessTokenSigningKey: testSigningKey(),
      });

      if (result.outcome !== 'paired') throw new Error(`expected paired, got ${result.outcome}`);
      const [row] = db.select().from(refreshTokens).all();
      expect(row?.tokenHash).toBe(hashRefreshToken(result.refreshToken));
      expect(row?.tokenHash).not.toBe(result.refreshToken);
    });
  });

  it('gives each pairing its own family, so revoking one cannot reach the other', () => {
    withDb((db) => {
      const first = issuePairingCode(db);
      const second = issuePairingCode(db);

      completePairingExchange(input({ code: first.code }), {
        db,
        accessTokenSigningKey: testSigningKey(),
      });
      completePairingExchange(input({ code: second.code }), {
        db,
        accessTokenSigningKey: testSigningKey(),
      });

      const families = db
        .select({ familyId: refreshTokens.familyId })
        .from(refreshTokens)
        .all()
        .map((row) => row.familyId);
      expect(families).toHaveLength(2);
      expect(new Set(families).size).toBe(2);
    });
  });

  it('uses the injected clock for every timestamp it writes', () => {
    withDb((db) => {
      const at = new Date('2026-03-04T05:06:07.008Z');
      const { code } = issuePairingCode(db, { now: () => at });

      completePairingExchange(input({ code }), {
        db,
        accessTokenSigningKey: testSigningKey(),
        now: () => at,
        refreshTokenTtlMs: 60_000,
      });

      const [device] = db.select().from(devices).all();
      const [token] = db.select().from(refreshTokens).all();
      expect(device?.createdAt).toBe(at.toISOString());
      expect(device?.lastSeenAt).toBe(at.toISOString());
      expect(token?.createdAt).toBe(at.toISOString());
      expect(token?.expiresAt).toBe(new Date(at.getTime() + 60_000).toISOString());
    });
  });

  it('draws a distinct refresh token each time', () => {
    withDb((db) => {
      // Guards the one bug this module deliberately has no retry loop for: a
      // generator that repeats itself would fail on the primary key rather
      // than quietly issue one phone another phone's credential.
      const drawn = new Set<string>();
      for (let i = 0; i < 8; i += 1) {
        const { code } = issuePairingCode(db);
        const result = completePairingExchange(input({ code }), {
          db,
          accessTokenSigningKey: testSigningKey(),
        });
        if (result.outcome !== 'paired') throw new Error(`expected paired, got ${result.outcome}`);
        drawn.add(result.refreshToken);
      }
      expect(drawn.size).toBe(8);
    });
  });
});
