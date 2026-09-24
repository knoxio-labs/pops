/**
 * The job's choices, side by side above the preview: template, sheet and
 * copies, and apart from them the label the first sheet starts on. Nothing
 * here is a designer: a template fixes its layout, the presets are the
 * standard A4 sheets whose die-cuts the page knows, and a sheet they miss is
 * measured once as the custom sheet.
 */
import { NumberInput, Tabs, TabsList, TabsTrigger } from '@pops/ui';

import { OptionField } from './print-option-field';
import { SheetChoice } from './print-sheet-choice';
import { labelsPerSheet, MIN_QR_MM } from './sheet-layouts';

import type { LabelTemplateChoice, PrintSubject } from './print-subject';
import type { PrintJob } from './use-print-job';

const COPY_CHOICES = ['1', '2', '3', '4'] as const;

function isTemplateChoice(value: string): value is LabelTemplateChoice {
  return value === 'auto' || value === 'container' || value === 'item';
}

function TemplateChoice({ job }: { job: PrintJob }) {
  if (!job.fits.item) return null;
  return (
    <OptionField label="Template">
      <Tabs
        value={job.template}
        onValueChange={(value) => {
          if (isTemplateChoice(value)) job.setTemplate(value);
        }}
      >
        <TabsList aria-label="Template">
          <TabsTrigger value="auto">Auto</TabsTrigger>
          {job.fits.container ? <TabsTrigger value="container">Box</TabsTrigger> : null}
          <TabsTrigger value="item">Item</TabsTrigger>
        </TabsList>
      </Tabs>
    </OptionField>
  );
}

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

/**
 * Why a template is missing from this sheet, or why the sheet prints
 * nothing: a QR smaller than its minimum is a label no phone reads.
 */
export function SheetFitNotice({ job }: { job: PrintJob }) {
  if (!job.fits.item) {
    return (
      <p className="rounded-md border border-destructive/40 px-3 py-2 text-sm" role="alert">
        These labels are too small for a QR code a phone can read, which needs a {MIN_QR_MM} mm
        square beside its code. Choose a larger sheet.
      </p>
    );
  }
  if (!job.fits.container) {
    return (
      <p className="rounded-md bg-muted/60 px-3 py-2 text-sm" role="status">
        These labels are too narrow for the box label, so boxes get the item label: QR and code.
      </p>
    );
  }
  return null;
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
        containerClassName="w-36"
      />
    </div>
  );
}

/** Template, sheet and copies, in one wrapping row, and what the sheet cannot fit. */
export function PrintOptions({ job, customOpen }: { job: PrintJob; customOpen?: boolean }) {
  const hasBoxes = job.subjects.some((subject) => subject.kind === 'container');
  const hasItems = job.subjects.some((subject) => subject.kind === 'item');
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <SheetChoice job={job} customOpen={customOpen} />
        <TemplateChoice job={job} />
        {hasBoxes ? <CopiesChoice job={job} kind="container" /> : null}
        {hasItems ? <CopiesChoice job={job} kind="item" /> : null}
      </div>
      <SheetFitNotice job={job} />
    </div>
  );
}
