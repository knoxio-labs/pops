import { LEDGER_REPAIR_KINDS } from '@pops/inventory';

import type { WebSyncLedgerGetResponse } from '../../inventory-api/types.gen.js';

/** The three read-only lists on the Sync segment. */
export type SyncSegment = 'attention' | 'waiting' | 'resolved';

/** The URL-selectable segments of the Sync page. */
export type SyncPageSegment = 'activity' | SyncSegment;

/** A repair case reported by a device. */
export type RepairCase = WebSyncLedgerGetResponse['attention'][number];

/** A change held by a device while it waits for another condition. */
export type WaitingChange = WebSyncLedgerGetResponse['waiting'][number];

/** A repair case recently resolved by a device. */
export type ResolvedEntry = WebSyncLedgerGetResponse['resolved'][number];

/** One side of a value conflict. */
export type ConflictSide = NonNullable<RepairCase['mine']>;

/** A value held by a device and its fit against the current catalogue. */
export type HeldValue = NonNullable<RepairCase['held']>['values'][number];

/** The reason a device is holding a change. */
export type WaitReason = WaitingChange['reason'];

/** A repair kind known by the current contract vocabulary. */
export type RepairKind = (typeof LEDGER_REPAIR_KINDS)[number];

/** A paired device as displayed by the Sync page. */
export interface DeviceModel {
  id: string;
  name: string;
  /** The last successful sync, or the report time when none is available. */
  lastSyncAt: string;
}

/** The server-ordered ledger consumed by the Sync segment. */
export interface SyncLedger {
  devices: readonly DeviceModel[];
  attention: readonly RepairCase[];
  waiting: readonly WaitingChange[];
  resolved: readonly ResolvedEntry[];
}

/** Converts the generated response into the display model without reordering any list. */
export function toSyncLedger(ledger: WebSyncLedgerGetResponse): SyncLedger {
  return {
    devices: ledger.devices.map(({ id, name, lastSyncAt, reportedAt }) => ({
      id,
      name,
      lastSyncAt: lastSyncAt ?? reportedAt,
    })),
    attention: ledger.attention,
    waiting: ledger.waiting,
    resolved: ledger.resolved,
  };
}

const REPAIR_KINDS = new Set<string>(LEDGER_REPAIR_KINDS);

/** Returns whether a ledger kind is one of the contract's known repair kinds. */
export function isRepairKind(kind: string): kind is RepairKind {
  return REPAIR_KINDS.has(kind);
}

/** Returns the server-provided row count for each Sync list. */
export function segmentCounts(ledger: SyncLedger): Record<SyncSegment, number> {
  return {
    attention: ledger.attention.length,
    waiting: ledger.waiting.length,
    resolved: ledger.resolved.length,
  };
}

/** A case's position in the server-provided attention list. */
export interface CasePosition {
  index: number;
  total: number;
  previousId: string | null;
  nextId: string | null;
}

/** Returns a case's list position, or null when the case is not present. */
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

/** A device by id, else "An unknown device". */
export function deviceName(devices: readonly DeviceModel[], id: string): string {
  return devices.find((device) => device.id === id)?.name ?? 'An unknown device';
}

/** Held values whose fit is `fits`. */
export function valuesThatFit(values: readonly HeldValue[]): HeldValue[] {
  return values.filter((value) => value.fit === 'fits');
}

/** Describes no value, one or two named values, or a larger value set. */
export function describeValues(values: readonly HeldValue[]): string {
  if (values.length === 0) return 'nothing';
  if (values.length > 2) return `${values.length} values`;
  return values.map((value) => `${value.field} ${value.value}`).join(' and ');
}

/** Reads a URL segment, defaulting unknown values to the attention list. */
export function parseSyncSegment(value: string | null): SyncPageSegment {
  if (value === 'activity' || value === 'waiting' || value === 'resolved') return value;
  return 'attention';
}

/** Returns the waiting row's explanatory sentence for a reported reason. */
export function waitText(reason: WaitReason, device: string): string {
  switch (reason.kind) {
    case 'depends':
      return `Sends after ${reason.on ?? 'the dependency is ready'}`;
    case 'catalogue':
      return reason.revision === undefined
        ? `Sends once ${device} downloads the newer fields`
        : `Sends once ${device} downloads catalogue revision ${reason.revision}`;
    case 'app-update':
      return `Sends once ${device} is updated from the App Store`;
    case 'behind-case':
      return reason.itemName === undefined
        ? `Sends after a case on ${device} is decided`
        : `Sends after the ${reason.itemName} case is decided`;
    case 'queued':
      return 'Waiting to sync';
    case 'stalled':
      return "Can't be sent";
    default:
      return `Held on ${device}`;
  }
}
