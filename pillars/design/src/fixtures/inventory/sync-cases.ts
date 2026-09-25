/**
 * Repair cases the phones reported, one per kind the Sync page stages. The
 * record cases (conflicts, codes, deletes, photos) are here; the catalogue
 * cases are in `sync-catalogue-cases.ts`. Names follow the core fixtures
 * where the item exists in the house.
 */
import type { DeviceModel, RepairCase } from '@/kit/inventory/sync/sync-model';

/** The fixed "now" every U1 screen reads time against. */
export const DESIGN_NOW = '2026-09-25T10:45:00Z';

export const iphone: DeviceModel = {
  id: 'dev-iphone',
  name: "Joao's iPhone",
  lastSyncAt: '2026-09-25T10:41:00Z',
};

export const ipad: DeviceModel = {
  id: 'dev-ipad',
  name: "Joao's iPad",
  lastSyncAt: '2026-09-24T21:14:00Z',
};

export const syncDevices: readonly DeviceModel[] = [iphone, ipad];

export const placementCase: RepairCase = {
  id: 'case-router-placement',
  kind: 'placement',
  itemId: 'itm-router',
  itemName: 'Wi-Fi router',
  deviceId: iphone.id,
  openedAt: '2026-09-25T10:41:00Z',
  problem: "Moved on Joao's iPhone and on the iPad",
  mine: { value: 'Office 04', source: "Joao's iPhone", at: '2026-09-25T10:32:00Z' },
  theirs: { value: 'Filing cabinet', source: "Joao's iPad", at: '2026-09-24T21:10:00Z' },
};

export const fieldCase: RepairCase = {
  id: 'case-tv-name',
  kind: 'field',
  itemId: 'itm-tv',
  itemName: 'Television',
  deviceId: iphone.id,
  openedAt: '2026-09-25T09:20:00Z',
  problem: 'Renamed on this web app too',
  mine: { value: 'Living room TV', source: "Joao's iPhone", at: '2026-09-24T19:02:00Z' },
  theirs: { value: 'Samsung television', source: 'This web app', at: '2026-09-25T08:40:00Z' },
};

export const codeCase: RepairCase = {
  id: 'case-parts-code',
  kind: 'code-collision',
  itemId: 'box-parts',
  itemName: 'Small parts case',
  deviceId: iphone.id,
  openedAt: '2026-09-24T16:50:00Z',
  problem: 'T02 is already on Cable tub',
  code: { wanted: 'T02', holder: 'Cable tub', suggested: 'T03' },
};

export const deletedCase: RepairCase = {
  id: 'case-ladder-deleted',
  kind: 'deleted-elsewhere',
  itemId: 'itm-ladder',
  itemName: 'Step ladder',
  deviceId: iphone.id,
  openedAt: '2026-09-24T21:15:00Z',
  problem: "Deleted on the iPad after Joao's iPhone moved it",
  mine: { value: 'Shelving', source: "Joao's iPhone", at: '2026-09-24T20:58:00Z' },
  theirs: { value: 'Deleted', source: "Joao's iPad", at: '2026-09-24T21:06:00Z' },
};

export const photoCase: RepairCase = {
  id: 'case-drill-photo',
  kind: 'photo-failed',
  itemId: 'itm-drill',
  itemName: 'Cordless drill',
  deviceId: iphone.id,
  openedAt: '2026-09-24T17:05:00Z',
  problem: 'Photo not uploaded: it is too large',
  photo: { size: '14.2 MB', limit: '10 MB' },
};
