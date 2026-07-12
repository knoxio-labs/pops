import { useCallback } from 'react';
import { toast } from 'sonner';

import { unwrap } from '../../../finance-api-helpers.js';
import {
  importsReevaluateWithPendingRules,
  type ImportsReevaluateWithPendingRulesResponses,
} from '../../../finance-api/index.js';
import { toRestCorrectionChangeSet } from '../../../lib/rest-changeset';
import { useImportStore } from '../../../store/importStore';
import { isDeadSessionError, recoverImportSession } from './session-recovery';

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
 * Runs `POST /imports/reevaluate-pending` for the current session against
 * (DB + pending) rules, transparently recovering a dead server session
 * (404/412) by re-processing from the persisted parsed transactions and
 * retrying exactly once. Resolves `null` when there is no session id or the
 * re-evaluation ultimately failed (an error toast has already been shown);
 * failures are never retried in a loop.
 */
export function useReevaluatePending(): {
  runReevaluate: () => Promise<ReevaluateOutcome | null>;
} {
  const runReevaluate = useCallback(async (): Promise<ReevaluateOutcome | null> => {
    const { processSessionId } = useImportStore.getState();
    if (!processSessionId) return null;
    try {
      return await requestReevaluate(processSessionId);
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
  }, []);
  return { runReevaluate };
}
