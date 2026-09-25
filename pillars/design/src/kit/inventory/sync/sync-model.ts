/**
 * The Sync page's model on the web. Changes are made and held on a phone
 * (ADR-002: the phone keeps the mutation log and its repairs); the web
 * reads what each device reported and can change the record itself, which
 * is often enough to make both sides agree. It can never choose Keep mine or
 * Discard mine for a phone: that choice stays on the device holding the change.
 */

/** The three lists on the Sync segment. */
export type SyncSegment = 'attention' | 'waiting' | 'resolved';

/** A phone or tablet that syncs Inventory. */
export interface DeviceModel {
  id: string;
  name: string;
  lastSyncAt: string;
}

/** Every repair case a device can report. */
export type RepairKind =
  | 'placement'
  | 'field'
  | 'code-collision'
  | 'deleted-elsewhere'
  | 'photo-failed'
  | 'catalogue-updating'
  | 'field-archived'
  | 'type-replaced'
  | 'option-retired'
  | 'now-required'
  | 'fields-not-here'
  | 'stale-reference-gone'
  | 'stale-reference-not-allowed';

/** One side of a field conflict: the value, who wrote it and when. */
export interface ConflictSide {
  value: string;
  source: string;
  at: string;
}

/** Whether a held value can still be stored under the current catalogue. */
export type ValueFit =
  | 'fits'
  | 'archived'
  | 'replaced'
  | 'option-retired'
  | 'now-required'
  | 'not-on-device'
  | 'record-gone'
  | 'record-not-allowed';

/** One value inside a held change. */
export interface HeldValue {
  field: string;
  value: string;
  fit: ValueFit;
  /** The live field or type a replaced one moved to. */
  replacement?: string;
}

/** One case a device reported as needing a person. */
export interface RepairCase {
  id: string;
  kind: RepairKind;
  itemId: string;
  itemName: string;
  deviceId: string;
  openedAt: string;
  /** One literal line: what happened. */
  problem: string;
  /** The device's value and the one saved now, for placement and field conflicts. */
  mine?: ConflictSide;
  theirs?: ConflictSide;
  /** Code collisions: who holds the code and the next free one. */
  code?: { wanted: string; holder: string; suggested: string };
  /** Catalogue cases: the held change and each value's fit. */
  held?: { title: string; values: readonly HeldValue[] };
  photo?: { size: string; limit: string };
  /** The device retried and the server refused again, with its reason. */
  refused?: { at: string; reason: string };
}

/** Why a change is held on a device and not yet sent. */
export type WaitReason =
  | { kind: 'depends'; on: string }
  | { kind: 'catalogue'; revision: number }
  | { kind: 'app-update' }
  | { kind: 'behind-case'; caseId: string; itemName: string };

/** A change a device is holding. */
export interface WaitingChange {
  id: string;
  itemName: string;
  summary: string;
  deviceId: string;
  since: string;
  reason: WaitReason;
}

/** A case that closed, and how. */
export interface ResolvedEntry {
  id: string;
  itemName: string;
  outcome: string;
  at: string;
  deviceId: string;
  /** Values a Let go dropped that could still be saved from here. */
  dropped?: readonly HeldValue[];
}

/** Everything the Sync segment lists. */
export interface SyncLedger {
  devices: readonly DeviceModel[];
  attention: readonly RepairCase[];
  waiting: readonly WaitingChange[];
  resolved: readonly ResolvedEntry[];
}

/** Row counts per list, for the segment labels and the nav badge. */
export function segmentCounts(ledger: SyncLedger): Record<SyncSegment, number> {
  return {
    attention: ledger.attention.length,
    waiting: ledger.waiting.length,
    resolved: ledger.resolved.length,
  };
}

/** Where one case sits among the open ones, for "2 of 5" and Previous / Next. */
export interface CasePosition {
  index: number;
  total: number;
  previousId: string | null;
  nextId: string | null;
}

/** The position of a case in the list it was opened from; null when it is not there. */
export function casePosition(cases: readonly RepairCase[], id: string): CasePosition | null {
  const index = cases.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  return {
    index,
    total: cases.length,
    previousId: cases[index - 1]?.id ?? null,
    nextId: cases[index + 1]?.id ?? null,
  };
}

/** The open list, oldest case first: the one that has waited longest is worked first. */
export function orderCases(cases: readonly RepairCase[]): RepairCase[] {
  return cases.toSorted((a, b) => a.openedAt.localeCompare(b.openedAt));
}

/** A device by id, or a stand-in that says the device is unknown. */
export function deviceName(devices: readonly DeviceModel[], id: string): string {
  return devices.find((device) => device.id === id)?.name ?? 'An unknown device';
}

/** Held values that still fit and could be saved from the web as they are. */
export function valuesThatFit(values: readonly HeldValue[]): HeldValue[] {
  return values.filter((value) => value.fit === 'fits');
}

/** "Length 2 m" or "Length 2 m and Lid Hinged" or "3 values". */
export function describeValues(values: readonly HeldValue[]): string {
  if (values.length === 0) return 'nothing';
  if (values.length > 2) return `${values.length} values`;
  return values.map((value) => `${value.field} ${value.value}`).join(' and ');
}
