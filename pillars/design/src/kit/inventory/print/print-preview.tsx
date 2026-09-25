/**
 * The right-hand side of the label page: the job in one line, what happened
 * after the print dialog closed, and the sheets themselves.
 */
import { CheckCircle2, Printer, Tags } from 'lucide-react';

import { Button } from '@pops/ui';

import { StartAtControl } from './print-options';
import { PrintSheets } from './print-sheets';

import type { PrintJob } from './use-print-job';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "6 labels on 1 sheet, labels 1–6" / "31 labels on 3 sheets, from label 7". */
export function jobSummary(job: PrintJob): string {
  const count = job.labels.length;
  const sheets = plural(job.pages.length, 'sheet', 'sheets');
  const labels = plural(count, 'label', 'labels');
  if (job.pages.length === 1) {
    const last = job.startAt + count - 1;
    const range = count === 1 ? `label ${job.startAt}` : `labels ${job.startAt}–${last}`;
    return `${labels} on ${sheets}, ${range}`;
  }
  return `${labels} on ${sheets}, from label ${job.startAt}`;
}

function OutcomeBar({ job }: { job: PrintJob }) {
  if (job.outcome === 'none') return null;
  const frame = 'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border px-3 py-2 text-sm';
  if (job.outcome === 'asking') {
    return (
      <div className={frame} role="status">
        <span className="flex-1">Did the labels print?</span>
        <Button size="sm" onClick={() => job.answer(true)}>
          Yes, next starts at {job.nextStart}
        </Button>
        <Button size="sm" variant="outline" onClick={() => job.answer(false)}>
          No
        </Button>
      </div>
    );
  }
  if (job.outcome === 'printed') {
    return (
      <div className={frame} role="status">
        <CheckCircle2 className="size-4 text-app-accent" aria-hidden />
        <span className="flex-1">Next print starts at label {job.startAt}.</span>
      </div>
    );
  }
  return (
    <div className={frame} role="status">
      <span className="flex-1">
        Nothing printed. The sheet still starts at label {job.startAt}.
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={job.print}
        prefix={<Printer className="size-4" aria-hidden />}
      >
        Print again
      </Button>
    </div>
  );
}

function EmptyPreview() {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground">
      <Tags className="size-6" aria-hidden />
      Add items to see their labels
    </div>
  );
}

/** Summary, start control, print outcome and the sheets. */
export function PrintPreview({ job, monochrome = false }: { job: PrintJob; monochrome?: boolean }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span className="font-medium">
            {job.labels.length > 0 ? jobSummary(job) : 'No labels'}
          </span>
          <span className="text-xs text-muted-foreground">A4, actual size, no margins</span>
        </p>
        <StartAtControl job={job} />
      </div>
      <OutcomeBar job={job} />
      {job.pages.length === 0 ? (
        <EmptyPreview />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-muted/40 p-4 print:overflow-visible print:bg-transparent print:p-0">
          <PrintSheets
            pages={job.pages}
            labels={job.labels}
            layout={job.layout}
            onStartAt={job.setStartAt}
            monochrome={monochrome}
          />
        </div>
      )}
    </div>
  );
}
