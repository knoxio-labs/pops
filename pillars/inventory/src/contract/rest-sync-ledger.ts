/**
 * The device sync-ledger report and the merged read-only web projection.
 * Devices keep repair decisions locally; this surface only stores and reads
 * the latest report from each authenticated device.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

/** Repair kinds known to the current Inventory sync-ledger design. */
export const LEDGER_REPAIR_KINDS = [
  'placement',
  'field',
  'code-collision',
  'deleted-elsewhere',
  'photo-failed',
  'catalogue-updating',
  'field-archived',
  'type-replaced',
  'option-retired',
  'now-required',
  'fields-not-here',
  'stale-reference-gone',
  'stale-reference-not-allowed',
] as const;

/** Value-fit states known to the current Inventory sync-ledger design. */
export const LEDGER_VALUE_FITS = [
  'fits',
  'archived',
  'replaced',
  'option-retired',
  'now-required',
  'not-on-device',
  'record-gone',
  'record-not-allowed',
] as const;

/** Wait reasons known to the current Inventory sync-ledger design. */
export const LEDGER_WAIT_REASONS = ['depends', 'catalogue', 'app-update', 'behind-case'] as const;

/** Resolved reports older than this many days are omitted from the web merge. */
export const LEDGER_RESOLVED_DAYS = 7;

/** One side of a reported device/server conflict. */
export const LedgerConflictSideSchema = z.object({
  value: z.string(),
  source: z.string(),
  at: z.string(),
});

/** One value held by a device and its fit against the current catalogue. */
export const LedgerHeldValueSchema = z.object({
  field: z.string(),
  value: z.string(),
  fit: z.string(),
  replacement: z.string().optional(),
});

/** One repair case currently requiring attention on a device. */
export const LedgerRepairCaseSchema = z.object({
  id: z.string(),
  kind: z.string(),
  itemId: z.string(),
  itemName: z.string(),
  openedAt: z.string(),
  problem: z.string(),
  mine: LedgerConflictSideSchema.optional(),
  theirs: LedgerConflictSideSchema.optional(),
  code: z.object({ wanted: z.string(), holder: z.string(), suggested: z.string() }).optional(),
  held: z.object({ title: z.string(), values: z.array(LedgerHeldValueSchema) }).optional(),
  photo: z.object({ size: z.string(), limit: z.string() }).optional(),
  refused: z.object({ at: z.string(), reason: z.string() }).optional(),
});

/** Why a device is holding a change instead of sending it. */
export const LedgerWaitReasonSchema = z.object({
  kind: z.string(),
  on: z.string().optional(),
  revision: z.number().int().optional(),
  caseId: z.string().optional(),
  itemName: z.string().optional(),
});

/** One change currently waiting on another device-side condition. */
export const LedgerWaitingChangeSchema = z.object({
  id: z.string(),
  itemName: z.string(),
  summary: z.string(),
  since: z.string(),
  reason: LedgerWaitReasonSchema,
});

/** One repair case recently resolved on a device. */
export const LedgerResolvedEntrySchema = z.object({
  id: z.string(),
  itemName: z.string(),
  outcome: z.string(),
  at: z.string(),
  dropped: z.array(LedgerHeldValueSchema).optional(),
});

/** The complete latest ledger report sent by one device. */
export const SyncLedgerReportBodySchema = z.object({
  reportedAt: z.iso.datetime(),
  lastSyncAt: z.iso.datetime().nullable(),
  attention: z.array(LedgerRepairCaseSchema),
  waiting: z.array(LedgerWaitingChangeSchema),
  resolved: z.array(LedgerResolvedEntrySchema),
});

/** The acknowledgement returned after a device report is compared and stored. */
export const SyncLedgerReportResponseSchema = z.object({ stored: z.boolean() });

const WithDevice = { deviceId: z.string() };

/** The merged latest-ledger projection consumed by the inventory web app. */
export const WebSyncLedgerResponseSchema = z.object({
  devices: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      lastSyncAt: z.string().nullable(),
      reportedAt: z.string(),
      receivedAt: z.string(),
      attentionCount: z.number().int().nonnegative(),
    })
  ),
  attention: z.array(LedgerRepairCaseSchema.extend(WithDevice)),
  waiting: z.array(LedgerWaitingChangeSchema.extend(WithDevice)),
  resolved: z.array(LedgerResolvedEntrySchema.extend(WithDevice)),
  attentionCount: z.number().int().nonnegative(),
  /** Newest received report time, or null when no device has reported. */
  receivedHead: z.string().nullable(),
});

const c = initContract();

/** The read-only web route for every device's latest merged sync ledger. */
export const inventoryWebSyncLedgerContract = c.router({
  get: {
    method: 'GET',
    path: '/web/sync/ledger',
    responses: { 200: WebSyncLedgerResponseSchema },
    summary: "Every device's latest sync ledger, merged",
  },
});
