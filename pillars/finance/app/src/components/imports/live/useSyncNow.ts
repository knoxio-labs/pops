import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  accountImportsGetSyncJob,
  type AccountImportsGetSyncJobResponses,
  accountImportsTriggerSync,
} from '../../../finance-api/index.js';
import { IMPORT_DRAFTS_LIST_KEY } from '../hooks/useDraftWriteThrough';

type UpSyncJob = AccountImportsGetSyncJobResponses[200]['data'];

/** An inclusive `YYYY-MM-DD` range to ask Up for. */
export interface SyncRange {
  from: string;
  to: string;
}

const POLL_MS = 1000;
const MAX_POLLS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollJob(accountId: string, jobId: string): Promise<UpSyncJob> {
  for (let i = 0; i < MAX_POLLS; i += 1) {
    const job = unwrap(await accountImportsGetSyncJob({ path: { id: accountId, jobId } })).data;
    if (job.status !== 'running') return job;
    await sleep(POLL_MS);
  }
  throw new Error('The sync is taking longer than expected. Check back in a minute.');
}

/**
 * Start a sync for an Up account and follow it to its result (POPS-3335).
 * The rows it fetches wait in the account's pending draft (finance ADR-005),
 * so the list of drafts is invalidated when it lands, whatever it found.
 */
export function useSyncNow(accountId: string) {
  const queryClient = useQueryClient();
  const [job, setJob] = useState<UpSyncJob | null>(null);
  const mutation = useMutation({
    mutationFn: async (range?: SyncRange) => {
      // No range means no body at all, not an empty one: a steady-state sync
      // must reach the server exactly as it did before the range existed.
      const started = unwrap(
        await accountImportsTriggerSync({
          path: { id: accountId },
          ...(range === undefined ? {} : { body: range }),
        })
      ).data;
      return pollJob(accountId, started.id);
    },
    onSuccess: (finished) => {
      setJob(finished);
      void queryClient.invalidateQueries({ queryKey: IMPORT_DRAFTS_LIST_KEY });
    },
  });
  return {
    syncNow: () => mutation.mutate(undefined),
    /** Sync one explicit inclusive range instead of the derived one (POPS-3352). */
    syncRange: (range: SyncRange) => mutation.mutate(range),
    isSyncing: mutation.isPending,
    lastJob: job,
    error: mutation.error,
  };
}
