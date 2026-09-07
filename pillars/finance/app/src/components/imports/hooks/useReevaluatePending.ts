import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { isUnavailableError, unwrap } from '../../../finance-api-helpers.js';
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
  sleep,
} from './session-recovery';

type ReevaluateOutcome = ImportsReevaluateWithPendingRulesResponses[200];

const REEVALUATE_FAILED_MESSAGE = 'Failed to re-evaluate transactions against updated rules';

/**
 * How long to wait before retrying a request that failed with no status or a
 * 5xx — the shape a pillar mid-redeploy or a transient upstream hiccup
 * produces, as opposed to a real 4xx rejection. A brief deploy-time gap (the
 * old container gone, the new one not yet listening) is measured in seconds,
 * so one short wait is enough to ride it out without the user ever seeing a
 * toast for something that was never actually broken.
 */
const TRANSIENT_RETRY_DELAY_MS = 1500;

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
 * `requestReevaluate`, retried once after {@link TRANSIENT_RETRY_DELAY_MS}
 * when the first attempt fails with no status or a 5xx. A 4xx (including the
 * dead-session 404/412 the caller handles separately) is never retried here —
 * it is a real answer, not a transient gap.
 */
async function requestReevaluateWithTransientRetry(sessionId: string): Promise<ReevaluateOutcome> {
  try {
    return await requestReevaluate(sessionId);
  } catch (error) {
    if (!isUnavailableError(error)) throw error;
    await sleep(TRANSIENT_RETRY_DELAY_MS);
    return await requestReevaluate(sessionId);
  }
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

/**
 * Whether the error toast has already fired for the run chain currently in
 * flight (see {@link scheduleReevaluate}). A save that wakes more than one
 * mounted consumer (the review step's own effect, the browse dialog, ...)
 * collapses into one `activeRun` plus one `queuedRun`; if the outage spans
 * both, each would otherwise throw its own toast for what the user
 * experiences as a single save. Reset once the whole chain drains back to
 * idle, so an unrelated later failure still gets its own toast.
 */
let chainErrorToastShown = false;

function toastReevaluateError(): void {
  if (chainErrorToastShown) return;
  chainErrorToastShown = true;
  toast.error(REEVALUATE_FAILED_MESSAGE);
}

async function executeReevaluate(): Promise<ReevaluateOutcome | null> {
  const sessionId = await currentSessionId();
  if (!sessionId) return null;
  try {
    return await requestReevaluateWithTransientRetry(sessionId);
  } catch (error) {
    if (!isDeadSessionError(error)) {
      toastReevaluateError();
      return null;
    }
  }
  toast.info('Import session expired — reprocessing transactions…');
  try {
    return await requestReevaluateWithTransientRetry(await recoverImportSession());
  } catch {
    toastReevaluateError();
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
      // A queued follow-up is about to re-run the chain (it may still fail);
      // only clear the dedup flag once nothing is left queued behind it.
      if (!queuedRun) chainErrorToastShown = false;
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
