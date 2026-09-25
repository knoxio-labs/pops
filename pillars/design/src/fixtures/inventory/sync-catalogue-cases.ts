/**
 * Changes made on a phone while the catalogue moved on under them: one per
 * way a field, type, option or reference can be left behind (iOS #6
 * catalogue repair), as the web reads them from the device's report.
 */
import { iphone } from './sync-cases';

import type { RepairCase } from '@/kit/inventory/sync/sync-model';

const on = { deviceId: iphone.id };

export const updatingCase: RepairCase = {
  ...on,
  id: 'case-screws-updating',
  kind: 'catalogue-updating',
  itemId: 'itm-screws',
  itemName: 'Wood screws',
  openedAt: '2026-09-25T10:40:00Z',
  problem: "Joao's iPhone is downloading catalogue revision 13",
  held: {
    title: 'Held edit',
    values: [{ field: 'Count', value: '120', fit: 'fits' }],
  },
};

export const archivedCase: RepairCase = {
  ...on,
  id: 'case-hdmi-shielding',
  kind: 'field-archived',
  itemId: 'itm-hdmi',
  itemName: 'HDMI cable 2 m',
  openedAt: '2026-09-24T18:30:00Z',
  problem: 'Shielding was archived in revision 12',
  held: {
    title: 'Held edit',
    values: [
      { field: 'Shielding', value: 'Braided', fit: 'archived' },
      { field: 'Length', value: '2 m', fit: 'fits' },
    ],
  },
};

export const refusedCase: RepairCase = {
  ...archivedCase,
  id: 'case-hdmi-refused',
  refused: {
    at: '2026-09-25T10:38:00Z',
    reason: 'Shielding is still archived, so nothing was sent.',
  },
};

export const typeReplacedCase: RepairCase = {
  ...on,
  id: 'case-mesh-type',
  kind: 'type-replaced',
  itemId: 'itm-mesh',
  itemName: 'Mesh node',
  openedAt: '2026-09-24T12:00:00Z',
  problem: 'Network was replaced by Router',
  held: {
    title: 'Held type change',
    values: [
      { field: 'Type', value: 'Network', fit: 'replaced', replacement: 'Router' },
      { field: 'Wi-Fi standard', value: '802.11ax', fit: 'fits' },
      { field: 'Ports', value: '4', fit: 'fits' },
    ],
  },
};

export const optionRetiredCase: RepairCase = {
  ...on,
  id: 'case-k13-colour',
  kind: 'option-retired',
  itemId: 'box-k13',
  itemName: 'Kitchen 13',
  openedAt: '2026-09-24T11:10:00Z',
  problem: 'Sage was retired from Colour',
  held: {
    title: 'Held edit',
    values: [
      { field: 'Colour', value: 'Sage', fit: 'option-retired' },
      { field: 'Lid', value: 'Hinged', fit: 'fits' },
    ],
  },
};

export const nowRequiredCase: RepairCase = {
  ...on,
  id: 'case-espresso-capacity',
  kind: 'now-required',
  itemId: 'itm-espresso',
  itemName: 'Espresso machine',
  openedAt: '2026-09-24T10:20:00Z',
  problem: 'Capacity became required before it was sent',
  held: {
    title: 'Held new item',
    values: [
      { field: 'Capacity', value: 'Not set', fit: 'now-required' },
      { field: 'Boiler', value: 'Dual', fit: 'fits' },
      { field: 'Pressure', value: '15 bar', fit: 'fits' },
    ],
  },
};

export const fieldsNotHereCase: RepairCase = {
  ...on,
  id: 'case-bits-head',
  kind: 'fields-not-here',
  itemId: 'itm-bits',
  itemName: 'Drill bit set',
  openedAt: '2026-09-24T09:40:00Z',
  problem: "This edit uses fields Joao's iPhone has not downloaded",
  held: {
    title: 'Held edit',
    values: [
      { field: 'Head', value: 'Countersunk', fit: 'not-on-device' },
      { field: 'Drive', value: 'Pozidriv', fit: 'fits' },
    ],
  },
};

export const referenceGoneCase: RepairCase = {
  ...on,
  id: 'case-lead-powers',
  kind: 'stale-reference-gone',
  itemId: 'itm-lead',
  itemName: 'Extension lead',
  openedAt: '2026-09-23T20:00:00Z',
  problem: 'Powers links to Desk lamp, which was deleted',
  held: {
    title: 'Held edit',
    values: [
      { field: 'Powers', value: 'Desk lamp', fit: 'record-gone' },
      { field: 'Length', value: '5 m', fit: 'fits' },
    ],
  },
};

export const referenceNotAllowedCase: RepairCase = {
  ...on,
  id: 'case-usbc-connected',
  kind: 'stale-reference-not-allowed',
  itemId: 'itm-usbc',
  itemName: 'USB-C cable 1 m',
  openedAt: '2026-09-23T18:00:00Z',
  problem: 'Connected to no longer accepts Wi-Fi router',
  held: {
    title: 'Held edit',
    values: [
      { field: 'Connected to', value: 'Wi-Fi router', fit: 'record-not-allowed' },
      { field: 'Length', value: '1 m', fit: 'fits' },
    ],
  },
};
