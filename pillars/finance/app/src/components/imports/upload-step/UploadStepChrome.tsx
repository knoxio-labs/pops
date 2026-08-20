import { Button } from '@pops/ui';

import { BANK_HELP, BANK_OPTIONS } from './bank-upload-config';

import type { BankType } from '../../../store/import-store-types';
import type { AnzPdfStatementImport } from '../pdf/anz-pdf-import';

export function UploadStepHeader({ takesPdf }: { takesPdf: boolean }) {
  return (
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
  );
}

export function BankExportHelp({ bankType }: { bankType: BankType }) {
  const label = BANK_OPTIONS.find((bank) => bank.value === bankType)?.label ?? bankType;
  return (
    <div className="bg-info/5 border border-info/20 rounded-lg p-4">
      <h3 className="text-sm font-medium text-info mb-2">How to export from {label}</h3>
      <p className="text-xs text-info">{BANK_HELP[bankType]}</p>
    </div>
  );
}

function footerLabel(pdfStatement: AnzPdfStatementImport | null): string {
  if (!pdfStatement) return 'Next';
  const count = pdfStatement.plan.importable.length;
  return `Import ${count} transaction${count === 1 ? '' : 's'}`;
}

/**
 * The step's single forward control.
 *
 * Once a PDF's findings are on screen the button stops saying "Next" and names
 * what pressing it will import, so the second press is an informed one rather
 * than a repeat of the first.
 */
export function UploadFooter({
  onNext,
  disabled,
  isProcessing,
  pdfStatement,
}: {
  onNext: () => void;
  disabled: boolean;
  isProcessing: boolean;
  pdfStatement: AnzPdfStatementImport | null;
}) {
  return (
    <div className="flex justify-end gap-3">
      <Button onClick={onNext} disabled={disabled}>
        {isProcessing ? 'Processing...' : footerLabel(pdfStatement)}
      </Button>
    </div>
  );
}
