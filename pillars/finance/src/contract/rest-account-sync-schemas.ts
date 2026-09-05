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
  /** Rows Up returned for the fetched range, before dedup. */
  fetched: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  /** Held rows already stored that this pass marked settled. */
  settled: z.number().int().nonnegative(),
  /** Held rows already stored and still held: fetched, not written. */
  alreadyHeld: z.number().int().nonnegative(),
  batchId: z.string().nullable(),
  /** The checkpoint minted from Up's balance, or null when today already had one. */
  checkpoint: z
    .object({
      id: z.string(),
      balanceCents: z.number().int(),
      deltaCents: z.number().int(),
    })
    .nullable(),
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
