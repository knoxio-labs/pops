import { labelsPerSheet, MIN_QR_MM } from '@pops/inventory/labels';
/**
 * The job's choices, side by side above the preview: sheet, what the label
 * shows and copies, and apart from them the label the first sheet starts
 * on. Nothing here is a designer: each choice of parts has one layout, the
 * presets are the standard A4 sheets whose die-cuts the page knows, and a
 * sheet they miss is measured once as the custom sheet.
 */
import { NumberInput, Tabs, TabsList, TabsTrigger } from '@pops/ui';

import { LabelShowsPicker } from './label-shows-picker';
import { OptionField } from './print-option-field';
import { SheetChoice } from './print-sheet-choice';

import type { PrintSubject } from '@pops/inventory/labels';

import type { PrintJob } from './use-print-job';

const COPY_CHOICES = ['1', '2', '3', '4'] as const;

function CopiesChoice({ job, kind }: { job: PrintJob; kind: PrintSubject['kind'] }) {
  const label = kind === 'container' ? 'Copies per box' : 'Copies per item';
  return (
    <OptionField label={label}>
      <Tabs
        value={String(job.copies[kind])}
        onValueChange={(value) => job.setCopies(kind, Number(value))}
      >
        <TabsList aria-label={label}>
          {COPY_CHOICES.map((choice) => (
            <TabsTrigger key={choice} value={choice}>
              {choice}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </OptionField>
  );
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/**
 * What the sheet or the items changed from the choice, in one line each:
 * a QR the labels are too small for stops the job; a QR that leaves no room
 * for the rest steps down to QR and code; a label with nothing it can show
 * prints its code.
 */
export function SheetFitNotice({ job }: { job: PrintJob }) {
  if (job.block === 'too-small') {
    return (
      <p className="rounded-md border border-destructive/40 px-3 py-2 text-sm" role="alert">
        These labels are too small for a QR code a phone can read, which needs a {MIN_QR_MM} mm
        square. Choose a larger sheet, or a label without the QR.
      </p>
    );
  }
  const { trimmed, fallback } = job.adjustments;
  const lines: string[] = [];
  if (trimmed > 0) {
    lines.push(
      `On these labels the QR leaves too little room beside it, so ${plural(trimmed, 'label prints', 'labels print')} only the QR and code.`
    );
  }
  if (fallback > 0) {
    lines.push(
      `${plural(fallback, 'label has', 'labels have')} nothing chosen to show, so ${fallback === 1 ? 'it prints its' : 'they print their'} code.`
    );
  }
  if (lines.length === 0) return null;
  return (
    <div className="space-y-0.5 rounded-md bg-muted/60 px-3 py-2 text-sm" role="status">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

/**
 * The label the first sheet starts on, for a sheet with labels already
 * peeled off. Choosing a label on the first sheet of the preview sets it too.
 */
export function StartAtControl({ job }: { job: PrintJob }) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="print-start" className="text-xs font-medium text-muted-foreground">
        Start at label
      </label>
      <NumberInput
        id="print-start"
        value={job.startAt}
        min={1}
        max={labelsPerSheet(job.layout)}
        step={1}
        showSteppers
        onChange={(event) => job.setStartAt(Number(event.target.value))}
        containerClassName="w-40"
      />
    </div>
  );
}

/** Sheet, label content and copies, in one wrapping row, and what the sheet cannot fit. */
export function PrintOptions({
  job,
  customOpen,
  labelShowsOpen,
}: {
  job: PrintJob;
  customOpen?: boolean;
  labelShowsOpen?: boolean;
}) {
  const hasBoxes = job.subjects.some((subject) => subject.kind === 'container');
  const hasItems = job.subjects.some((subject) => subject.kind === 'item');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <SheetChoice job={job} customOpen={customOpen} />
        <LabelShowsPicker
          content={job.content}
          fields={job.fields}
          onChange={job.setContent}
          defaultOpen={labelShowsOpen}
        />
        {hasBoxes ? <CopiesChoice job={job} kind="container" /> : null}
        {hasItems ? <CopiesChoice job={job} kind="item" /> : null}
      </div>
      <SheetFitNotice job={job} />
    </div>
  );
}
