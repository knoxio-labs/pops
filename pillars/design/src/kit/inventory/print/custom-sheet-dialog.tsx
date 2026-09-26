/**
 * Describing a sheet the presets do not cover, from the measurements printed
 * on its packaging or its template. The drawing beside the form is the sheet
 * as entered, so a wrong margin shows before anything is wasted.
 */
import { useState } from 'react';

import {
  sheetGeometryProblems,
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  labelsPerSheet,
  slotOrigin,
} from '@pops/inventory/labels';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  NumberInput,
} from '@pops/ui';

import type { SheetGeometry } from '@pops/inventory/labels';

/** Props for {@link CustomSheetDialog}. */
export interface CustomSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the form opens holding: the remembered custom sheet, or the current sheet. */
  initial: SheetGeometry;
  onSave: (geometry: SheetGeometry) => void;
}

type Field = keyof SheetGeometry;

const FIELDS: { field: Field; label: string; unit: 'mm' | 'labels' }[] = [
  { field: 'columns', label: 'Labels across', unit: 'labels' },
  { field: 'rows', label: 'Labels down', unit: 'labels' },
  { field: 'labelWidthMm', label: 'Label width', unit: 'mm' },
  { field: 'labelHeightMm', label: 'Label height', unit: 'mm' },
  { field: 'marginTopMm', label: 'Top margin', unit: 'mm' },
  { field: 'marginLeftMm', label: 'Left margin', unit: 'mm' },
  { field: 'pitchXMm', label: 'Across pitch', unit: 'mm' },
  { field: 'pitchYMm', label: 'Down pitch', unit: 'mm' },
];

function SheetSketch({ geometry }: { geometry: SheetGeometry }) {
  const count = sheetGeometryProblems(geometry).length === 0 ? labelsPerSheet(geometry) : 0;
  return (
    <svg
      viewBox={`0 0 ${A4_WIDTH_MM} ${A4_HEIGHT_MM}`}
      className="h-56 w-auto shrink-0 rounded-sm bg-qr-quiet-zone ring-1 ring-border"
      role="img"
      aria-label={count > 0 ? `A4 sheet with ${count} labels` : 'A4 sheet, labels do not fit'}
    >
      {Array.from({ length: count }, (_, slot) => {
        const origin = slotOrigin(geometry, slot);
        return (
          <rect
            key={slot}
            x={origin.xMm}
            y={origin.yMm}
            width={geometry.labelWidthMm}
            height={geometry.labelHeightMm}
            rx={1.5}
            className="fill-print-tint stroke-print-rule-strong"
            strokeWidth={0.6}
          />
        );
      })}
    </svg>
  );
}

function SheetFields({
  draft,
  onChange,
}: {
  draft: SheetGeometry;
  onChange: (update: (current: SheetGeometry) => SheetGeometry) => void;
}) {
  return (
    <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
      {FIELDS.map(({ field, label, unit }) => (
        <div key={field} className="flex flex-col gap-1.5">
          <label htmlFor={`custom-sheet-${field}`} className="text-xs font-medium">
            {label}
          </label>
          <NumberInput
            id={`custom-sheet-${field}`}
            value={Number.isFinite(draft[field]) ? draft[field] : ''}
            min={unit === 'labels' ? 1 : 0}
            step={unit === 'labels' ? 1 : 'any'}
            suffix={unit === 'mm' ? 'mm' : undefined}
            showSteppers={false}
            centered={false}
            containerClassName="w-full min-w-0"
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                [field]: event.target.value === '' ? Number.NaN : Number(event.target.value),
              }))
            }
          />
        </div>
      ))}
    </div>
  );
}

/** The custom sheet form; saves only a sheet whose labels stay on the page. */
export function CustomSheetDialog({ open, onOpenChange, initial, onSave }: CustomSheetDialogProps) {
  const [draft, setDraft] = useState<SheetGeometry>(initial);
  const problems = sheetGeometryProblems(draft);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Custom sheet</DialogTitle>
          <DialogDescription>
            Measurements from the sheet&apos;s packaging or template, in millimetres. This browser
            remembers them.
          </DialogDescription>
        </DialogHeader>
        <form
          id="custom-sheet-form"
          className="flex flex-col gap-4 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (problems.length === 0) onSave(draft);
          }}
        >
          <SheetFields draft={draft} onChange={setDraft} />
          <SheetSketch geometry={draft} />
        </form>
        {problems.length > 0 ? (
          <ul className="space-y-1 text-sm text-destructive" role="alert">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="custom-sheet-form" disabled={problems.length > 0}>
            Use this sheet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
