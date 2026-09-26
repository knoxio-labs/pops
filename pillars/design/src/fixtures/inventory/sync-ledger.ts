import {
  codeCase,
  deletedCase,
  iphone,
  ipad,
  photoCase,
  placementCase,
  syncDevices,
} from './sync-cases';
/**
 * The Sync segment's three lists as the web reads them from the devices'
 * reports: what needs a person, what a device is holding and why, and what
 * closed recently. Plus the ledgers each Sync state opens on.
 */
import { archivedCase } from './sync-catalogue-cases';

import type { ResolvedEntry, SyncLedger, WaitingChange } from '@/kit/inventory/sync/sync-model';

export const waitingChanges: readonly WaitingChange[] = [
  {
    id: 'wait-espresso',
    itemName: 'Espresso machine',
    summary: 'Moved into Moving crate 3',
    deviceId: iphone.id,
    since: '2026-09-25T10:30:00Z',
    reason: { kind: 'depends', on: 'Moving crate 3 being added' },
  },
  {
    id: 'wait-screws',
    itemName: 'Wood screws',
    summary: 'Count changed to 120',
    deviceId: iphone.id,
    since: '2026-09-25T10:12:00Z',
    reason: { kind: 'catalogue', revision: 13 },
  },
  {
    id: 'wait-cable',
    itemName: 'USB-A to USB-C cable',
    summary: 'Edited',
    deviceId: ipad.id,
    since: '2026-09-24T21:00:00Z',
    reason: { kind: 'app-update' },
  },
  {
    id: 'wait-hdmi-rename',
    itemName: 'HDMI cable 2 m',
    summary: 'Renamed to HDMI cable, braided',
    deviceId: iphone.id,
    since: '2026-09-24T18:32:00Z',
    reason: { kind: 'behind-case', caseId: archivedCase.id, itemName: 'HDMI cable 2 m' },
  },
];

export const letGoEntry: ResolvedEntry = {
  id: 'res-cable-let-go',
  itemName: 'HDMI cable 2 m',
  outcome: 'Let go on the iPhone',
  at: '2026-09-25T10:20:00Z',
  deviceId: iphone.id,
  dropped: [
    { field: 'Shielding', value: 'Braided', fit: 'archived' },
    { field: 'Length', value: '2 m', fit: 'fits' },
  ],
};

export const settledEntry: ResolvedEntry = {
  id: 'res-router-settled',
  itemName: 'Wi-Fi router',
  outcome: 'Office 04 on both',
  at: '2026-09-25T10:44:00Z',
  deviceId: iphone.id,
};

export const resolvedEntries: readonly ResolvedEntry[] = [
  letGoEntry,
  {
    id: 'res-linen',
    itemName: 'Spare sheets',
    outcome: 'Kept Bedside box',
    at: '2026-09-25T09:42:00Z',
    deviceId: iphone.id,
  },
  {
    id: 'res-tape',
    itemName: 'Tape measure',
    outcome: 'Same on both',
    at: '2026-09-25T09:15:00Z',
    deviceId: iphone.id,
  },
  {
    id: 'res-bits',
    itemName: 'Drill bit set',
    outcome: 'Photo sent',
    at: '2026-09-25T08:03:00Z',
    deviceId: iphone.id,
  },
  {
    id: 'res-lamp',
    itemName: 'Desk lamp',
    outcome: 'Restored, then moved to Desk',
    at: '2026-09-24T20:10:00Z',
    deviceId: ipad.id,
  },
  {
    id: 'res-kettle',
    itemName: 'Kettle',
    outcome: 'Discarded on the iPad',
    at: '2026-09-24T19:30:00Z',
    deviceId: ipad.id,
  },
];

/** The ledger most states open on: five cases, four held, six closed. */
export const busyLedger: SyncLedger = {
  devices: syncDevices,
  attention: [placementCase, codeCase, photoCase, archivedCase, deletedCase],
  waiting: waitingChanges,
  resolved: resolvedEntries,
};

/** Nothing open, nothing held. */
export const clearLedger: SyncLedger = {
  devices: syncDevices,
  attention: [],
  waiting: [],
  resolved: resolvedEntries,
};

/** After the router's case settled from here. */
export const settledLedger: SyncLedger = {
  ...busyLedger,
  attention: busyLedger.attention.filter((entry) => entry.id !== placementCase.id),
  resolved: [settledEntry, ...resolvedEntries],
};
