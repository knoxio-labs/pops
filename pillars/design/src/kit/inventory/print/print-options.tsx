/**
 * The job's choices, side by side above the preview: template, sheet and
 * copies, and apart from them the label the first sheet starts on. Nothing here is a
 * designer: a template fixes its layout, and the sheet sizes are the three
 * adhesive A4 sheets the page knows the die-cuts of.
 */
import { Package, Tag } from 'lucide-react';

import { NumberInput, Select, Tabs, TabsList, TabsTrigger } from '@pops/ui';

import { describeLayout, labelsPerSheet, SHEET_LAYOUTS } from './sheet-layouts';

import type { ReactNode } from 'react';

import type { LabelTemplateId } from './print-subject';
import type { SheetLayoutId } from './sheet-layouts';
import type { PrintJob } from './use-print-job';

const COPY_CHOICES = ['1', '2', '3', '4'] as const;

const LAYOUT_OPTIONS = SHEET_LAYOUTS.map((layout) => ({
  value: layout.id,
  label: describeLayout(layout),
}));

function isLayoutId(value: string): value is SheetLayoutId {
  return SHEET_LAYOUTS.some((layout) => layout.id === value);
}

function isTemplateId(value: string): value is LabelTemplateId {
  return value === 'container' || value === 'item';
}

function Option({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  const caption = 'text-xs font-medium text-muted-foreground';
  return (
    <div className="flex flex-col gap-1.5">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={caption}>
          {label}
        </label>
      ) : (
        <span className={caption} aria-hidden>
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

function TemplateChoice({ job }: { job: PrintJob }) {
  return (
    <Option label="Template">
      <Tabs
        value={job.template}
        onValueChange={(value) => {
          if (isTemplateId(value)) job.setTemplate(value);
        }}
      >
        <TabsList aria-label="Template">
          <TabsTrigger value="container">
            <Package aria-hidden />
            Container
          </TabsTrigger>
          <TabsTrigger value="item">
            <Tag aria-hidden />
            Item
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </Option>
  );
}

function CopiesChoice({ job }: { job: PrintJob }) {
  return (
    <Option label="Copies">
      <Tabs value={String(job.copies)} onValueChange={(value) => job.setCopies(Number(value))}>
        <TabsList aria-label="Copies of each label">
          {COPY_CHOICES.map((choice) => (
            <TabsTrigger key={choice} value={choice}>
              {choice}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </Option>
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
        containerClassName="w-36"
      />
    </div>
  );
}

/** Template, sheet and copies, in one wrapping row. */
export function PrintOptions({ job }: { job: PrintJob }) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <TemplateChoice job={job} />
      <Option label="Sheet" htmlFor="print-sheet">
        <Select
          id="print-sheet"
          value={job.layout.id}
          options={LAYOUT_OPTIONS}
          onChange={(event) => {
            if (isLayoutId(event.target.value)) job.setLayout(event.target.value);
          }}
          containerClassName="w-60"
        />
      </Option>
      <CopiesChoice job={job} />
    </div>
  );
}
