import { Pencil } from 'lucide-react';
import { useState } from 'react';

import {
  geometryOf,
  CUSTOM_SHEET_ID,
  describeLayout,
  labelsPerSheet,
  SHEET_PRESETS,
} from '@pops/inventory/labels';
import { Button, Select } from '@pops/ui';

import { CustomSheetDialog } from './custom-sheet-dialog';
import { OptionField } from './print-option-field';

import type { PrintJob } from './use-print-job';

function sheetOptions(job: PrintJob) {
  const custom = job.customSheet
    ? `Custom · ${labelsPerSheet(job.customSheet)} per sheet, ${job.customSheet.labelWidthMm} × ${job.customSheet.labelHeightMm} mm`
    : 'Custom sheet…';
  return [
    ...SHEET_PRESETS.map((layout) => ({ value: layout.id, label: describeLayout(layout) })),
    { value: CUSTOM_SHEET_ID, label: custom },
  ];
}

/** The sheet picker: every preset, the custom sheet, and the custom sheet's form. */
export function SheetChoice({ job, customOpen }: { job: PrintJob; customOpen?: boolean }) {
  const [editing, setEditing] = useState(customOpen ?? false);
  return (
    <OptionField label="Sheet" htmlFor="print-sheet">
      <div className="flex items-center gap-1">
        <Select
          id="print-sheet"
          value={job.layout.id}
          options={sheetOptions(job)}
          onChange={(event) => {
            const id = event.target.value;
            if (id === CUSTOM_SHEET_ID && !job.customSheet) setEditing(true);
            else job.setSheet(id);
          }}
          containerClassName="w-72"
        />
        {job.layout.id === CUSTOM_SHEET_ID ? (
          <Button
            size="icon"
            variant="ghost"
            aria-label="Edit custom sheet"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      {editing ? (
        <CustomSheetDialog
          open
          onOpenChange={setEditing}
          initial={job.customSheet ?? geometryOf(job.layout)}
          onSave={(geometry) => {
            job.saveCustomSheet(geometry);
            setEditing(false);
          }}
        />
      ) : null}
    </OptionField>
  );
}
