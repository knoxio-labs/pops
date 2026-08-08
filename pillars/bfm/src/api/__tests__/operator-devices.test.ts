/**
 * `GET /operator/devices` and `DELETE /operator/devices/:id`.
 *
 * The revocation cases assert against the database rather than the response,
 * because the property that matters — the token family died with the device —
 * is not visible on the wire at all.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DeviceListSchema } from '../../contract/rest-operator-schemas.js';
import { deviceRow, refreshTokenRow } from '../../db/__tests__/helpers.js';
import { devices, refreshTokens } from '../../db/index.js';
import { createTestApp, PRODUCTION_ENV, type TestApp } from './harness.js';

let harness: TestApp;

beforeEach(() => {
  harness = createTestApp();
});

afterEach(() => {
  harness.cleanup();
});

/** A paired device with `tokenCount` live refresh tokens in one family. */
function pairDevice(overrides: Parameters<typeof deviceRow>[0] = {}, tokenCount = 2): string {
  const row = deviceRow(overrides);
  harness.opened.db.insert(devices).values(row).run();
  const familyId = crypto.randomUUID();
  for (let i = 0; i < tokenCount; i += 1) {
    harness.opened.db.insert(refreshTokens).values(refreshTokenRow(row.id, { familyId })).run();
  }
  return row.id;
}

describe('GET /operator/devices', () => {
  it('returns an empty list before any phone has paired', async () => {
    const res = await request(harness.app).get('/operator/devices');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ devices: [] });
  });

  it('returns a body that satisfies the contract schema', async () => {
    pairDevice();

    const res = await request(harness.app).get('/operator/devices');

    const parsed = DeviceListSchema.safeParse(res.body);
    expect(parsed.error?.issues ?? []).toEqual([]);
  });

  it('reports the operator-facing fields the Devices page renders', async () => {
    pairDevice({ name: "Joao's iPhone", model: 'iPhone17,1' });

    const res = await request(harness.app).get('/operator/devices');

    expect(res.body.devices[0]).toMatchObject({
      name: "Joao's iPhone",
      model: 'iPhone17,1',
      revokedAt: null,
    });
    expect(res.body.devices[0].createdAt).toEqual(expect.any(String));
    expect(res.body.devices[0].lastSeenAt).toEqual(expect.any(String));
  });

  /**
   * The public key is the public half and leaking it signs nothing, but the
   * ticket's line is "never returns a token or a key" — a field that is never
   * serialised cannot be accidentally logged downstream either.
   */
  it('returns no key and no token material', async () => {
    const id = pairDevice();

    const res = await request(harness.app).get('/operator/devices');

    const stored = harness.opened.db.select().from(devices).all();
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(stored[0]?.publicKeyDer);
    expect(res.body.devices[0]).not.toHaveProperty('publicKeyDer');
    const tokens = harness.opened.db.select().from(refreshTokens).all();
    for (const token of tokens) {
      expect(serialized).not.toContain(token.tokenHash);
    }
    expect(res.body.devices[0].id).toBe(id);
  });

  /**
   * Absence would be ambiguous: an operator looking for the phone they just
   * revoked cannot tell "revoked" from "never paired" if the row disappears.
   */
  it('still lists a revoked device, carrying the instant it was cut off', async () => {
    const id = pairDevice();
    await request(harness.app).delete(`/operator/devices/${id}`);

    const res = await request(harness.app).get('/operator/devices');

    expect(res.body.devices).toHaveLength(1);
    expect(res.body.devices[0].revokedAt).toEqual(expect.any(String));
  });

  it('refuses an anonymous caller', async () => {
    harness.cleanup();
    harness = createTestApp({ env: PRODUCTION_ENV });
    pairDevice();

    const res = await request(harness.app).get('/operator/devices');

    expect(res.status).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('iPhone');
  });
});

describe('DELETE /operator/devices/:id', () => {
  it('soft-revokes: the row survives, carrying the instant', async () => {
    const id = pairDevice();

    const res = await request(harness.app).delete(`/operator/devices/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, alreadyRevoked: false });
    const stored = harness.opened.db.select().from(devices).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.revokedAt).toBe(res.body.revokedAt);
  });

  /**
   * The acceptance criterion. Revoking the device without killing its tokens
   * leaves the phone able to rotate its way back in.
   */
  it('kills every live refresh token in the device family, at the same instant', async () => {
    const id = pairDevice({}, 3);

    const res = await request(harness.app).delete(`/operator/devices/${id}`);

    const tokens = harness.opened.db.select().from(refreshTokens).all();
    expect(tokens).toHaveLength(3);
    for (const token of tokens) {
      expect(token.revokedAt).toBe(res.body.revokedAt);
    }
  });

  it('leaves another device and its tokens untouched', async () => {
    const revoked = pairDevice({ name: 'Old phone' }, 2);
    const kept = pairDevice({ name: 'Current phone' }, 2);

    await request(harness.app).delete(`/operator/devices/${revoked}`);

    const keptTokens = harness.opened.db
      .select()
      .from(refreshTokens)
      .all()
      .filter((token) => token.deviceId === kept);
    expect(keptTokens).toHaveLength(2);
    for (const token of keptTokens) {
      expect(token.revokedAt).toBeNull();
    }
    const keptDevice = harness.opened.db
      .select()
      .from(devices)
      .all()
      .find((device) => device.id === kept);
    expect(keptDevice?.revokedAt).toBeNull();
  });

  it('is idempotent, and does not move the original revocation instant', async () => {
    const id = pairDevice();

    const first = await request(harness.app).delete(`/operator/devices/${id}`);
    const second = await request(harness.app).delete(`/operator/devices/${id}`);

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ alreadyRevoked: true, revokedAt: first.body.revokedAt });
    const stored = harness.opened.db.select().from(devices).all();
    expect(stored[0]?.revokedAt).toBe(first.body.revokedAt);
  });

  it('404s an unknown device', async () => {
    const res = await request(harness.app).delete(`/operator/devices/${crypto.randomUUID()}`);

    expect(res.status).toBe(404);
  });

  it('refuses an anonymous caller, and the device stays trusted', async () => {
    harness.cleanup();
    harness = createTestApp({ env: PRODUCTION_ENV });
    const id = pairDevice();

    const res = await request(harness.app).delete(`/operator/devices/${id}`);

    expect(res.status).toBe(401);
    const stored = harness.opened.db.select().from(devices).all();
    expect(stored[0]?.revokedAt).toBeNull();
  });
});
