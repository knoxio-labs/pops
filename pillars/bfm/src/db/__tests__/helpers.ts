import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openBfmDb, type OpenedBfmDb } from '../index.js';

import type { DeviceInsert, PairingCodeInsert, RefreshTokenInsert } from '../index.js';

/**
 * Open a throwaway on-disk bfm DB with migrations applied.
 *
 * On disk rather than `:memory:` on purpose: `mkdirSync` on the parent
 * directory, `journal_mode = WAL` and the migration journal are all part of
 * what these tests check, and an in-memory handle takes a different path
 * through the opener for each of them.
 */
export function openTempDb(): { opened: OpenedBfmDb; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'bfm-test-'));
  const opened = openBfmDb(join(dir, 'bfm.db'));
  return {
    opened,
    cleanup: () => {
      opened.raw.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * A real P-256 public key in the exact encoding the phone sends: SPKI/DER,
 * base64. Generated rather than hard-coded so a test that later parses it
 * back through `node:crypto` is exercising a genuine key, and so no two
 * devices in a test accidentally share one.
 */
export function spkiPublicKeyBase64(): string {
  const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

/** The stored form of a bearer-shaped secret. The plaintext never reaches the DB. */
export function hashSecret(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

function isoOffsetFromNow(millis: number): string {
  return new Date(Date.now() + millis).toISOString();
}

/**
 * Narrow a `.get()` result, which is `T | undefined` for every query. Throws
 * rather than returning a default: a missing row in these tests is a broken
 * assumption, and continuing past it produces a confusing failure two
 * assertions later.
 */
export function requireRow<T>(row: T | undefined, label: string): T {
  if (row === undefined) {
    throw new Error(`${label}: expected a row but got none`);
  }
  return row;
}

/**
 * A paired device. Override any field per test.
 *
 * `id` is narrowed to required — the column defaults through `$defaultFn`,
 * so the insert type has it optional, but every caller here needs the value
 * back to write a query against it.
 */
export function deviceRow(overrides: Partial<DeviceInsert> = {}): DeviceInsert & { id: string } {
  return {
    id: crypto.randomUUID(),
    name: "Joao's iPhone",
    model: 'iPhone17,1',
    publicKeyDer: spkiPublicKeyBase64(),
    ...overrides,
  };
}

/** A live pairing code, five minutes out. */
export function pairingCodeRow(overrides: Partial<PairingCodeInsert> = {}): PairingCodeInsert {
  return {
    codeHash: hashSecret(`code-${crypto.randomUUID()}`),
    expiresAt: isoOffsetFromNow(5 * 60_000),
    ...overrides,
  };
}

/** A live refresh token belonging to `deviceId`, thirty days out. */
export function refreshTokenRow(
  deviceId: string,
  overrides: Partial<RefreshTokenInsert> = {}
): RefreshTokenInsert {
  return {
    tokenHash: hashSecret(`refresh-${crypto.randomUUID()}`),
    deviceId,
    familyId: crypto.randomUUID(),
    expiresAt: isoOffsetFromNow(30 * 24 * 60 * 60_000),
    ...overrides,
  };
}
