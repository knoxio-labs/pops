/**
 * `queries/devices.ts` against a real migrated database.
 *
 * `touchDeviceIfStale`'s boundary is what `require-device.ts` relies on for
 * its coalescing policy — see `api/auth/__tests__/require-device.test.ts` for
 * that behaviour driven through the actual HTTP perimeter. This file pins the
 * primitive's own arithmetic: exactly at the window, one tick under it, one
 * tick over it.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { deviceRow, openTempDb, requireRow } from '../../__tests__/helpers.js';
import { devices } from '../../schema.js';
import { findDeviceById, touchDevice, touchDeviceIfStale } from '../devices.js';

import type { OpenedBfmDb } from '../../index.js';
import type { DeviceRow } from '../../schema.js';

let opened: OpenedBfmDb;
let cleanup: () => void;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
});

afterEach(() => {
  cleanup();
});

function insertDevice(overrides: Parameters<typeof deviceRow>[0] = {}): DeviceRow {
  const row = deviceRow(overrides);
  opened.db.insert(devices).values(row).run();
  return requireRow(opened.db.select().from(devices).where(eq(devices.id, row.id)).get(), 'device');
}

describe('findDeviceById', () => {
  it('returns undefined for an id no row carries', () => {
    expect(findDeviceById(opened.db, crypto.randomUUID())).toBeUndefined();
  });

  it('returns a revoked row rather than filtering it out', () => {
    const device = insertDevice({ revokedAt: '2026-08-01T09:00:00.000Z' });

    expect(findDeviceById(opened.db, device.id)?.revokedAt).toBe('2026-08-01T09:00:00.000Z');
  });
});

describe('touchDevice', () => {
  it('writes the given instant regardless of how recent the last one was', () => {
    const device = insertDevice({ lastSeenAt: '2027-01-01T00:00:00.000Z' });

    touchDevice(opened.db, device.id, '2027-01-01T00:00:00.001Z');

    expect(findDeviceById(opened.db, device.id)?.lastSeenAt).toBe('2027-01-01T00:00:00.001Z');
  });
});

describe('touchDeviceIfStale', () => {
  const LAST_SEEN = '2027-01-01T00:00:00.000Z';
  const WINDOW_MS = 60_000;

  it('writes and returns an updated row once the window has fully elapsed', () => {
    const device = insertDevice({ lastSeenAt: LAST_SEEN });
    const now = new Date(Date.parse(LAST_SEEN) + WINDOW_MS);

    const result = touchDeviceIfStale(opened.db, device, now, WINDOW_MS);

    expect(result.lastSeenAt).toBe(now.toISOString());
    expect(findDeviceById(opened.db, device.id)?.lastSeenAt).toBe(now.toISOString());
  });

  it('skips the write and returns the same row one millisecond under the window', () => {
    const device = insertDevice({ lastSeenAt: LAST_SEEN });
    const now = new Date(Date.parse(LAST_SEEN) + WINDOW_MS - 1);

    const result = touchDeviceIfStale(opened.db, device, now, WINDOW_MS);

    expect(result).toBe(device);
    expect(findDeviceById(opened.db, device.id)?.lastSeenAt).toBe(LAST_SEEN);
  });

  it('writes one millisecond past the window', () => {
    const device = insertDevice({ lastSeenAt: LAST_SEEN });
    const now = new Date(Date.parse(LAST_SEEN) + WINDOW_MS + 1);

    touchDeviceIfStale(opened.db, device, now, WINDOW_MS);

    expect(findDeviceById(opened.db, device.id)?.lastSeenAt).toBe(now.toISOString());
  });

  it('treats a windowMs of zero as always stale', () => {
    const device = insertDevice({ lastSeenAt: LAST_SEEN });
    const now = new Date(Date.parse(LAST_SEEN) + 1);

    const result = touchDeviceIfStale(opened.db, device, now, 0);

    expect(result.lastSeenAt).toBe(now.toISOString());
    expect(findDeviceById(opened.db, device.id)?.lastSeenAt).toBe(now.toISOString());
  });
});
