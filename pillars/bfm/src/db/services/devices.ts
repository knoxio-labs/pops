/**
 * The operator's view of the device allow-list, and the one write that
 * shrinks it.
 *
 * Revocation is the security-critical half. "Revoked" has to mean the handset
 * is done — not that it will be done once its access token expires — and that
 * takes two writes which must not be separable:
 *
 *   1. `devices.revokedAt`, which the `requireDevice` guard (POPS-1370) reads
 *      on every request, so the very next call from that phone fails;
 *   2. `refresh_tokens.revokedAt` across the device's whole token family, so
 *      it cannot rotate its way back in.
 *
 * Doing (1) without (2) leaves live refresh tokens behind for whenever the
 * device row is next touched. Doing (2) without (1) lets the current access
 * token keep working until it expires. A crash between them produces one of
 * those two states, so they share a transaction.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';

import { serialiseDeviceCapabilities } from '../../contract/capabilities.js';
import { devices, refreshTokens } from '../schema.js';

import type { BfmDb } from '../open-bfm-db.js';

/**
 * A device as the operator surface reports it.
 *
 * Note what is absent: `publicKeyDer`. It is the public half and leaking it
 * would not let anyone sign anything, but it is also of no use to the Devices
 * page, and a key that is never serialised cannot be accidentally logged.
 */
export interface DeviceSummary {
  id: string;
  name: string;
  model: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

/**
 * Every device, newest pairing first, revoked ones included.
 *
 * Revoked rows are deliberately still listed: the operator question after a
 * phone is lost is "is that one dead yet", which an absent row answers
 * ambiguously (revoked, or never paired?).
 */
export function listDevices(db: BfmDb): DeviceSummary[] {
  return db
    .select({
      id: devices.id,
      name: devices.name,
      model: devices.model,
      createdAt: devices.createdAt,
      lastSeenAt: devices.lastSeenAt,
      revokedAt: devices.revokedAt,
    })
    .from(devices)
    .orderBy(desc(devices.createdAt))
    .all();
}

export interface InsertDeviceValues {
  /**
   * Chosen by the caller rather than by the column's `$defaultFn`.
   *
   * The pairing exchange mints an access token whose `sub` is this id, and it
   * does that before it opens its transaction so that nothing fallible runs
   * inside one. That ordering needs the id to exist first — reading it back
   * from an insert would put the mint after the write it is supposed to be
   * atomic with.
   */
  id: string;
  name: string;
  model: string;
  /** Base64 SPKI/DER. Already parsed as P-256 by the caller — see the column's own note. */
  publicKeyDer: string;
  /**
   * Written explicitly, and written to `lastSeenAt` as well.
   *
   * A row exists because a device completed the pairing exchange, which is
   * itself contact, so the two columns start equal and that equality is what
   * "not heard from since pairing" reads as. Letting them default would fill
   * them from SQLite's clock instead of the caller's, and two `strftime` calls
   * either side of an insert are not guaranteed to agree.
   */
  createdAt: string;
  /**
   * What this handset may do (ADR-048). Required rather than defaulted here:
   * the column defaults to the empty grant so a row nobody decided about
   * authorises nothing, and a caller that genuinely wants that has to say so.
   */
  capabilities: readonly string[];
}

/** Write one device row. Takes a {@link BfmDb}, so a transaction handle composes. */
export function insertDevice(db: BfmDb, values: InsertDeviceValues): void {
  db.insert(devices)
    .values({
      id: values.id,
      name: values.name,
      model: values.model,
      publicKeyDer: values.publicKeyDer,
      createdAt: values.createdAt,
      lastSeenAt: values.createdAt,
      capabilities: serialiseDeviceCapabilities(values.capabilities),
    })
    .run();
}

export type RevokeDeviceResult =
  | { outcome: 'revoked'; revokedAt: string; refreshTokensRevoked: number }
  | { outcome: 'already-revoked'; revokedAt: string }
  | { outcome: 'not-found' };

/**
 * Soft-revoke a device and kill its refresh-token family in one transaction.
 *
 * Idempotent: re-revoking reports `already-revoked` and preserves the original
 * instant rather than moving it, because that timestamp is the answer to "when
 * did we cut this phone off" and a second click must not rewrite it.
 */
export function revokeDevice(
  db: BfmDb,
  deviceId: string,
  now: Date = new Date()
): RevokeDeviceResult {
  const at = now.toISOString();

  return db.transaction((tx): RevokeDeviceResult => {
    const existing = tx
      .select({ revokedAt: devices.revokedAt })
      .from(devices)
      .where(eq(devices.id, deviceId))
      .get();

    if (existing === undefined) return { outcome: 'not-found' };
    if (existing.revokedAt !== null) {
      return { outcome: 'already-revoked', revokedAt: existing.revokedAt };
    }

    tx.update(devices).set({ revokedAt: at }).where(eq(devices.id, deviceId)).run();

    // Only live tokens. A token already killed by reuse detection keeps the
    // instant that killed it — overwriting would erase the forensic record
    // that says a thief was found before the operator revoked.
    const killed = tx
      .update(refreshTokens)
      .set({ revokedAt: at })
      .where(and(eq(refreshTokens.deviceId, deviceId), isNull(refreshTokens.revokedAt)))
      .run();

    return { outcome: 'revoked', revokedAt: at, refreshTokensRevoked: killed.changes };
  });
}
