import { WEB_BATCH_MAX_ROWS } from '@pops/inventory';

import type {
  BatchCreate,
  BatchDestination,
  BatchRow,
  BatchRowOutcome,
  BatchRun,
} from './useBatchCreate.js';

/** Progress reported after one batch-create slice has settled. */
export interface BatchProgress {
  /** Rows sent so far. */
  sent: number;
  /** Total rows in the commit. */
  total: number;
  /** Rows created so far. */
  created: number;
}

function globalOutcome(outcome: BatchRowOutcome, offset: number): BatchRowOutcome {
  return { ...outcome, row: offset + outcome.row };
}

function notSentOutcome(outcomes: readonly BatchRowOutcome[]): BatchRowOutcome | undefined {
  return outcomes.find((outcome) => outcome.status === 'not-sent');
}

/**
 * Commits `rows` one slice of `WEB_BATCH_MAX_ROWS` per `commit` call, in
 * order, reporting progress after each slice. Outcome `row` is the index in
 * `rows`.
 */
export async function commitWithProgress(
  commit: BatchCreate['commit'],
  rows: readonly BatchRow[],
  destination: BatchDestination | undefined,
  onProgress: (progress: BatchProgress) => void
): Promise<BatchRun> {
  const outcomes: BatchRowOutcome[] = [];
  let created = 0;

  for (let start = 0; start < rows.length; start += WEB_BATCH_MAX_ROWS) {
    const slice = rows.slice(start, start + WEB_BATCH_MAX_ROWS);
    const run = await commit(slice, destination);
    outcomes.push(...run.outcomes.map((outcome) => globalOutcome(outcome, start)));
    created += run.outcomes.filter((outcome) => outcome.status === 'created').length;

    onProgress({
      sent: start + slice.length,
      total: rows.length,
      created,
    });

    const failed = notSentOutcome(run.outcomes);
    if (failed?.status === 'not-sent') {
      outcomes.push(
        ...rows.slice(start + slice.length).map((_, row) => ({
          status: 'not-sent' as const,
          row: start + slice.length + row,
          error: failed.error,
        }))
      );
      break;
    }
  }

  outcomes.sort((left, right) => left.row - right.row);
  return { outcomes };
}
