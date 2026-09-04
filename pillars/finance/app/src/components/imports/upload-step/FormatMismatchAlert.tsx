import { FileWarning } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle, Button } from '@pops/ui';

import { BANK_OPTIONS } from './bank-upload-config';

import type { BankDialectId } from '../../../store/import-store-types';

/**
 * Shown when the uploaded file's first row is a header but the chosen bank's
 * export has none (POPS-2854) — the one direction {@link firstRowIsHeader}
 * cannot self-heal, because a headerless dialect has no column names of its
 * own to fall back on. Names the row exactly as read so the person can judge
 * whether it is the wrong file or the wrong bank, and offers only the two
 * remedies that make sense here: nothing has been read yet, so there is
 * nothing to "continue anyway" with.
 */
export function FormatMismatchAlert({
  dialectId,
  headerRow,
  onChangeFormat,
  onChooseAnotherFile,
}: {
  dialectId: BankDialectId;
  headerRow: string;
  onChangeFormat: () => void;
  onChooseAnotherFile: () => void;
}) {
  const label = BANK_OPTIONS.find((bank) => bank.value === dialectId)?.label ?? dialectId;
  return (
    <Alert variant="destructive">
      <FileWarning aria-hidden />
      <AlertTitle>This does not look like {label}</AlertTitle>
      <AlertDescription>
        <p>
          The first row reads{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">{headerRow}</code>, and {label} has
          no header row. Nothing has been read.
        </p>
        <p>Either the file is a different export, or the format above is the wrong one for it.</p>
        <span className="mt-1 flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onChangeFormat}>
            Change the format
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onChooseAnotherFile}>
            Choose another file
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
