import type { WebSyncLedgerGetResponse } from '../../inventory-api/types.gen.js';
import type {
  DeviceModel,
  RepairCase,
  ResolvedEntry,
  SyncLedger,
  WaitingChange,
} from '../../pages/sync/sync-model.js';

/** The fixed time used by the Sync page fixtures. */
export const DESIGN_NOW = '2026-09-25T10:45:00Z';

function makeDevice(id: string, name: string, lastSyncAt: string): DeviceModel {
  return { id, name, lastSyncAt };
}

/** The fixture iPhone. */
export const iphone = makeDevice('dev-iphone', "Joao's iPhone", '2026-09-25T10:41:00Z');

/** The fixture iPad. */
export const ipad = makeDevice('dev-ipad', "Joao's iPad", '2026-09-24T21:14:00Z');

type Held = NonNullable<RepairCase['held']>;
type CaseExtras = Partial<
  Pick<RepairCase, 'mine' | 'theirs' | 'code' | 'held' | 'photo' | 'refused'>
> & { problem?: string };

function makeHeld(values: Held['values']): Held {
  return { title: 'Held edit', values };
}

function makeCase(
  id: string,
  kind: string,
  itemName: string,
  details: CaseExtras = {}
): RepairCase {
  const { problem = `${itemName} needs review`, ...extras } = details;
  const base = {
    id,
    kind,
    itemId: `item-${id}`,
    itemName,
    deviceId: iphone.id,
    openedAt: DESIGN_NOW,
    problem,
  };
  return { ...base, ...extras };
}

const archivedHeld = makeHeld([
  { field: 'Shielding', value: 'Braided', fit: 'archived' },
  { field: 'Length', value: '2 m', fit: 'fits' },
]);
const typeReplacedHeld = makeHeld([
  { field: 'Type', value: 'Network', fit: 'replaced', replacement: 'Router' },
  { field: 'Wi-Fi standard', value: '802.11ax', fit: 'fits' },
  { field: 'Ports', value: '4', fit: 'fits' },
]);
const nowRequiredHeld = makeHeld([
  { field: 'Capacity', value: 'Not set', fit: 'now-required' },
  { field: 'Boiler', value: 'Dual', fit: 'fits' },
  { field: 'Pressure', value: '15 bar', fit: 'fits' },
]);

export const placementCase = makeCase('case-router-placement', 'placement', 'Wi-Fi router', {
  problem: "Moved on Joao's iPhone and on the iPad",
});
export const fieldCase = makeCase('case-tv-name', 'field', 'Television');
export const codeCase = makeCase('case-parts-code', 'code-collision', 'Small parts case', {
  problem: 'T02 is already on Cable tub',
  code: { wanted: 'T02', holder: 'Cable tub', suggested: 'T03' },
});
export const deletedCase = makeCase('case-ladder-deleted', 'deleted-elsewhere', 'Step ladder');
export const photoCase = makeCase('case-drill-photo', 'photo-failed', 'Cordless drill', {
  photo: { size: '14.2 MB', limit: '10 MB' },
});
export const updatingCase = makeCase('case-screws-updating', 'catalogue-updating', 'Wood screws', {
  held: makeHeld([{ field: 'Count', value: '120', fit: 'fits' }]),
});
export const archivedCase = makeCase('case-hdmi-shielding', 'field-archived', 'HDMI cable 2 m', {
  held: archivedHeld,
});
export const refusedCase: RepairCase = {
  ...archivedCase,
  id: 'case-hdmi-refused',
  refused: { at: DESIGN_NOW, reason: 'Shielding is still archived, so nothing was sent.' },
};
export const typeReplacedCase = makeCase('case-mesh-type', 'type-replaced', 'Mesh node', {
  held: typeReplacedHeld,
});
export const optionRetiredCase = makeCase('case-k13-colour', 'option-retired', 'Kitchen 13', {
  held: makeHeld([
    { field: 'Colour', value: 'Sage', fit: 'option-retired' },
    { field: 'Lid', value: 'Hinged', fit: 'fits' },
  ]),
});
export const nowRequiredCase = makeCase(
  'case-espresso-capacity',
  'now-required',
  'Espresso machine',
  { held: nowRequiredHeld }
);
export const fieldsNotHereCase = makeCase('case-bits-head', 'fields-not-here', 'Drill bit set');
export const referenceGoneCase = makeCase(
  'case-lead-powers',
  'stale-reference-gone',
  'Extension lead'
);
export const referenceNotAllowedCase = makeCase(
  'case-usbc-connected',
  'stale-reference-not-allowed',
  'USB-C cable 1 m'
);

