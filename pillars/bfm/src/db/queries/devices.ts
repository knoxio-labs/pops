import { eq } from 'drizzle-orm';

import { devices } from '../schema.js';

import type { BfmDb } from '../open-bfm-db.js';
import type { DeviceRow } from '../schema.js';

/**
 * Load one device by id, revoked or not.
 *
 * The revoked rows are deliberately in scope. The guard has to tell "no such
 * device" from "device we no longer trust" to answer 401 versus 403, and a
 * query that filtered `revokedAt IS NULL` would erase exactly that
 * distinction at the point it is needed.
 */
export function findDeviceById(db: BfmDb, id: string): DeviceRow | undefined {
  return db.select().from(devices).where(eq(devices.id, id)).get();
}

/**
 * Record that a device made contact, unconditionally.
 *
 * `seenAt` is passed in rather than taken from a clock in here so a caller can
 * write the same instant it puts in its response, and so a test can prove the
 * column advances without racing the millisecond the column's own default
 * would give it.
 */
export function touchDevice(db: BfmDb, id: string, seenAt: string): void {
  db.update(devices).set({ lastSeenAt: seenAt }).where(eq(devices.id, id)).run();
}

/**
 * {@link touchDevice}, coalesced: a write happens only once `now` has drifted
 * at least `windowMs` past the row's current `lastSeenAt`.
 *
 * `require-device.ts` calls this on every authenticated request — every
 * `/mobile/*` call, not just the ones a route author remembered to touch the
 * device from — so an uncoalesced write here would turn this pillar's one
 * internet-facing perimeter into a write on a Litestream-replicated database
 * at the pace of a phone scrolling a list rather than the pace of a device
 * actually checking in. The window itself is a policy choice, so it lives
 * with the caller rather than as a default here.
 *
 * Returns the device as it now stands — `device` itself if the write was
 * skipped, a copy echoing `now` if it was not — so a caller that also needs
 * the value (the guard, populating `res.locals`) never has to read it back.
 */
export function touchDeviceIfStale(
  db: BfmDb,
  device: DeviceRow,
  now: Date,
  windowMs: number
): DeviceRow {
  if (now.getTime() - Date.parse(device.lastSeenAt) < windowMs) return device;
  const seenAt = now.toISOString();
  touchDevice(db, device.id, seenAt);
  return { ...device, lastSeenAt: seenAt };
}
