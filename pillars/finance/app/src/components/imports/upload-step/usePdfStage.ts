import { useCallback, useState } from 'react';

import { unwrap } from '../../../finance-api-helpers.js';
import { accountsGet } from '../../../finance-api/index.js';
import { useImportStore } from '../../../store/importStore';
import { readAnzPdfUpload } from '../pdf/anz-pdf-import';

import type { AccountCoverage, AnzPdfStatementImport } from '../pdf/anz-pdf-import';

/**
 * The wizard step a PDF import lands on.
 *
 * A PDF has no columns to map, so the mapping step has nothing to show and
 * nothing to ask; the transactions are already parsed by the time this runs.
 */
const PROCESSING_STEP = 3;

export interface PdfStage {
  /** The read statement, once its findings have been put to the person. */
  statement: AnzPdfStatementImport | null;
  clear: () => void;
  run: (files: File[]) => Promise<void>;
}

/**
 * What the account already holds, read off its import status (POPS-2917).
 *
 * A read that fails degrades to "not checked", so the findings panel says the
 * overlap check did not run. It must not degrade to "nothing to check": that
 * is what an empty account honestly says, and the two would otherwise be
 * spelled the same way.
 */
async function coverageOf(accountId: string): Promise<AccountCoverage> {
  try {
    const { data } = unwrap(await accountsGet({ path: { id: accountId } }));
    const span = data.importStatus.span;
    return span ? { known: true, interval: span } : { known: true };
  } catch {
    return { known: false };
  }
}

/**
 * Reading uploaded PDF statements, and holding what was read until it is
 * confirmed.
 */
export function usePdfStage(
  setError: (message: string | null) => void,
  setIsProcessing: (busy: boolean) => void
): PdfStage {
  const { accountId, setParsedTransactions, goToStep } = useImportStore();
  const [statement, setStatement] = useState<AnzPdfStatementImport | null>(null);

  const commit = useCallback(
    (ready: AnzPdfStatementImport) => {
      setParsedTransactions(ready.plan.importable);
      goToStep(PROCESSING_STEP);
    },
    [setParsedTransactions, goToStep]
  );

  const run = useCallback(
    async (files: File[]) => {
      // A second press, once the findings have been shown, is the decision to
      // import them — not a reason to read the same files again.
      if (statement) {
        commit(statement);
        return;
      }
      setIsProcessing(true);
      setError(null);
      // The account-step (POPS-2840) blocks reaching this stage without an
      // accountId already picked, same invariant the CSV path's
      // `ColumnMapStep` relies on.
      if (!accountId) {
        setIsProcessing(false);
        setError('No account selected — go back and pick one before uploading a statement.');
        return;
      }
      const decision = await readAnzPdfUpload(files, await coverageOf(accountId), accountId);
      setIsProcessing(false);
      if (decision.kind === 'error') {
        setError(decision.message);
        return;
      }
      if (decision.kind === 'review') {
        setStatement(decision.statement);
        return;
      }
      commit(decision.statement);
    },
    [statement, commit, setError, setIsProcessing, accountId]
  );

  return { statement, clear: useCallback(() => setStatement(null), []), run };
}
