import { useState } from 'react';

import { labelsPerSheet, MIN_QR_MM } from '@pops/inventory/labels';
/**
 * The job's choices, side by side above the preview: template, sheet and
 * copies, and apart from them the label the first sheet starts on. Nothing
 * here is a designer: a template fixes its layout, the presets are the
 * standard A4 sheets whose die-cuts the page knows, and a sheet they miss is
 * measured once as the custom sheet.
 */
import { NumberInput } from '@pops/ui';

import { LabelShowsPicker } from './label-shows-picker';
import { OptionField } from './print-option-field';
import { SheetChoice } from './print-sheet-choice';
import { MAX_JOB_LABELS } from './useLabelJob';

import type { LabelContent, PrintSubject } from '@pops/inventory/labels';

import type { PrintJob } from './useLabelJob';

function CopiesChoice({ job, kind }: { job: PrintJob; kind: PrintSubject['kind'] }) {
  const label = kind === 'container' ? 'Copies per box' : 'Copies per item';
  const id = `print-copies-${kind}`;
  const [editing, setEditing] = useState<string | null>(null);
  const subjects = job.subjects.filter((subject) => subject.kind === kind).length;
  const otherLabels = job.subjects.reduce(
    (total, subject) => total + (subject.kind === kind ? 0 : job.copies[subject.kind]),
    0
  );
  const maxCopies = Math.max(1, Math.floor((MAX_JOB_LABELS - otherLabels) / subjects));
  const invalid =
    editing !== null &&
    (!Number.isSafeInteger(Number(editing)) || Number(editing) < 1 || Number(editing) > maxCopies);
  return (
    <OptionField label={label} htmlFor={id}>
      <NumberInput
        id={id}
        value={editing ?? job.copies[kind]}
        min={1}
        max={maxCopies}
        step={1}
        enableDrag={false}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onBlur={() => setEditing(null)}
        onChange={(event) => {
          const value = event.target.value;
          setEditing(value);
          const copies = Number(value);
          if (Number.isSafeInteger(copies) && copies >= 1 && copies <= maxCopies) {
            job.setCopies(kind, copies);
          }
        }}
        containerClassName="w-40"
      />
      {invalid ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          Enter a whole number from 1 to {maxCopies}. Jobs support up to {MAX_JOB_LABELS} labels.
        </p>
      ) : null}
    </OptionField>
  );
}

/**
 * Why a template is missing from this sheet, or why the sheet prints
 * nothing: a QR smaller than its minimum is a label no phone reads.
 */
export function SheetFitNotice({ job }: { job: PrintJob }) {
  if (job.block === 'too-many') {
    return (
      <p className="text-sm text-destructive" role="alert">
        This job exceeds {MAX_JOB_LABELS} labels. Reduce copies or remove items to print.
      </p>
    );
  }
  if (job.block === 'loading')
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Checking fragility in the selected items and their contents…
      </p>
    );
  if (job.block === 'too-small') {
    return (
      <p className="rounded-md border border-destructive/40 px-3 py-2 text-sm" role="alert">
        {job.fragileTooSmall ? (
          <>
            This sheet cannot fit the fragile warning beside readable label content. Choose a larger
            sheet.
          </>
        ) : (
          <>
            These labels are too small for a QR code a phone can read, which needs a {MIN_QR_MM} mm
            square beside its code. Choose a larger sheet.
          </>
        )}
      </p>
    );
  }
  if (job.adjustments.trimmed > 0) {
    return (
      <p className="rounded-md bg-muted/60 px-3 py-2 text-sm" role="status">
        {job.adjustments.trimmed} {job.adjustments.trimmed === 1 ? 'label was' : 'labels were'}
        trimmed to fit this sheet.
      </p>
    );
  }
  if (job.adjustments.fallback > 0) {
    return (
      <p className="rounded-md bg-muted/60 px-3 py-2 text-sm" role="status">
        {job.adjustments.fallback} {job.adjustments.fallback === 1 ? 'label fell' : 'labels fell'}{' '}
        back to a name or code.
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
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="print-start" className="text-xs font-medium text-muted-foreground">
        Start at label
      </label>
      <NumberInput
        id="print-start"
        value={editing ?? job.startAt}
        min={1}
        max={labelsPerSheet(job.layout)}
        step={1}
        showSteppers
        onFocus={() => setEditing(String(job.startAt))}
        onBlur={() => setEditing(null)}
        onChange={(event) => {
          setEditing(
            event.currentTarget.ownerDocument.activeElement === event.currentTarget
              ? event.target.value
              : null
          );
          job.setStartAt(Number(event.target.value));
        }}
        containerClassName="w-36"
      />
    </div>
  );
}

/** Label content, sheet and copies, in one wrapping row, and what the sheet cannot fit. */
export function PrintOptions({
  job,
  customOpen,
  onContentChange,
}: {
  job: PrintJob;
  customOpen?: boolean;
  onContentChange?: (content: LabelContent) => void;
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
          onChange={onContentChange ?? job.setContent}
        />
        {hasBoxes ? <CopiesChoice job={job} kind="container" /> : null}
        {hasItems ? <CopiesChoice job={job} kind="item" /> : null}
      </div>
      <SheetFitNotice job={job} />
    </div>
  );
}
