import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button, RadioInput } from '@pops/ui';

import { useImportStore } from '../../store/importStore';
import { bankDialect } from './bank-dialect';
import { mergeParsedFiles } from './csv-merge';
import { parseAllFiles } from './csv-parse';
import { FileUpload } from './FileUpload';

import type { BankType } from '../../store/import-store-types';

function UploadFooter({
  onNext,
  disabled,
  isProcessing,
}: {
  onNext: () => void;
  disabled: boolean;
  isProcessing: boolean;
}) {
  return (
    <div className="flex justify-end gap-3">
      <Button onClick={onNext} disabled={disabled}>
        {isProcessing ? 'Processing...' : 'Next'}
      </Button>
    </div>
  );
}

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

function useUploadStep() {
  const { files, rows, bankType, setFiles, setBankType, setHeaders, setRows, nextStep } =
    useImportStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFilesSelect = useCallback(
    (selectedFiles: File[]) => {
      setFiles(selectedFiles);
      setError(null);
    },
    [setFiles]
  );

  const handleBankChange = useCallback(
    (value: string) => {
      setBankType(value as BankType);
    },
    [setBankType]
  );

  const handleNext = useCallback(async () => {
    if (files.length === 0) {
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
  }, [files, rows, bankType, setHeaders, setRows, nextStep]);

  return {
    files,
    rows,
    bankType,
    isProcessing,
    error,
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
    handleFilesSelect,
    handleBankChange,
    handleNext,
  } = useUploadStep();
  const { t } = useTranslation('finance');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Upload CSV</h2>
        <p className="text-sm text-muted-foreground">
          Select your bank and upload one or more CSV exports to import transactions. Multiple files
          are merged into a single import when they share the same columns.
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
        acceptedTypes=".csv"
        maxSizeMB={25}
        maxTotalSizeMB={100}
        initialFiles={files}
      />

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
      />
    </div>
  );
}
