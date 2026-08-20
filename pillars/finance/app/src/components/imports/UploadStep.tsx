import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { RadioInput } from '@pops/ui';

import { useImportStore } from '../../store/importStore';
import { FileUpload } from './FileUpload';
import { uploadRoute } from './pdf/anz-pdf-import';
import { PdfStatementFindings } from './pdf/PdfStatementFindings';
import { BANK_ACCEPTED_TYPES, BANK_OPTIONS, bankTakesPdf } from './upload-step/bank-upload-config';
import { BankExportHelp, UploadFooter, UploadStepHeader } from './upload-step/UploadStepChrome';
import { useCsvStage } from './upload-step/useCsvStage';
import { usePdfStage } from './upload-step/usePdfStage';

import type { BankType } from '../../store/import-store-types';

const MIXED_UPLOAD_ERROR =
  'Select either CSV exports or PDF statements, not both. They are read differently and a period covered by both would import twice.';

function useUploadStep() {
  const { files, rows, bankType, setFiles, setBankType, nextStep } = useImportStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pdf = usePdfStage(setError, setIsProcessing);
  const runCsv = useCsvStage(files, bankType, setError, setIsProcessing);

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

  const handleNext = useCallback(async () => {
    const route = uploadRoute(files);
    if (route === 'empty') {
      // A resumed run has parsed rows but no re-attached File handles; advance
      // without re-parsing instead of demanding a re-upload (which would cascade
      // a downstream reset over the restored work).
      if (rows.length > 0) nextStep();
      else setError('Please select at least one file');
      return;
    }
    if (route === 'mixed') {
      setError(MIXED_UPLOAD_ERROR);
      return;
    }
    await (route === 'pdf' ? pdf.run(files) : runCsv());
  }, [files, rows, nextStep, pdf, runCsv]);

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

  return (
    <div className="space-y-6">
      <UploadStepHeader takesPdf={bankTakesPdf(bankType)} />

      <RadioInput
        label="Bank"
        options={BANK_OPTIONS}
        value={bankType}
        onValueChange={handleBankChange}
        orientation="horizontal"
      />

      <FileUpload
        onFilesSelect={handleFilesSelect}
        acceptedTypes={BANK_ACCEPTED_TYPES[bankType]}
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

      <BankExportHelp bankType={bankType} />

      {error && (
        <div className="p-4 text-sm text-destructive bg-destructive/10 dark:text-destructive/40 rounded-lg">
          {error}
        </div>
      )}

      <UploadFooter
        onNext={handleNext}
        disabled={(files.length === 0 && rows.length === 0) || isProcessing}
        isProcessing={isProcessing}
        pdfStatement={pdfStatement}
      />
    </div>
  );
}
