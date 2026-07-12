import { FinanceApiError, unwrap } from '../../../finance-api-helpers.js';
import { importsGetImportProgress, importsProcessImport } from '../../../finance-api/index.js';
import { useImportStore } from '../../../store/importStore';

const POLL_INTERVAL_MS = 1000;
const MAX_CONSECUTIVE_UNKNOWN_POLLS = 10;
const RECOVERY_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * True when the server no longer knows the import session:
 * `requireProcessSession` maps a missing/expired session to 404 or 412. A 404
 * can rarely be a propagated rule NotFoundError instead — recovery then wastes
 * one re-process and the single retry surfaces the real error, so the misfire
 * is bounded. 400/409/5xx never trigger recovery.
 */
export function isDeadSessionError(error: unknown): boolean {
  return error instanceof FinanceApiError && (error.status === 404 || error.status === 412);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntilComplete(sessionId: string): Promise<void> {
  const deadline = Date.now() + RECOVERY_TIMEOUT_MS;
  let unknownPolls = 0;
  for (;;) {
    const progress = unwrap(await importsGetImportProgress({ query: { sessionId } }));
    if (progress === null) {
      unknownPolls += 1;
      if (unknownPolls > MAX_CONSECUTIVE_UNKNOWN_POLLS) {
        throw new Error('Recovered import session disappeared while reprocessing');
      }
    } else {
      unknownPolls = 0;
      if (progress.status === 'completed') return;
      if (progress.status === 'failed') throw new Error('Reprocessing the import failed');
    }
    if (Date.now() >= deadline) throw new Error('Timed out reprocessing the import');
    await sleep(POLL_INTERVAL_MS);
  }
}

async function reprocessFromStore(): Promise<string> {
  const { parsedTransactions, bankType, setProcessSessionId } = useImportStore.getState();
  if (parsedTransactions.length === 0) {
    throw new Error('No parsed transactions available to recover the import session');
  }
  const { sessionId } = unwrap(
    await importsProcessImport({ body: { transactions: parsedTransactions, account: bankType } })
  );
  setProcessSessionId(sessionId);
  await pollUntilComplete(sessionId);
  return sessionId;
}

let inFlightRecovery: Promise<string> | null = null;

/**
 * Recreates a dead server import session by re-running `POST /imports/process`
 * from the (persisted) parsed transactions, resolving the fresh session id
 * once processing completes. The in-flight promise is module-scoped so
 * concurrent dead-session failures coalesce into a single re-process across
 * every call site (review change-set effect, browse dialog), not per
 * component. The fresh processing result is deliberately NOT written to the
 * store — it lacks pending-rule effects; the retried re-evaluation plus the
 * client-side merge own that.
 */
export function recoverImportSession(): Promise<string> {
  inFlightRecovery ??= reprocessFromStore().finally(() => {
    inFlightRecovery = null;
  });
  return inFlightRecovery;
}
