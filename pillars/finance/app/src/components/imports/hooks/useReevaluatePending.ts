import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  importsReevaluateWithPendingRules,
  type ImportsReevaluateWithPendingRulesResponses,
} from '../../../finance-api/index.js';
import { toRestCorrectionChangeSet } from '../../../lib/rest-changeset';
import { useImportStore } from '../../../store/importStore';
import {
  isDeadSessionError,
  pendingImportRecovery,
  recoverImportSession,
} from './session-recovery';

type ReevaluateOutcome = ImportsReevaluateWithPendingRulesResponses[200];

const REEVALUATE_FAILED_MESSAGE = 'Failed to re-evaluate transactions against updated rules';

async function requestReevaluate(sessionId: string): Promise<ReevaluateOutcome> {
  const { pendingChangeSets } = useImportStore.getState();
  return unwrap(
    await importsReevaluateWithPendingRules({
      body: {
        sessionId,
        minConfidence: 0.7,
        pendingChangeSets: pendingChangeSets.map((pcs) => ({
          changeSet: toRestCorrectionChangeSet(pcs.changeSet),
        })),
      },
    })
  );
}

/**
 * The session id to re-evaluate against, waiting out a recovery already in
 * progress rather than racing it.
 *
 * A recovery re-runs `POST /imports/process`, and the fresh session is
 * `processing` until that finishes. A request made in the meantime can only
 * come back 412 `sessionNotReady`, which then reads as a second dead session
 * and starts the whole dance again.
 */
async function currentSessionId(): Promise<string | null> {
  const recovering = pendingImportRecovery();
  if (recovering) return recovering;
  return useImportStore.getState().processSessionId;
}

async function executeReevaluate(): Promise<ReevaluateOutcome | null> {
  const sessionId = await currentSessionId();
  if (!sessionId) return null;
  try {
    return await requestReevaluate(sessionId);
  } catch (error) {
    if (!isDeadSessionError(error)) {
      toast.error(REEVALUATE_FAILED_MESSAGE);
      return null;
    }
  }
  toast.info('Import session expired — reprocessing transactions…');
  try {
    return await requestReevaluate(await recoverImportSession());
  } catch {
    toast.error(REEVALUATE_FAILED_MESSAGE);
    return null;
  }
}

let activeRun: Promise<ReevaluateOutcome | null> | null = null;
let queuedRun: Promise<ReevaluateOutcome | null> | null = null;

/**
 * Run a re-evaluation, collapsing concurrent requests to one in flight plus at
 * most one queued.
 *
 * Each run re-evaluates the session against whatever pending change sets exist
 * *at the time it executes*, so a run issued later subsumes every accept made
 * before it — firing one request per accept is redundant work, not extra
 * coverage. Accepting five or six suggestions in a row therefore costs two
 * requests, not six, and the results cannot be applied out of order because
 * only one is ever outstanding.
 *
 * Module-scoped, like the recovery it coordinates with, so the collapsing holds
 * across every call site rather than per component instance.
 */
function scheduleReevaluate(): Promise<ReevaluateOutcome | null> {
  if (!activeRun) {
    activeRun = executeReevaluate().finally(() => {
      activeRun = null;
    });
    return activeRun;
  }
  queuedRun ??= activeRun
    .catch(() => null)
    .then(() => {
      queuedRun = null;
      return scheduleReevaluate();
    });
  return queuedRun;
}

/**
 * Runs `POST /imports/reevaluate-pending` for the current session against
 * (DB + pending) rules, transparently recovering a dead server session
 * (404/412) by re-processing from the persisted parsed transactions and
 * retrying exactly once. Resolves `null` when there is no session id or the
 * re-evaluation ultimately failed (an error toast has already been shown);
 * failures are never retried in a loop.
 *
 * `isReevaluating` is true while a run is outstanding, so the review step can
 * say that accepted suggestions are still being applied. Without it the only
 * evidence of a slow or recovering re-evaluation is console noise, which reads
 * as the import having silently broken.
 */
export function useReevaluatePending(): {
  runReevaluate: () => Promise<ReevaluateOutcome | null>;
  isReevaluating: boolean;
} {
  const [outstanding, setOutstanding] = useState(0);

  const runReevaluate = useCallback(async (): Promise<ReevaluateOutcome | null> => {
    setOutstanding((n) => n + 1);
    try {
      return await scheduleReevaluate();
    } finally {
      setOutstanding((n) => n - 1);
    }
  }, []);

  return { runReevaluate, isReevaluating: outstanding > 0 };
}
