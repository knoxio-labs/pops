import { FileSpreadsheet } from 'lucide-react';

import { Button, FileUpload } from '@pops/ui';

import { ListBody } from '../../foundation/items-table/list-body.js';

import type { ReactElement } from 'react';

import type { FileValidationError } from '@pops/ui';

/** Props for the CSV upload step. */
export interface UploadStepProps {
  /** The complete refusal sentence shown in the alert, or null. */
  refused: string | null;
  /** Receives every chosen or dropped file, including files rejected by accept. */
  onFile: (file: File) => void;
  /** Downloads the six-column import template. */
  onTemplate: () => void;
}

function handleFileList(files: File[], onFile: UploadStepProps['onFile']): void {
  const file = files[0];
  if (file !== undefined) onFile(file);
}

function handleFileError(error: FileValidationError, onFile: UploadStepProps['onFile']): void {
  if (error.type === 'not-accepted') onFile(error.file);
}

/** Renders the CSV drop zone, explanation, refusal alert, and template action. */
export function UploadStep({ refused, onFile, onTemplate }: UploadStepProps): ReactElement {
  return (
    <ListBody className="flex flex-col items-center justify-center gap-5 p-8">
      <div className="w-full max-w-xl space-y-3">
        <FileUpload
          accept=".csv,text/csv"
          maxFiles={1}
          onFilesSelected={(files) => handleFileList(files, onFile)}
          onError={(error) => handleFileError(error, onFile)}
          prompt="Drop a CSV file here, or choose one"
          acceptHint="One .csv file with a header row, up to 5,000 rows"
        />
        {refused !== null ? (
          <p
            role="alert"
            className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
          >
            {refused}
          </p>
        ) : null}
      </div>
      <ul className="w-full max-w-xl space-y-1.5 text-sm text-muted-foreground">
        <li>Each row becomes one item. Only a name is required.</li>
        <li>
          Columns can have any names: the next step matches them to Name, Type, Quantity, Code,
          Where and Note.
        </li>
        <li>
          Rows are checked like bulk entry. Rows with problems are skipped and handed back as a CSV
          to fix.
        </li>
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onTemplate}
        prefix={<FileSpreadsheet className="size-4" aria-hidden />}
      >
        Download the template
      </Button>
    </ListBody>
  );
}
