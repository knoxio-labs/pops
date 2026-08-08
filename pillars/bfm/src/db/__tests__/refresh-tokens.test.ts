import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { devices, refreshTokens } from '../schema.js';
import { deviceRow, openTempDb, refreshTokenRow, requireRow } from './helpers.js';

import type { OpenedBfmDb } from '../index.js';
import type { RefreshTokenInsert } from '../index.js';

let opened: OpenedBfmDb;
let cleanup: () => void;
let deviceId: string;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  const device = deviceRow();
  opened.db.insert(devices).values(device).run();
  deviceId = device.id;
});

afterEach(() => {
  cleanup();
});

/**
 * Rotate `previous` into a fresh token of the same family, in the order the
 * refresh handler has to use: the successor is inserted first, then the old
 * row is marked consumed and pointed at it. The reverse order would set
 * `replacedBy` to a row that does not exist yet and trip the self-FK.
 */
function rotate(previous: RefreshTokenInsert): RefreshTokenInsert {
  const next = refreshTokenRow(previous.deviceId, { familyId: previous.familyId });
  opened.db.insert(refreshTokens).values(next).run();
  opened.db
    .update(refreshTokens)
    .set({ consumedAt: new Date().toISOString(), replacedBy: next.tokenHash })
    .where(eq(refreshTokens.tokenHash, previous.tokenHash))
    .run();
  return next;
}

describe('the rotation chain', () => {
  it('round-trips a family through the self-referential link', () => {
    const first = refreshTokenRow(deviceId);
    opened.db.insert(refreshTokens).values(first).run();
    const second = rotate(first);
    const third = rotate(second);

    const family = opened.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.familyId, first.familyId))
      .all();
    expect(family).toHaveLength(3);

    const byHash = new Map(family.map((row) => [row.tokenHash, row]));
    expect(byHash.get(first.tokenHash)?.replacedBy).toBe(second.tokenHash);
    expect(byHash.get(second.tokenHash)?.replacedBy).toBe(third.tokenHash);
    // Only the live token has no successor — that is what makes it the live one.
    expect(byHash.get(third.tokenHash)?.replacedBy).toBeNull();
    expect(byHash.get(third.tokenHash)?.consumedAt).toBeNull();
  });

  it('refuses a successor that does not exist', () => {
    // Without the foreign key a rotation bug could point at a token nobody
    // holds, and the chain would read as intact while the client was locked out.
    const token = refreshTokenRow(deviceId);
    opened.db.insert(refreshTokens).values(token).run();

    expect(() =>
      opened.db
        .update(refreshTokens)
        .set({ replacedBy: 'no-such-token' })
        .where(eq(refreshTokens.tokenHash, token.tokenHash))
        .run()
    ).toThrow(/FOREIGN KEY/i);
  });

  it('refuses two tokens claiming the same successor', () => {
    // A forked chain is the exact state reuse detection exists to make
    // impossible: two predecessors would mean two parties rotated into one
    // token, and neither could be identified as the thief afterwards.
    const first = refreshTokenRow(deviceId);
    const sibling = refreshTokenRow(deviceId, { familyId: first.familyId });
    opened.db.insert(refreshTokens).values([first, sibling]).run();
    const successor = rotate(first);

    expect(() =>
      opened.db
        .update(refreshTokens)
        .set({ replacedBy: successor.tokenHash })
        .where(eq(refreshTokens.tokenHash, sibling.tokenHash))
        .run()
    ).toThrow(/UNIQUE/i);
  });

  it('refuses a token that succeeds itself', () => {
    // A one-element cycle reads as a valid chain to anything walking it.
    const token = refreshTokenRow(deviceId);
    opened.db.insert(refreshTokens).values(token).run();

    expect(() =>
      opened.db
        .update(refreshTokens)
        .set({ replacedBy: token.tokenHash })
        .where(eq(refreshTokens.tokenHash, token.tokenHash))
        .run()
    ).toThrow(/CHECK constraint failed/i);
  });

  it('prunes oldest-first and refuses to sever a chain from the middle', () => {
    // The reason the self-FK is NO ACTION rather than cascading. Retention
    // pruning walks forward from the pairing exchange; deleting a successor
    // while its predecessor still names it is a bug, and is refused.
    const first = refreshTokenRow(deviceId);
    opened.db.insert(refreshTokens).values(first).run();
    const second = rotate(first);

    expect(() =>
      opened.db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, second.tokenHash)).run()
    ).toThrow(/FOREIGN KEY/i);

    opened.db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, first.tokenHash)).run();
    expect(() =>
      opened.db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, second.tokenHash)).run()
    ).not.toThrow();
  });
});

describe('killed and spent are different states', () => {
  it('records revocation without claiming the token was rotated', () => {
    // Collapsing the two would make "the client rotated normally" and "we
    // found a thief" indistinguishable in the forensic read that has to tell
    // them apart.
    const token = refreshTokenRow(deviceId);
    opened.db.insert(refreshTokens).values(token).run();

    const revokedAt = new Date().toISOString();
    opened.db
      .update(refreshTokens)
      .set({ revokedAt })
      .where(eq(refreshTokens.tokenHash, token.tokenHash))
      .run();

    const stored = requireRow(opened.db.select().from(refreshTokens).get(), 'revoked token');
    expect(stored.revokedAt).toBe(revokedAt);
    expect(stored.consumedAt).toBeNull();
    expect(stored.replacedBy).toBeNull();
  });

  it('kills a whole family in one statement', () => {
    const first = refreshTokenRow(deviceId);
    opened.db.insert(refreshTokens).values(first).run();
    rotate(rotate(first));
    const bystander = refreshTokenRow(deviceId);
    opened.db.insert(refreshTokens).values(bystander).run();

    opened.db
      .update(refreshTokens)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(refreshTokens.familyId, first.familyId))
      .run();

    const rows = opened.db.select().from(refreshTokens).all();
    const killed = rows.filter((row) => row.revokedAt !== null);
    expect(killed).toHaveLength(3);
    expect(killed.every((row) => row.familyId === first.familyId)).toBe(true);
    // A second pairing of the same handset is its own family and survives.
    expect(rows.find((row) => row.tokenHash === bystander.tokenHash)?.revokedAt).toBeNull();
  });
});

describe('a token cannot outlive its device row', () => {
  it('is removed when the device is genuinely deleted', () => {
    const token = refreshTokenRow(deviceId);
    opened.db.insert(refreshTokens).values(token).run();

    opened.db.delete(devices).where(eq(devices.id, deviceId)).run();

    expect(opened.db.select().from(refreshTokens).all()).toEqual([]);
  });

  it('takes a whole rotation chain with it', () => {
    const first = refreshTokenRow(deviceId);
    opened.db.insert(refreshTokens).values(first).run();
    rotate(rotate(first));

    opened.db.delete(devices).where(eq(devices.id, deviceId)).run();

    expect(opened.db.select().from(refreshTokens).all()).toEqual([]);
  });

  it('refuses to exist for a device that never did', () => {
    expect(() =>
      opened.db.insert(refreshTokens).values(refreshTokenRow('no-such-device')).run()
    ).toThrow(/FOREIGN KEY/i);
  });
});

describe('expiry', () => {
  it('refuses a token that expires before it exists', () => {
    expect(() =>
      opened.db
        .insert(refreshTokens)
        .values(refreshTokenRow(deviceId, { expiresAt: '2000-01-01T00:00:00.000Z' }))
        .run()
    ).toThrow(/CHECK constraint failed/i);
  });
});
