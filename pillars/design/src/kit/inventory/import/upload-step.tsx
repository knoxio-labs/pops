/**
 * Step one: the file. A drop zone that takes one CSV, what the file needs
 * to hold, and the template for anyone starting from nothing.
 */
import { FileSpreadsheet } from 'lucide-react';

import { Button, FileUpload } from '@pops/ui';

import { ListBody } from '../items-list/list-page';

/** The upload step; `refused` names a file that was not a CSV. */
export function UploadStep({ refused }: { refused?: string }) {
  return (
    <ListBody className="flex flex-col items-center justify-center gap-5 p-8">
      <div className="w-full max-w-xl space-y-3">
        <FileUpload
          accept=".csv,text/csv"
          maxFiles={1}
          onFilesSelected={() => undefined}
          prompt="Drop a CSV file here, or choose one"
          acceptHint="One .csv file with a header row, up to 5,000 rows"
        />
        {refused ? (
          <p
            role="alert"
            className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
          >
            <span className="font-medium">{refused} was not read.</span> Only CSV files can be
            imported. Save the sheet as CSV (comma separated) and choose it again.
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
        variant="outline"
        size="sm"
        prefix={<FileSpreadsheet className="size-4" aria-hidden />}
      >
        Download the template
      </Button>
    </ListBody>
  );
}
