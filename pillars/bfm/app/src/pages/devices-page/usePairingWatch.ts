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

/**
 * Turns the phone's half of pairing into something the operator can see.
 *
 * bfm has no way to tell the operator's browser that a code was redeemed — the
 * phone talks to bfm, not to the page. What the page *can* see is the device
 * list, which the model polls while a code is showing (see
 * {@link PAIRING_POLL_MS}). So the ids on screen when the code appeared are
 * remembered, and the first new one completes the pairing.
 *
 * The baseline is taken from the first list read after the code is shown, not
 * from the moment the mint was clicked. A list still loading at that moment
 * has no ids to remember, and a baseline of "nothing" would mistake every
 * existing handset for a new one. The phone cannot redeem a code before the
 * operator can see it, so nothing is missed by waiting for that first read.
 */
export function usePairingWatch(
  pairing: PairingCodeModel,
  devices: readonly PairedHandset[] | null
): void {
  const baseline = useRef<ReadonlySet<string> | null>(null);
  const awaiting = isAwaitingRedemption(pairing.state);
  const { complete } = pairing;

  useEffect(() => {
    if (!awaiting) {
      baseline.current = null;
      return;
    }
    if (devices === null) return;
    if (baseline.current === null) {
      baseline.current = new Set(devices.map((device) => device.id));
      return;
    }
    const device = findNewlyPairedDevice(baseline.current, devices);
    if (device !== null) complete(device);
  }, [awaiting, devices, complete]);
}
