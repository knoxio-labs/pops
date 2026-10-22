/**
 * Pending document ingestion sweep.
 *
 * Every five minutes, asks documents about every pending upload so an item
 * nobody opens still turns its uploads into links (or failures). Listing an
 * item's documents resolves that item's rows on demand as well; the two may
 * overlap on a row, which `resolveIngestions` tolerates.
 *
 * Like the reconciliation cron, the next tick is armed only after the
 * current one settles, so a slow documents pillar cannot pile up runs. A
 * tick that cannot reach documents changes nothing.
 */
import { resolveIngestions, type ResolveCounters } from '../modules/documents/ingestions.js';

import type { InventoryDb } from '../../db/index.js';
import type { DocumentUploadsClient } from '../documents/uploads-client.js';
import type { ReconcileLogger } from './reconcile-cross-pillar-runner.js';

/** The sweep's cadence. */
export const DOCUMENT_INGESTION_SWEEP_MS = 5 * 60 * 1000;

export interface DocumentIngestionSweepOptions {
  db: InventoryDb;
  uploads: Pick<DocumentUploadsClient, 'taskStatus'>;
  intervalMs?: number;
  logger?: ReconcileLogger;
}

/** Run one sweep over every pending row, logging only when it did or skipped something. */
export async function sweepDocumentIngestions(
  options: Omit<DocumentIngestionSweepOptions, 'intervalMs'>
): Promise<ResolveCounters> {
  const counters = await resolveIngestions(options.db, options.uploads);
  if (counters.linked + counters.alreadyLinked + counters.failed + counters.unreachable > 0) {
    options.logger?.info?.('inventory document ingestion sweep', { ...counters });
  }
  return counters;
}

/** Start the sweep: one tick now, then one {@link DOCUMENT_INGESTION_SWEEP_MS} after each settles. */
export function startDocumentIngestionSweep(options: DocumentIngestionSweepOptions): {
  stop: () => void;
} {
  const intervalMs = options.intervalMs ?? DOCUMENT_INGESTION_SWEEP_MS;
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const tick = async (): Promise<void> => {
    try {
      await sweepDocumentIngestions(options);
    } catch (err) {
      options.logger?.warn?.('inventory document ingestion sweep failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (!stopped) {
      timer = setTimeout(() => {
        void tick();
      }, intervalMs);
    }
  };

  void tick();

  return {
    stop: () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}
