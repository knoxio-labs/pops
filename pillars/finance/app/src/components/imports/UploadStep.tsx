import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, RadioInput } from '@pops/ui';

import { useImportStore } from '../../store/importStore';
import { bankDialect } from './bank-dialect';
import { mergeParsedFiles } from './csv-merge';
import { parseAllFiles } from './csv-parse';
import { FileUpload } from './FileUpload';
import { readAnzPdfUpload, uploadRoute } from './pdf/anz-pdf-import';
import { PdfStatementFindings } from './pdf/PdfStatementFindings';

import type { AnzPdfStatementImport } from './pdf/anz-pdf-import';
import type { BankType } from '../../store/import-store-types';

function UploadFooter({
  onNext,
  disabled,
  isProcessing,
  label,
}: {
  onNext: () => void;
  disabled: boolean;
  isProcessing: boolean;
  label: string;
}) {
  return (
    <div className="flex justify-end gap-3">
      <Button onClick={onNext} disabled={disabled}>
        {isProcessing ? 'Processing...' : label}
      </Button>
    </div>
  );
}

/**
 * File types each bank's import takes.
 *
 * Only the credit card has a PDF reader behind it: ANZ's CSV export reaches
 * back two years and the PDF statements are how anything older is recovered.
 * Offering PDF anywhere else would show a picker for a path that does not
 * exist.
 */
const BANK_ACCEPTED_TYPES: Record<BankType, string> = {
  ANZ: '.csv',
  'ANZ Credit Card': '.csv,.pdf',
  Amex: '.csv',
  ING: '.csv',
  Up: '.csv',
};

const BANK_OPTIONS = [
  { value: 'ANZ', label: 'ANZ', description: 'Everyday, Savings' },
  { value: 'ANZ Credit Card', label: 'ANZ Credit Card', description: 'Frequent Flyer, Rewards' },
  { value: 'Amex', label: 'Amex', description: 'American Express' },
  { value: 'ING', label: 'ING', description: 'Savings, Everyday' },
  { value: 'Up', label: 'Up', description: 'Everyday, Round Up' },
] satisfies Array<{ value: BankType; label: string; description: string }>;

const BANK_HELP: Record<BankType, string> = {
  ANZ: 'Log in to ANZ Internet Banking, open your account, and export transactions as CSV.',
  'ANZ Credit Card':
    'Log in to ANZ Internet Banking, open your credit card, and export transactions as CSV. The export has no header row — that is expected.',
  Amex: 'Log in to your Amex online portal and download your transactions as a CSV export.',
  ING: 'Log in to ING Banking Online, open your account, and export transactions as CSV.',
  Up: 'In the Up app, go to your account, tap Export, and choose CSV format.',
};

/**
 * The wizard step a PDF import lands on.
 *
 * A PDF has no columns to map, so the mapping step has nothing to show and
 * nothing to ask; the transactions are already parsed by the time this runs.
 */
const PROCESSING_STEP = 3;

interface PdfStage {
  statement: AnzPdfStatementImport | null;
  clear: () => void;
  run: (files: File[]) => Promise<void>;
}

function usePdfStage(
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

function useUploadStep() {
  const { files, rows, bankType, setFiles, setBankType, setHeaders, setRows, nextStep } =
    useImportStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pdf = usePdfStage(setError, setIsProcessing);

  const handleFilesSelect = useCallback(
    (selectedFiles: File[]) => {
      setFiles(selectedFiles);
      setError(null);
      pdf.clear();
    },
    [setFiles, pdf]
  );

  const handleBankChange = useCallback(
    (value: string) => {
      setBankType(value as BankType);
    },
    [setBankType]
  );

  const handleCsvNext = useCallback(async () => {
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
  }, [files, bankType, setHeaders, setRows, nextStep]);

  const handleNext = useCallback(async () => {
    const route = uploadRoute(files);
    if (route === 'empty') {
      // A resumed run has parsed rows but no re-attached File handles; advance
      // without re-parsing instead of demanding a re-upload (which would cascade
      // a downstream reset over the restored work).
      if (rows.length > 0) {
        nextStep();
        return;
      }
      setError('Please select at least one file');
      return;
    }
    if (route === 'mixed') {
      setError(
        'Select either CSV exports or PDF statements, not both. They are read differently and a period covered by both would import twice.'
      );
      return;
    }
    await (route === 'pdf' ? pdf.run(files) : handleCsvNext());
  }, [files, rows, nextStep, pdf, handleCsvNext]);

  return {
    files,
    rows,
    bankType,
    isProcessing,
    error,
    pdfStatement: pdf.statement,
    handleFilesSelect,
    handleBankChange,
    handleNext,
  };
}

export function UploadStep() {
  const {
    files,
    rows,
    bankType,
    isProcessing,
    error,
    pdfStatement,
    handleFilesSelect,
    handleBankChange,
    handleNext,
  } = useUploadStep();
  const { t } = useTranslation('finance');
  const acceptedTypes = BANK_ACCEPTED_TYPES[bankType];
  const takesPdf = acceptedTypes.includes('.pdf');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">
          {takesPdf ? 'Upload CSV or PDF' : 'Upload CSV'}
        </h2>
        <p className="text-sm text-muted-foreground">
          Select your bank and upload one or more CSV exports to import transactions. Multiple files
          are merged into a single import when they share the same columns.
          {takesPdf
            ? ' PDF statements are read instead when you upload those, for periods older than the CSV export reaches.'
            : ''}
        </p>
      </div>

      <RadioInput
        label="Bank"
        options={BANK_OPTIONS}
        value={bankType}
        onValueChange={handleBankChange}
        orientation="horizontal"
      />

      <FileUpload
        onFilesSelect={handleFilesSelect}
        acceptedTypes={acceptedTypes}
        maxSizeMB={25}
        maxTotalSizeMB={100}
        initialFiles={files}
      />

      {pdfStatement && <PdfStatementFindings statement={pdfStatement} fileCount={files.length} />}

      {files.length === 0 && rows.length > 0 && (
        <div className="bg-info/5 border border-info/20 rounded-lg p-4">
          <p className="text-xs text-info">{t('import.resumeFileNotice')}</p>
        </div>
      )}

      <div className="bg-info/5 border border-info/20 rounded-lg p-4">
        <h3 className="text-sm font-medium text-info mb-2">
          How to export from {BANK_OPTIONS.find((b) => b.value === bankType)?.label ?? bankType}
        </h3>
        <p className="text-xs text-info">{BANK_HELP[bankType]}</p>
      </div>

      {error && (
        <div className="p-4 text-sm text-destructive bg-destructive/10 dark:text-destructive/40 rounded-lg">
          {error}
        </div>
      )}

      <UploadFooter
        onNext={handleNext}
        disabled={(files.length === 0 && rows.length === 0) || isProcessing}
        isProcessing={isProcessing}
        label={
          pdfStatement
            ? `Import ${pdfStatement.plan.importable.length} transaction${pdfStatement.plan.importable.length === 1 ? '' : 's'}`
            : 'Next'
        }
      />
    </div>
  );
}
