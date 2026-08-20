import { useCallback, useState } from 'react';

import { useImportStore } from '../../../store/importStore';
import { readAnzPdfUpload } from '../pdf/anz-pdf-import';

import type { AnzPdfStatementImport } from '../pdf/anz-pdf-import';

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
 * Reading uploaded PDF statements, and holding what was read until it is
 * confirmed.
 */
export function usePdfStage(
  setError: (message: string | null) => void,
  setIsProcessing: (busy: boolean) => void
): PdfStage {
  const { setParsedTransactions, goToStep } = useImportStore();
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
      // Finance cannot yet say what dates this account already holds, so the
      // overlap check does not run and the findings panel says so.
      const decision = await readAnzPdfUpload(files, { known: false });
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
    [statement, commit, setError, setIsProcessing]
  );

  return { statement, clear: useCallback(() => setStatement(null), []), run };
}
