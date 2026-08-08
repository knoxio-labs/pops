/**
 * Retention for `pairing_codes` and `refresh_tokens`, against a real
 * migrated database.
 *
 * The refresh-token half is the one that matters: `screenPresentedGrant` in
 * `api/auth/refresh-exchange.ts` treats a presented, already-consumed token
 * as evidence of theft and burns its whole family. These tests exist to
 * prove the sweeper respects that — a row still inside its retention window
 * survives a prune pass exactly as it needs to for reuse detection to keep
 * working, and only a row that has been dead longer than the window goes.
 * A suite that only asserted deletion would miss the one failure mode this
 * ticket exists to prevent.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { devices, pairingCodes, refreshTokens } from '../schema.js';
import {
  findRefreshTokenByHash,
  PAIRING_CODE_RETENTION_MS,
  pruneDeadRefreshTokens,
  prunePairingCodes,
  REFRESH_TOKEN_RETENTION_MS,
} from '../services/index.js';
import { deviceRow, openTempDb, pairingCodeRow, refreshTokenRow } from './helpers.js';

import type { OpenedBfmDb } from '../index.js';

let opened: OpenedBfmDb;
let cleanup: () => void;
let deviceId: string;

const NOW = new Date('2026-08-08T12:00:00.000Z');
const RETENTION_MS = 1_000;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  const device = deviceRow();
  opened.db.insert(devices).values(device).run();
  deviceId = device.id;
});

afterEach(() => {
  cleanup();
});

function isoOffset(ms: number): string {
  return new Date(NOW.getTime() + ms).toISOString();
}

function remainingPairingCodeHashes(): string[] {
  return opened.db
    .select({ codeHash: pairingCodes.codeHash })
    .from(pairingCodes)
    .all()
    .map((row) => row.codeHash);
}

function remainingRefreshTokenHashes(): string[] {
  return opened.db
    .select({ tokenHash: refreshTokens.tokenHash })
    .from(refreshTokens)
    .all()
    .map((row) => row.tokenHash);
}

describe('the module constants', () => {
  it('gives pairing codes a week', () => {
    expect(PAIRING_CODE_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('ties refresh-token retention to the token TTL rather than an independent number', () => {
    // See the module header: anything shorter would let a consumed row be
    // pruned while its still-live successor is in active use, which is the
    // exact way this sweeper could silently disable reuse detection.
    expect(REFRESH_TOKEN_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('prunePairingCodes', () => {
  it('deletes a code consumed past the retention window', () => {
    const code = pairingCodeRow({
      createdAt: isoOffset(-10_000),
      expiresAt: isoOffset(-9_000),
      consumedAt: isoOffset(-2_000),
    });
    opened.db.insert(pairingCodes).values(code).run();

    const deleted = prunePairingCodes(opened.db, { now: () => NOW, retentionMs: RETENTION_MS });

    expect(deleted).toBe(1);
    expect(remainingPairingCodeHashes()).toEqual([]);
  });

  it('leaves a code consumed inside the retention window', () => {
    const code = pairingCodeRow({
      createdAt: isoOffset(-10_000),
      expiresAt: isoOffset(-9_000),
      consumedAt: isoOffset(-500),
    });
    opened.db.insert(pairingCodes).values(code).run();

    const deleted = prunePairingCodes(opened.db, { now: () => NOW, retentionMs: RETENTION_MS });

    expect(deleted).toBe(0);
    expect(remainingPairingCodeHashes()).toEqual([code.codeHash]);
  });

  it('deletes an unredeemed code that expired past the retention window', () => {
    const code = pairingCodeRow({
      createdAt: isoOffset(-10_000),
      expiresAt: isoOffset(-2_000),
    });
    opened.db.insert(pairingCodes).values(code).run();

    const deleted = prunePairingCodes(opened.db, { now: () => NOW, retentionMs: RETENTION_MS });

    expect(deleted).toBe(1);
  });

  it('leaves an unredeemed code that only just expired', () => {
    const code = pairingCodeRow({
      createdAt: isoOffset(-10_000),
      expiresAt: isoOffset(-500),
    });
    opened.db.insert(pairingCodes).values(code).run();

    const deleted = prunePairingCodes(opened.db, { now: () => NOW, retentionMs: RETENTION_MS });

    expect(deleted).toBe(0);
  });

  it('never touches a live, unexpired code', () => {
    const code = pairingCodeRow({
      createdAt: isoOffset(-1_000),
      expiresAt: isoOffset(60_000),
    });
    opened.db.insert(pairingCodes).values(code).run();

    const deleted = prunePairingCodes(opened.db, { now: () => NOW, retentionMs: RETENTION_MS });

    expect(deleted).toBe(0);
    expect(remainingPairingCodeHashes()).toEqual([code.codeHash]);
  });

  it('leaves another table alone — the delete is scoped to pairing_codes', () => {
    const token = refreshTokenRow(deviceId, {
      createdAt: isoOffset(-1_000),
      expiresAt: isoOffset(60_000),
    });
    opened.db.insert(refreshTokens).values(token).run();
    const code = pairingCodeRow({
      createdAt: isoOffset(-10_000),
      expiresAt: isoOffset(-9_000),
      consumedAt: isoOffset(-2_000),
    });
    opened.db.insert(pairingCodes).values(code).run();

    prunePairingCodes(opened.db, { now: () => NOW, retentionMs: RETENTION_MS });

    expect(remainingRefreshTokenHashes()).toEqual([token.tokenHash]);
  });
});

describe('pruneDeadRefreshTokens', () => {
  it('leaves a token consumed inside the retention window — the row reuse detection still needs', () => {
    const first = refreshTokenRow(deviceId, {
      createdAt: isoOffset(-20_000),
      expiresAt: isoOffset(60_000),
    });
    opened.db.insert(refreshTokens).values(first).run();
    const second = refreshTokenRow(deviceId, {
      familyId: first.familyId,
      createdAt: isoOffset(-500),
      expiresAt: isoOffset(60_000),
    });
    opened.db.insert(refreshTokens).values(second).run();
    opened.db
      .update(refreshTokens)
      .set({ consumedAt: isoOffset(-500), replacedBy: second.tokenHash })
      .where(eq(refreshTokens.tokenHash, first.tokenHash))
      .run();

    const deleted = pruneDeadRefreshTokens(opened.db, {
      now: () => NOW,
      retentionMs: RETENTION_MS,
    });

    expect(deleted).toBe(0);
    // Still there, and still readable as consumed — exactly what
    // `screenPresentedGrant` checks to burn a family on replay. Deleting
    // this row is what would have turned the replay into a silent "unknown
    // token" instead.
    expect(findRefreshTokenByHash(opened.db, first.tokenHash)).toMatchObject({
      consumedAt: isoOffset(-500),
    });
  });

  it('deletes a consumed token once its successor has also gone dead past the window', () => {
    const first = refreshTokenRow(deviceId, {
      createdAt: isoOffset(-20_000),
      expiresAt: isoOffset(-19_000),
    });
    opened.db.insert(refreshTokens).values(first).run();
    const second = refreshTokenRow(deviceId, {
      familyId: first.familyId,
      createdAt: isoOffset(-8_000),
      // Never rotated further, and this expiry is already in the past: the
      // family went quiet rather than staying alive through more
      // generations. Nothing left in it needs the deleted row as evidence.
      expiresAt: isoOffset(-6_000),
    });
    opened.db.insert(refreshTokens).values(second).run();
    opened.db
      .update(refreshTokens)
      .set({ consumedAt: isoOffset(-8_000), replacedBy: second.tokenHash })
      .where(eq(refreshTokens.tokenHash, first.tokenHash))
      .run();

    const deleted = pruneDeadRefreshTokens(opened.db, {
      now: () => NOW,
      retentionMs: RETENTION_MS,
    });

    expect(deleted).toBe(2);
    expect(remainingRefreshTokenHashes()).toEqual([]);
  });

  it('never deletes a live, unconsumed token no matter how old its createdAt is', () => {
    const token = refreshTokenRow(deviceId, {
      createdAt: isoOffset(-50_000),
      expiresAt: isoOffset(600_000),
    });
    opened.db.insert(refreshTokens).values(token).run();

    const deleted = pruneDeadRefreshTokens(opened.db, {
      now: () => NOW,
      retentionMs: RETENTION_MS,
    });

    expect(deleted).toBe(0);
    expect(remainingRefreshTokenHashes()).toEqual([token.tokenHash]);
  });

  it('deletes a token revoked past the retention window', () => {
    const token = refreshTokenRow(deviceId, {
      createdAt: isoOffset(-20_000),
      expiresAt: isoOffset(60_000),
      revokedAt: isoOffset(-5_000),
    });
    opened.db.insert(refreshTokens).values(token).run();

    const deleted = pruneDeadRefreshTokens(opened.db, {
      now: () => NOW,
      retentionMs: RETENTION_MS,
    });

    expect(deleted).toBe(1);
  });

  it('leaves a token revoked inside the retention window', () => {
    const token = refreshTokenRow(deviceId, {
      createdAt: isoOffset(-20_000),
      expiresAt: isoOffset(60_000),
      revokedAt: isoOffset(-200),
    });
    opened.db.insert(refreshTokens).values(token).run();

    const deleted = pruneDeadRefreshTokens(opened.db, {
      now: () => NOW,
      retentionMs: RETENTION_MS,
    });

    expect(deleted).toBe(0);
  });

  it('walks a fully dormant three-generation chain oldest-first without tripping the self-FK', () => {
    // The scenario the self-FK's `NO ACTION` exists for: a chain long enough
    // that every generation is independently prune-eligible, so the sweeper
    // has to delete the head before the rows it points at or SQLite refuses.
    const gen1 = refreshTokenRow(deviceId, {
      createdAt: isoOffset(-30_000),
      expiresAt: isoOffset(-29_000),
    });
    opened.db.insert(refreshTokens).values(gen1).run();
    const gen2 = refreshTokenRow(deviceId, {
      familyId: gen1.familyId,
      createdAt: isoOffset(-20_000),
      expiresAt: isoOffset(-19_000),
    });
    opened.db.insert(refreshTokens).values(gen2).run();
    const gen3 = refreshTokenRow(deviceId, {
      familyId: gen1.familyId,
      createdAt: isoOffset(-10_000),
      expiresAt: isoOffset(-9_000),
    });
    opened.db.insert(refreshTokens).values(gen3).run();
    opened.db
      .update(refreshTokens)
      .set({ consumedAt: isoOffset(-20_000), replacedBy: gen2.tokenHash })
      .where(eq(refreshTokens.tokenHash, gen1.tokenHash))
      .run();
    opened.db
      .update(refreshTokens)
      .set({ consumedAt: isoOffset(-10_000), replacedBy: gen3.tokenHash })
      .where(eq(refreshTokens.tokenHash, gen2.tokenHash))
      .run();

    let deleted = -1;
    expect(() => {
      deleted = pruneDeadRefreshTokens(opened.db, { now: () => NOW, retentionMs: RETENTION_MS });
    }).not.toThrow();

    expect(deleted).toBe(3);
    expect(remainingRefreshTokenHashes()).toEqual([]);
  });

  it('leaves another device untouched', () => {
    const otherDevice = deviceRow();
    opened.db.insert(devices).values(otherDevice).run();
    const dead = refreshTokenRow(deviceId, {
      createdAt: isoOffset(-20_000),
      expiresAt: isoOffset(-19_000),
      revokedAt: isoOffset(-5_000),
    });
    const live = refreshTokenRow(otherDevice.id, {
      createdAt: isoOffset(-1_000),
      expiresAt: isoOffset(60_000),
    });
    opened.db.insert(refreshTokens).values([dead, live]).run();

    pruneDeadRefreshTokens(opened.db, { now: () => NOW, retentionMs: RETENTION_MS });

    expect(remainingRefreshTokenHashes()).toEqual([live.tokenHash]);
  });
});
