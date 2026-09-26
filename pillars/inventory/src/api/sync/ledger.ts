import { eq } from 'drizzle-orm';

import {
  LEDGER_RESOLVED_DAYS,
  SyncLedgerReportBodySchema,
} from '../../contract/rest-sync-ledger.js';
import { deviceSyncLedgers } from '../../db/schema.js';

import type { z } from 'zod';

import type {
  LedgerRepairCaseSchema,
  WebSyncLedgerResponseSchema,
} from '../../contract/rest-sync-ledger.js';
import type { CommandDb } from '../../db/command-db.js';

type SyncLedgerReport = z.infer<typeof SyncLedgerReportBodySchema>;
type WebSyncLedgerResponse = z.infer<typeof WebSyncLedgerResponseSchema>;
type RepairCase = z.infer<typeof LedgerRepairCaseSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;

function timestampValue(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error(`invalid sync-ledger timestamp: ${value}`);
  return parsed;
}

function compareTimestampAscending(left: string, right: string): number {
  const difference = timestampValue(left) - timestampValue(right);
  return difference === 0 ? left.localeCompare(right) : difference;
}

function compareTimestampDescending(left: string, right: string): number {
  return compareTimestampAscending(right, left);
}

function readReport(report: string): SyncLedgerReport {
  return SyncLedgerReportBodySchema.parse(JSON.parse(report));
}

/**
 * Store a device's report when it is at least as new as the stored report.
 * Older reports are ignored so delayed delivery cannot move a device back in
 * time; a stored report is replaced as one whole JSON document.
 */
export function storeLedgerReport(
  db: CommandDb,
  device: { id: string; label: string },
  body: SyncLedgerReport,
  now: string
): { stored: boolean } {
  const report = JSON.stringify(body);
  return db.transaction((tx) => {
    const existing = tx
      .select({ reportedAt: deviceSyncLedgers.reportedAt })
      .from(deviceSyncLedgers)
      .where(eq(deviceSyncLedgers.deviceId, device.id))
      .get();
    if (existing && timestampValue(body.reportedAt) < timestampValue(existing.reportedAt)) {
      return { stored: false };
    }

    const values = {
      deviceId: device.id,
      deviceLabel: device.label,
      reportedAt: body.reportedAt,
      receivedAt: now,
      report,
    };
    if (existing) {
      tx.update(deviceSyncLedgers)
        .set({
          deviceLabel: values.deviceLabel,
          reportedAt: values.reportedAt,
          receivedAt: values.receivedAt,
          report: values.report,
        })
        .where(eq(deviceSyncLedgers.deviceId, device.id))
        .run();
    } else {
      tx.insert(deviceSyncLedgers).values(values).run();
    }
    return { stored: true };
  });
}

/** Merge every stored device report into the ordered web sync-ledger response. */
export function readWebSyncLedger(db: CommandDb, now: string): WebSyncLedgerResponse {
  const rows = db
    .select()
    .from(deviceSyncLedgers)
    .all()
    .toSorted((left, right) => compareTimestampDescending(left.reportedAt, right.reportedAt));
  const reports = rows.map((row) => ({ row, report: readReport(row.report) }));
  const attention: Array<RepairCase & { deviceId: string }> = reports
    .flatMap(({ row, report }) =>
      report.attention.map((entry) => ({ ...entry, deviceId: row.deviceId }))
    )
    .toSorted((left, right) => compareTimestampAscending(left.openedAt, right.openedAt));
  const waiting = reports.flatMap(({ row, report }) =>
    report.waiting.map((entry) => ({ ...entry, deviceId: row.deviceId }))
  );
  const resolvedCutoff = timestampValue(now) - LEDGER_RESOLVED_DAYS * DAY_MS;
  const resolved = reports.flatMap(({ row, report }) =>
    report.resolved
      .filter((entry) => timestampValue(entry.at) >= resolvedCutoff)
      .map((entry) => ({ ...entry, deviceId: row.deviceId }))
  );
  const devices = reports.map(({ row, report }) => ({
    id: row.deviceId,
    name: row.deviceLabel,
    lastSyncAt: report.lastSyncAt,
    reportedAt: row.reportedAt,
    receivedAt: row.receivedAt,
    attentionCount: report.attention.length,
  }));
  const receivedHead = rows.reduce<string | null>(
    (latest, row) =>
      latest === null || timestampValue(row.receivedAt) > timestampValue(latest)
        ? row.receivedAt
        : latest,
    null
  );

  return {
    devices,
    attention,
    waiting,
    resolved,
    attentionCount: attention.length,
    receivedHead,
  };
}
