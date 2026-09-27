import { z } from 'zod';

/** One side of a reported device/server conflict. */
export const MobileInventoryLedgerConflictSideSchema = z.object({
  value: z.string(),
  source: z.string(),
  at: z.iso.datetime(),
});

/** One value held by a device and its fit against the current catalogue. */
export const MobileInventoryLedgerHeldValueSchema = z.object({
  field: z.string(),
  value: z.string(),
  fit: z.string(),
  replacement: z.string().optional(),
});

/** One repair case currently requiring attention on a device. */
export const MobileInventoryLedgerRepairCaseSchema = z.object({
  id: z.string(),
  kind: z.string(),
  itemId: z.string(),
  itemName: z.string(),
  openedAt: z.iso.datetime(),
  problem: z.string(),
  mine: MobileInventoryLedgerConflictSideSchema.optional(),
  theirs: MobileInventoryLedgerConflictSideSchema.optional(),
  code: z.object({ wanted: z.string(), holder: z.string(), suggested: z.string() }).optional(),
  held: z
    .object({
      title: z.string(),
      values: z.array(MobileInventoryLedgerHeldValueSchema),
    })
    .optional(),
  photo: z.object({ size: z.string(), limit: z.string() }).optional(),
  refused: z.object({ at: z.iso.datetime(), reason: z.string() }).optional(),
});

/** Why a device is holding a change instead of sending it. */
export const MobileInventoryLedgerWaitReasonSchema = z.object({
  kind: z.string(),
  on: z.string().optional(),
  revision: z.number().int().optional(),
  caseId: z.string().optional(),
  itemName: z.string().optional(),
});

/** One change currently waiting on another device-side condition. */
export const MobileInventoryLedgerWaitingChangeSchema = z.object({
  id: z.string(),
  itemName: z.string(),
  summary: z.string(),
  since: z.iso.datetime(),
  reason: MobileInventoryLedgerWaitReasonSchema,
});

/** One repair case recently resolved on a device. */
export const MobileInventoryLedgerResolvedEntrySchema = z.object({
  id: z.string(),
  itemName: z.string(),
  outcome: z.string(),
  at: z.iso.datetime(),
  dropped: z.array(MobileInventoryLedgerHeldValueSchema).optional(),
});

/** The latest ledger report sent by one device. */
export const MobileInventoryLedgerReportBodySchema = z.object({
  reportedAt: z.iso.datetime(),
  lastSyncAt: z.iso.datetime().nullish(),
  attention: z.array(MobileInventoryLedgerRepairCaseSchema),
  waiting: z.array(MobileInventoryLedgerWaitingChangeSchema),
  resolved: z.array(MobileInventoryLedgerResolvedEntrySchema),
});

/** The acknowledgement returned after a device ledger report is stored. */
export const MobileInventoryLedgerReportResponseSchema = z.object({ stored: z.boolean() });

/** The parsed body relayed to inventory's sync-ledger endpoint. */
export type MobileInventoryLedgerReport = z.infer<typeof MobileInventoryLedgerReportBodySchema>;

/** The parsed acknowledgement returned by inventory's sync-ledger endpoint. */
export type MobileInventoryLedgerReportResponse = z.infer<
  typeof MobileInventoryLedgerReportResponseSchema
>;
