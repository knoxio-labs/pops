import type { CallResult } from '@pops/pillar-sdk/server';

/** The body a fake inventory sync-ledger call received. */
export interface InventoryLedgerCall {
  reportedAt?: string;
  lastSyncAt?: string | null;
  attention?: unknown[];
  waiting?: unknown[];
  resolved?: unknown[];
}

/** Creates the fake inventory procedure used to inspect forwarded ledger reports. */
export function makeLedgerProcedure(
  result: CallResult<unknown> | undefined,
  calls: InventoryLedgerCall[]
): (rawInput: unknown) => Promise<CallResult<unknown>> {
  return (rawInput) => {
    calls.push(readLedgerCall(rawInput));
    return Promise.resolve(result ?? { kind: 'ok', value: { stored: true } });
  };
}

function readLedgerCall(input: unknown): InventoryLedgerCall {
  const record = isRecord(input) ? input : {};
  return {
    reportedAt: readString(record, 'reportedAt'),
    lastSyncAt: readNullableString(record, 'lastSyncAt'),
    attention: readArray(record, 'attention'),
    waiting: readArray(record, 'waiting'),
    resolved: readArray(record, 'resolved'),
  };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object';
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function readNullableString(
  record: Record<string, unknown>,
  key: string
): string | null | undefined {
  const value = record[key];
  return value === null || typeof value === 'string' ? value : undefined;
}

function readArray(record: Record<string, unknown>, key: string): unknown[] | undefined {
  const value = record[key];
  return Array.isArray(value) ? value : undefined;
}
