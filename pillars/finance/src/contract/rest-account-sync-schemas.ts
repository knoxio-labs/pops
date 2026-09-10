/**
 * The wire shape of one Up sync job (POPS-2921): what `POST /accounts/:id/sync`
 * hands back and `GET /accounts/:id/sync/:jobId` is polled for. A job is
 * process-local and short-lived — it exists so `Sync now` has something to
 * poll, not as a record; the durable record of what a sync did is the
 * `import_batches` row it writes.
 */
import { z } from 'zod';

export const UP_SYNC_TRIGGERS = ['schedule', 'manual'] as const;
export type UpSyncTrigger = (typeof UP_SYNC_TRIGGERS)[number];

export const UP_SYNC_JOB_STATUSES = ['running', 'completed', 'failed'] as const;
export type UpSyncJobStatus = (typeof UP_SYNC_JOB_STATUSES)[number];

export const UpSyncJobResultSchema = z.object({
  /**
   * Rows Up returned for the fetched range, before dedup.
   *
   * Every other count here partitions it, so they sum to `fetched`
   * (POPS-3355). `settleRefused` and `outsideRange` are optional only so a
   * job result serialised before they existed still parses; treat a missing
   * one as zero, and expect the identity to hold on anything this version
   * wrote.
   */
  fetched: z.number().int().nonnegative(),
  /**
   * Rows Up returned that fall outside the requested calendar range.
   *
   * The fetch deliberately asks a day either side, because Up filters on
   * instants and the rows carry a local calendar date. Those rows are
   * correctly excluded from staging; they were also excluded from every
   * bucket, so a backfill month read as `22 fetched, 18 staged` and there was
   * no way to tell four skipped rows from four lost ones.
   */
  outsideRange: z.number().int().nonnegative().optional(),
  /** Rows this pass added to the account's pending draft (finance ADR-005); nothing reaches the ledger until it is committed. */
  staged: z.number().int().nonnegative(),
  /** Rows the pending draft already held. */
  alreadyStaged: z.number().int().nonnegative(),
  /** Rows already in the ledger: fetched, not staged. */
  alreadyInLedger: z.number().int().nonnegative(),
  /** Held rows already stored that this pass marked settled. */
  settled: z.number().int().nonnegative(),
  /**
   * Held rows a settlement would have turned into a positive `purchase`, so it
   * was refused (POPS-2685). They keep their pending flag and reappear under
   * `alreadyHeld` next pass; a figure that stays above zero across syncs is a
   * row that needs a person, not a transient.
   *
   * Optional so a job result serialised before this field existed still parses.
   */
  settleRefused: z.number().int().nonnegative().optional(),
  /** Held rows already stored and still held: fetched, not written. */
  alreadyHeld: z.number().int().nonnegative(),
  /** The pending draft the rows wait in; null when nothing was staged and none existed. */
  draftId: z.string().nullable(),
  warnings: z.array(z.string()),
});

export type UpSyncJobResult = z.infer<typeof UpSyncJobResultSchema>;

export const UpSyncJobSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  trigger: z.enum(UP_SYNC_TRIGGERS),
  status: z.enum(UP_SYNC_JOB_STATUSES),
  /** Inclusive `YYYY-MM-DD` range the job asked Up for. */
  from: z.string(),
  to: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  result: UpSyncJobResultSchema.nullable(),
  /** Why a `failed` job failed, as the operator should read it; never a token. */
  error: z.string().nullable(),
});

export type UpSyncJob = z.infer<typeof UpSyncJobSchema>;

/** `YYYY-MM-DD`, the only date shape the Up range filters accept. */
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Body of `POST /accounts/:id/sync`.
 *
 * Absent, or absent of both dates, means the derived steady-state range: from
 * just before the newest row the account knows about, up to today. An explicit
 * range overrides that, which is what walking a backfill a month at a time
 * needs (POPS-3352) — the derived range only ever reaches back ninety days.
 *
 * Both dates or neither. `from` alone would have to invent a `to`, and the
 * range it invented would not be the one the caller meant; the handler answers
 * 422 rather than guess.
 */
export const TriggerSyncBodySchema = z
  .object({
    from: z.string().regex(CALENDAR_DATE).optional(),
    to: z.string().regex(CALENDAR_DATE).optional(),
  })
  .optional();

export type TriggerSyncBody = z.infer<typeof TriggerSyncBodySchema>;
