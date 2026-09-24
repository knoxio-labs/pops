import { useEffect, useRef } from 'react';

import type { PairedHandset, PairingCodeModel } from './usePairingCode.js';

/** How often the device list is re-read while a code is waiting to be redeemed. */
export const PAIRING_POLL_MS = 2000;

/**
 * Whether the device list should be polling for the showing code's redemption.
 *
 * `expired` polls too: bfm checks expiry at the moment the phone redeems, so a
 * phone that got in during the code's last second is only visible to the
 * operator one poll after the countdown reads zero.
 */
export function isAwaitingRedemption(state: PairingCodeModel['state']): boolean {
  return state === 'issued' || state === 'expired';
}

/**
 * The trusted device in `devices` that was not there when the code was shown,
 * or `null`.
 *
 * Every pairing inserts a fresh device row with a fresh id — re-pairing the
 * same handset included — so a new id is the redemption. Nothing else can put
 * one there while the code is showing: rows are only ever inserted by redeeming
 * a code, and this code is the only one the operator has open. A revoked row
 * is ignored rather than celebrated; a device cut off between two polls is not
 * a pairing that worked.
 */
export function findNewlyPairedDevice(
  known: ReadonlySet<string>,
  devices: readonly PairedHandset[]
): PairedHandset | null {
  return devices.find((device) => device.revokedAt === null && !known.has(device.id)) ?? null;
}

/** A read of the device list, and when it landed (`Date.now()` milliseconds). */
export interface DeviceListSnapshot {
  devices: readonly PairedHandset[];
  fetchedAt: number;
}

/**
 * Turns the phone's half of pairing into something the operator can see.
 *
 * bfm has no way to tell the operator's browser that a code was redeemed — the
 * phone talks to bfm, not to the page. What the page *can* see is the device
 * list, which the model polls while a code is showing (see
 * {@link PAIRING_POLL_MS}). So the ids on screen when the code appeared are
 * remembered, and the first new one completes the pairing.
 *
 * The baseline is only ever taken from a read that landed at or after `since`
 * — the moment the mint was requested, when the model also refetches the list.
 * The cached list is not good enough: it is whatever the page last read, and a
 * handset paired from somewhere else since then would be missing from it, then
 * turn up on the next poll and be credited to this code. The refetch starts
 * before the code exists, so the phone cannot have redeemed it yet; and a list
 * still loading has no ids at all, which would read every existing handset as
 * the new one — so until a fresh enough read arrives, nothing is compared.
 */
export function usePairingWatch(
  pairing: PairingCodeModel,
  snapshot: DeviceListSnapshot | null,
  since: number
): void {
  const baseline = useRef<ReadonlySet<string> | null>(null);
  const awaiting = isAwaitingRedemption(pairing.state);
  const { complete } = pairing;

  useEffect(() => {
    if (!awaiting) {
      baseline.current = null;
      return;
    }
    if (snapshot === null || snapshot.fetchedAt < since) return;
    if (baseline.current === null) {
      baseline.current = new Set(snapshot.devices.map((device) => device.id));
      return;
    }
    const device = findNewlyPairedDevice(baseline.current, snapshot.devices);
    if (device !== null) complete(device);
  }, [awaiting, snapshot, since, complete]);
}
