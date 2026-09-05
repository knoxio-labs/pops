/**
 * Wire mapper for account checkpoints (POPS-2880). The zod schemas live in
 * the REST contract (`src/contract/rest-checkpoints-schemas.ts`); this file
 * keeps only the row → response projection and its TS shape.
 *
 * `expectedBalanceCents`/`deltaCents` come from `checkpointDelta` and are
 * computed per response rather than stored, so a missing transaction arriving
 * later clears a disagreement without touching the checkpoint.
 */
import type { CheckpointSource } from '../../contract/checkpoint.js';
import type { AccountCheckpointRow, CheckpointDelta } from '../../db/index.js';

/** API response shape for one checkpoint. */
export interface Checkpoint {
  id: string;
  accountId: string;
  balanceCents: number;
  asOf: string;
  source: CheckpointSource;
  sourceRef: string | null;
  note: string | null;
  createdAt: string;
  /** Null for the earliest checkpoint: it anchors, so it cannot disagree. */
  expectedBalanceCents: number | null;
  deltaCents: number | null;
}

export function toCheckpoint(row: AccountCheckpointRow, delta: CheckpointDelta | null): Checkpoint {
  return {
    id: row.id,
    accountId: row.accountId,
    balanceCents: row.balanceCents,
    asOf: row.asOf,
    source: row.source,
    sourceRef: row.sourceRef,
    note: row.note,
    createdAt: row.createdAt,
    expectedBalanceCents: delta?.expectedBalanceCents ?? null,
    deltaCents: delta?.deltaCents ?? null,
  };
}
