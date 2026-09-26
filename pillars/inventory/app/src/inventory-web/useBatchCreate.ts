import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import { WEB_BATCH_MAX_ROWS } from '@pops/inventory';

import { InventoryApiError, unwrap } from '../inventory-api-helpers.js';
import { webBatchCreate } from '../inventory-api/index.js';

import type { WebBatchCreateData, WebBatchCreateResponse } from '../inventory-api/types.gen.js';

const WEB_QUERY_ROOT = ['inventory', 'web'] as const;

type BatchBody = NonNullable<WebBatchCreateData['body']>;

/** One row submitted to the web batch-create endpoint. */
export type BatchRow = BatchBody['rows'][number];

/** The placement used for rows whose `where` cell is empty. */
export type BatchDestination = NonNullable<BatchBody['destination']>;

/** A server outcome or a row that was not sent after a request failed. */
export type BatchRowOutcome =
  | WebBatchCreateResponse['outcomes'][number]
  | { status: 'not-sent'; row: number; error: InventoryApiError };

/** The row-ordered result of one validation or commit run. */
export interface BatchRun {
  outcomes: BatchRowOutcome[];
}

/** The web batch-create controls used by bulk entry and import pages. */
export interface BatchCreate {
  /** Validate rows without creating any items. */
  validate: (rows: readonly BatchRow[], destination?: BatchDestination) => Promise<BatchRun>;
  /** Create valid rows while returning server validation outcomes for every row. */
  commit: (rows: readonly BatchRow[], destination?: BatchDestination) => Promise<BatchRun>;
  /** Whether one or more batch requests are currently in flight. */
  isRunning: boolean;
}

function asInventoryApiError(error: unknown): InventoryApiError {
  if (error instanceof InventoryApiError) return error;
  if (error instanceof Error) return new InventoryApiError(error.message, undefined);
  return new InventoryApiError('inventory API request failed', undefined);
}

function orderedOutcomes(outcomes: BatchRowOutcome[]): BatchRun {
  outcomes.sort((left, right) => left.row - right.row);
  return { outcomes };
}

async function finishRun(
  outcomes: BatchRowOutcome[],
  dryRun: boolean,
  queryClient: QueryClient
): Promise<BatchRun> {
  const run = orderedOutcomes(outcomes);
  if (!dryRun && run.outcomes.some((outcome) => outcome.status === 'created')) {
    await queryClient.invalidateQueries({ queryKey: WEB_QUERY_ROOT });
  }
  return run;
}

async function runBatch(
  rows: readonly BatchRow[],
  destination: BatchDestination | undefined,
  dryRun: boolean,
  queryClient: QueryClient
): Promise<BatchRun> {
  const outcomes: BatchRowOutcome[] = [];

  for (let start = 0; start < rows.length; start += WEB_BATCH_MAX_ROWS) {
    const chunk = rows.slice(start, start + WEB_BATCH_MAX_ROWS);
    try {
      const body =
        destination === undefined ? { rows: chunk, dryRun } : { rows: chunk, destination, dryRun };
      const response = unwrap(await webBatchCreate({ body }));
      outcomes.push(
        ...response.outcomes.map((outcome) => ({ ...outcome, row: start + outcome.row }))
      );
    } catch (error: unknown) {
      const apiError = asInventoryApiError(error);
      outcomes.push(
        ...rows.slice(start).map((_, offset) => ({
          status: 'not-sent' as const,
          row: start + offset,
          error: apiError,
        }))
      );
      return finishRun(outcomes, dryRun, queryClient);
    }
  }

  return finishRun(outcomes, dryRun, queryClient);
}

/**
 * Runs server-backed validation and partial-accept item creation in ordered
 * chunks, preserving global row indices and invalidating web data after a
 * commit that creates at least one item.
 */
export function useBatchCreate(): BatchCreate {
  const queryClient = useQueryClient();
  const activeRuns = useRef(0);
  const [isRunning, setIsRunning] = useState(false);

  const execute = useCallback(
    (rows: readonly BatchRow[], destination: BatchDestination | undefined, dryRun: boolean) => {
      if (rows.length === 0) return Promise.resolve({ outcomes: [] as BatchRowOutcome[] });

      activeRuns.current += 1;
      setIsRunning(true);
      return runBatch(rows, destination, dryRun, queryClient).finally(() => {
        activeRuns.current -= 1;
        if (activeRuns.current === 0) setIsRunning(false);
      });
    },
    [queryClient]
  );

  const validate = useCallback(
    (rows: readonly BatchRow[], destination?: BatchDestination) => execute(rows, destination, true),
    [execute]
  );
  const commit = useCallback(
    (rows: readonly BatchRow[], destination?: BatchDestination) =>
      execute(rows, destination, false),
    [execute]
  );

  return { validate, commit, isRunning };
}
