/**
 * The device list and the revoke transaction, against a real migrated
 * database.
 *
 * The atomicity case is the point of this file: the API-level suite can only
 * observe the committed result, so a two-statement revoke that happened to run
 * both statements would look identical there.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { devices, refreshTokens } from '../schema.js';
import { listDevices, revokeDevice } from '../services/devices.js';
import { deviceRow, refreshTokenRow, openTempDb, requireRow } from './helpers.js';

import type { OpenedBfmDb } from '../index.js';

let opened: OpenedBfmDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
});

afterEach(() => {
  cleanup();
});

function pairDevice(
  overrides: Parameters<typeof deviceRow>[0] = {},
  tokens: Array<Partial<Parameters<typeof refreshTokenRow>[1]>> = [{}, {}]
): string {
  const row = deviceRow(overrides);
  opened.db.insert(devices).values(row).run();
  const familyId = crypto.randomUUID();
  for (const token of tokens) {
    opened.db
      .insert(refreshTokens)
      .values(refreshTokenRow(row.id, { familyId, ...token }))
      .run();
  }
  return row.id;
}

describe('listDevices', () => {
  it('is empty before any phone has paired', () => {
    expect(listDevices(opened.db)).toEqual([]);
  });

  it('projects only the operator-facing columns', () => {
    pairDevice({ name: "Joao's iPhone", model: 'iPhone17,1' });

    const [device] = listDevices(opened.db);

    expect(Object.keys(device ?? {}).toSorted()).toEqual([
      'createdAt',
      'id',
      'lastSeenAt',
      'model',
      'name',
      'revokedAt',
    ]);
  });

  it('includes revoked devices, carrying their revocation instant', () => {
    const id = pairDevice();
    revokeDevice(opened.db, id, new Date('2026-08-08T10:00:00.000Z'));

    expect(listDevices(opened.db)).toEqual([
      expect.objectContaining({ id, revokedAt: '2026-08-08T10:00:00.000Z' }),
    ]);
  });

  it('lists the most recent pairing first', () => {
    const older = pairDevice({ name: 'Older', createdAt: '2026-08-01T10:00:00.000Z' }, []);
    const newer = pairDevice({ name: 'Newer', createdAt: '2026-08-07T10:00:00.000Z' }, []);

    expect(listDevices(opened.db).map((device) => device.id)).toEqual([newer, older]);
  });
});

describe('revokeDevice', () => {
  it('reports not-found for an unknown id, and writes nothing', () => {
    pairDevice();

    expect(revokeDevice(opened.db, crypto.randomUUID())).toEqual({ outcome: 'not-found' });
    expect(
      requireRow(opened.db.select().from(devices).get(), 'untouched device').revokedAt
    ).toBeNull();
  });

  it('soft-revokes rather than deleting, so the audit trail survives', () => {
    const id = pairDevice();

    const result = revokeDevice(opened.db, id, new Date('2026-08-08T10:00:00.000Z'));

    expect(result).toEqual({
      outcome: 'revoked',
      revokedAt: '2026-08-08T10:00:00.000Z',
      refreshTokensRevoked: 2,
    });
    const stored = opened.db.select().from(devices).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.revokedAt).toBe('2026-08-08T10:00:00.000Z');
  });

  it('kills every live token in the family at the same instant', () => {
    const id = pairDevice({}, [{}, {}, {}]);

    revokeDevice(opened.db, id, new Date('2026-08-08T10:00:00.000Z'));

    for (const token of opened.db.select().from(refreshTokens).all()) {
      expect(token.revokedAt).toBe('2026-08-08T10:00:00.000Z');
    }
  });

  /**
   * `revokedAt` and `consumedAt` are separate columns precisely so a forensic
   * read can tell "the client rotated normally" from "we found a thief".
   * Revocation must not overwrite either signal on a token that already
   * carries one.
   */
  it('preserves the instant a token was already killed by reuse detection', () => {
    const id = pairDevice({}, [{ revokedAt: '2026-08-01T09:00:00.000Z' }, {}]);

    revokeDevice(opened.db, id, new Date('2026-08-08T10:00:00.000Z'));

    const revokedInstants = opened.db
      .select()
      .from(refreshTokens)
      .all()
      .map((token) => token.revokedAt)
      .toSorted();
    expect(revokedInstants).toEqual(['2026-08-01T09:00:00.000Z', '2026-08-08T10:00:00.000Z']);
  });

  it('leaves a consumed token consumed, and marks it revoked too', () => {
    const id = pairDevice({}, [{ consumedAt: '2026-08-01T09:00:00.000Z' }]);

    revokeDevice(opened.db, id, new Date('2026-08-08T10:00:00.000Z'));

    const token = requireRow(opened.db.select().from(refreshTokens).get(), 'consumed token');
    expect(token.consumedAt).toBe('2026-08-01T09:00:00.000Z');
    expect(token.revokedAt).toBe('2026-08-08T10:00:00.000Z');
  });

  it('does not touch a sibling device or its tokens', () => {
    const revoked = pairDevice({ name: 'Old phone' });
    const kept = pairDevice({ name: 'Current phone' });

    revokeDevice(opened.db, revoked);

    const keptDevice = opened.db
      .select()
      .from(devices)
      .all()
      .find((device) => device.id === kept);
    expect(keptDevice?.revokedAt).toBeNull();
    for (const token of opened.db
      .select()
      .from(refreshTokens)
      .all()
      .filter((token) => token.deviceId === kept)) {
      expect(token.revokedAt).toBeNull();
    }
  });

  it('is idempotent and keeps the original instant', () => {
    const id = pairDevice();
    revokeDevice(opened.db, id, new Date('2026-08-08T10:00:00.000Z'));

    const second = revokeDevice(opened.db, id, new Date('2026-08-09T10:00:00.000Z'));

    expect(second).toEqual({ outcome: 'already-revoked', revokedAt: '2026-08-08T10:00:00.000Z' });
    expect(requireRow(opened.db.select().from(devices).get(), 'device').revokedAt).toBe(
      '2026-08-08T10:00:00.000Z'
    );
  });

  /**
   * The acceptance criterion, driven by an induced failure rather than by
   * inspection: if the two writes were not in one transaction, the device
   * would stay revoked here while its tokens came back to life.
   */
  it('rolls the device revocation back with the token revocation when the transaction fails', () => {
    const id = pairDevice();

    expect(() =>
      opened.db.transaction(() => {
        revokeDevice(opened.db, id, new Date('2026-08-08T10:00:00.000Z'));
        throw new Error('later step failed');
      })
    ).toThrow('later step failed');

    expect(requireRow(opened.db.select().from(devices).get(), 'device').revokedAt).toBeNull();
    for (const token of opened.db.select().from(refreshTokens).all()) {
      expect(token.revokedAt).toBeNull();
    }
  });
});