function makeWaiting(
  id: string,
  itemName: string,
  reason: WaitingChange['reason'],
  details: Partial<WaitingChange> = {}
): WaitingChange {
  const base = {
    id,
    itemName,
    summary: `${itemName} changed`,
    deviceId: iphone.id,
    since: DESIGN_NOW,
    reason,
  };
  return { ...base, ...details };
}

export const waitingChanges: readonly WaitingChange[] = [
  makeWaiting(
    'wait-espresso',
    'Espresso machine',
    { kind: 'depends', on: 'Moving crate 3 being added' },
    { summary: 'Moved into Moving crate 3' }
  ),
  makeWaiting(
    'wait-screws',
    'Wood screws',
    { kind: 'catalogue', revision: 13 },
    { summary: 'Count changed to 120' }
  ),
  makeWaiting(
    'wait-cable',
    'USB-A to USB-C cable',
    { kind: 'app-update' },
    { deviceId: ipad.id, summary: 'Edited' }
  ),
  makeWaiting(
    'wait-hdmi-rename',
    'HDMI cable 2 m',
    { kind: 'behind-case', caseId: archivedCase.id, itemName: 'HDMI cable 2 m' },
    { summary: 'Renamed to HDMI cable, braided' }
  ),
];

function makeResolved(
  id: string,
  itemName: string,
  outcome: string,
  details: Partial<ResolvedEntry> = {}
): ResolvedEntry {
  return { id, itemName, outcome, at: DESIGN_NOW, deviceId: iphone.id, ...details };
}

const droppedValues: Held['values'] = [
  { field: 'Shielding', value: 'Braided', fit: 'archived' },
  { field: 'Length', value: '2 m', fit: 'fits' },
];
export const letGoEntry = makeResolved(
  'res-cable-let-go',
  'HDMI cable 2 m',
  'Let go on the iPhone',
  { dropped: droppedValues }
);
export const settledEntry = makeResolved('res-router-settled', 'Wi-Fi router', 'Office 04 on both');
export const resolvedEntries: readonly ResolvedEntry[] = [
  letGoEntry,
  makeResolved('res-linen', 'Spare sheets', 'Kept Bedside box'),
  makeResolved('res-tape', 'Tape measure', 'Same on both'),
  makeResolved('res-bits', 'Drill bit set', 'Photo sent'),
  makeResolved('res-lamp', 'Desk lamp', 'Restored, then moved to Desk', { deviceId: ipad.id }),
  makeResolved('res-kettle', 'Kettle', 'Discarded on the iPad', { deviceId: ipad.id }),
];

/** The loaded ledger with five oldest-first attention cases. */
export const busyLedger: SyncLedger = {
  devices: [iphone, ipad],
  attention: [codeCase, photoCase, archivedCase, deletedCase, placementCase],
  waiting: waitingChanges,
  resolved: resolvedEntries,
};

/** The all-clear ledger with the resolved list still visible. */
export const clearLedger: SyncLedger = { ...busyLedger, attention: [], waiting: [] };

/** The ledger after the router case settled. */
export const settledLedger: SyncLedger = {
  ...busyLedger,
  attention: busyLedger.attention.filter((entry) => entry.id !== placementCase.id),
  resolved: [settledEntry, ...resolvedEntries],
};

function responseDevice(
  device: DeviceModel,
  attentionCount: number
): WebSyncLedgerGetResponse['devices'][number] {
  return { ...device, reportedAt: DESIGN_NOW, receivedAt: DESIGN_NOW, attentionCount };
}

/** `busyLedger` in the shape returned by `GET /web/sync/ledger`. */
export const busyLedgerResponse: WebSyncLedgerGetResponse = {
  devices: [responseDevice(iphone, 5), responseDevice(ipad, 0)],
  attention: [...busyLedger.attention],
  waiting: [...waitingChanges],
  resolved: [...resolvedEntries],
  attentionCount: busyLedger.attention.length,
  receivedHead: DESIGN_NOW,
};
