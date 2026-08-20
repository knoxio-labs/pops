import { useCallback } from 'react';

import { useImportStore } from '../../../store/importStore';
import { bankDialect } from '../bank-dialect';
import { mergeParsedFiles } from '../csv-merge';
import { parseAllFiles } from '../csv-parse';

import type { BankType } from '../../../store/import-store-types';

/** Parsing uploaded CSV exports into the wizard's header/row state. */
export function useCsvStage(
  files: File[],
  bankType: BankType,
  setError: (message: string | null) => void,
  setIsProcessing: (busy: boolean) => void
): () => Promise<void> {
  const { setHeaders, setRows, nextStep } = useImportStore();

  return useCallback(async () => {
    setIsProcessing(true);
    setError(null);
    const { error: parseError, parsed } = await parseAllFiles(files, bankDialect(bankType));
    if (parseError) {
      setIsProcessing(false);
      setError(parseError);
      return;
    }
    const merged = mergeParsedFiles(parsed);
    setIsProcessing(false);
    if (!merged.ok) {
      setError(merged.error ?? 'Unknown error');
      return;
    }
    setHeaders(merged.headers);
    setRows(merged.rows);
    nextStep();
  }, [files, bankType, setHeaders, setRows, nextStep, setError, setIsProcessing]);
}
