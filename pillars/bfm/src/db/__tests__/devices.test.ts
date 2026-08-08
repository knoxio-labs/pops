import { createPublicKey } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { devices, refreshTokens } from '../schema.js';
import {
  deviceRow,
  openTempDb,
  refreshTokenRow,
  requireRow,
  spkiPublicKeyBase64,
} from './helpers.js';

import type { OpenedBfmDb } from '../index.js';

let opened: OpenedBfmDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
});

afterEach(() => {
  cleanup();
});

describe('a device row', () => {
  it('round-trips a public key that node:crypto can still parse', () => {
    // The encoding claim in the column's docstring — base64 of SPKI/DER — is
    // only worth anything if the bytes that come back verify signatures.
    // Anything that quietly mangles them (base64url, a stray newline, a
    // TEXT coercion) fails here rather than as an unexplained 401 later.
    const row = deviceRow();
    opened.db.insert(devices).values(row).run();

    const stored = requireRow(
      opened.db.select().from(devices).where(eq(devices.id, row.id)).get(),
      'device'
    );
    expect(stored.publicKeyDer).toBe(row.publicKeyDer);

    const key = createPublicKey({
      key: Buffer.from(stored.publicKeyDer, 'base64'),
      format: 'der',
      type: 'spki',
    });
    expect(key.asymmetricKeyType).toBe('ec');
    expect(key.asymmetricKeyDetails?.namedCurve).toBe('prime256v1');
  });

  it('defaults createdAt and lastSeenAt to the same ISO-8601 instant', () => {
    opened.db.insert(devices).values(deviceRow()).run();

    const stored = requireRow(opened.db.select().from(devices).get(), 'device');
    expect(stored.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // Equal timestamps are how "paired, never heard from again" is written.
    expect(stored.lastSeenAt).toBe(stored.createdAt);
    expect(stored.revokedAt).toBeNull();
  });

  it('accepts a second device presenting the same public key', () => {
    // A handset that re-pairs after revocation presents the same Secure
    // Enclave key — it survives app reinstalls. A unique index on the key
    // would make revocation a permanent lockout for that phone.
    const publicKeyDer = spkiPublicKeyBase64();
    opened.db.insert(devices).values(deviceRow({ publicKeyDer })).run();

    expect(() => opened.db.insert(devices).values(deviceRow({ publicKeyDer })).run()).not.toThrow();
    expect(opened.db.select().from(devices).all()).toHaveLength(2);
  });

  it('refuses a row with no public key', () => {
    // Raw SQL because drizzle will not let the invalid row be expressed: the
    // insert type requires `publicKeyDer`, which is exactly the constraint
    // under test. Going around the ORM is the only way to prove the database
    // itself refuses it rather than the types.
    expect(() =>
      opened.raw
        .prepare(`INSERT INTO devices (id, name, model) VALUES ('d1', 'phone', 'iPhone17,1')`)
        .run()
    ).toThrow(/NOT NULL/i);
  });
});

describe('revocation', () => {
  it('is a soft delete — the row and its key survive', () => {
    const device = deviceRow();
    opened.db.insert(devices).values(device).run();

    const revokedAt = new Date().toISOString();
    opened.db.update(devices).set({ revokedAt }).where(eq(devices.id, device.id)).run();

    const stored = requireRow(
      opened.db.select().from(devices).where(eq(devices.id, device.id)).get(),
      'revoked device'
    );
    expect(stored.revokedAt).toBe(revokedAt);
    expect(stored.publicKeyDer).toBe(device.publicKeyDer);
    expect(stored.name).toBe(device.name);
  });

  it('leaves the revoked device’s tokens in place to be traced', () => {
    // The question asked after a phone is stolen is which tokens it held. A
    // revocation that took the token rows with it could not answer it.
    const device = deviceRow();
    opened.db.insert(devices).values(device).run();
    const token = refreshTokenRow(device.id);
    opened.db.insert(refreshTokens).values(token).run();

    opened.db
      .update(devices)
      .set({ revokedAt: new Date().toISOString() })
      .where(eq(devices.id, device.id))
      .run();

    const stored = requireRow(
      opened.db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, token.tokenHash))
        .get(),
      'token of a revoked device'
    );
    expect(stored.deviceId).toBe(device.id);
    expect(stored.familyId).toBe(token.familyId);
  });
});
