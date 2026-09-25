/**
 * `/inventory/labels`: the standalone label page. The items to print sit on
 * the left, the job's choices above the preview on the right, and Print in
 * the header. The page is entered with a selection (an item's, a box's, or a
 * list's "Print labels" action) and printing is the browser's own dialog.
 * From 1024 px the page fits the frame: the item list and the sheets scroll,
 * the page does not.
 */
import { Plus, Printer } from 'lucide-react';
import { useState } from 'react';

import { Button, PageHeader, Skeleton } from '@pops/ui';

import { PrintAddDialog } from './print-add-dialog';
import { PrintOptions } from './print-options';
import { PrintPreview } from './print-preview';
import { PrintSelection } from './print-selection';
import { LabelPrintStyles } from './print-styles';
import { usePrintJob } from './use-print-job';

import type { PrintCatalogueEntry } from './print-add-dialog';
import type { TakenCode } from './print-code-field';
import type { PrintEditSeed } from './print-selection';
import type { PrintJobSeed } from './use-print-job';

/** Props for {@link PrintLabelsPage}; the review-only seeds open a state directly. */
export interface PrintLabelsPageProps {
  seed: PrintJobSeed;
  source: string;
  catalogue: PrintCatalogueEntry[];
  lookup: (code: string) => TakenCode | null;
  editSeed?: PrintEditSeed;
  addOpen?: boolean;
  addSearch?: string;
  /** Opens with the custom sheet form showing, for review. */
  customOpen?: boolean;
  /** Opens with the "Label shows" popover showing, for review. */
  labelShowsOpen?: boolean;
  monochrome?: boolean;
}

const PAGE = 'flex flex-col gap-4 lg:h-[calc(100dvh-8rem)] lg:min-h-120';
const BODY =
  'grid grid-cols-[minmax(0,1fr)] gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[20rem_minmax(0,1fr)]';

function printLabel(count: number): string {
  if (count === 0) return 'Print labels';
  return count === 1 ? 'Print 1 label' : `Print ${count} labels`;
}

function Header({ count, onPrint }: { count: number; onPrint?: () => void }) {
  return (
    <PageHeader
      title="Print labels"
      actions={
        <Button
          onClick={onPrint}
          disabled={count === 0 || !onPrint}
          prefix={<Printer className="size-4" aria-hidden />}
        >
          {printLabel(count)}
        </Button>
      }
    />
  );
}

/** The label page, composed. */
export function PrintLabelsPage(props: PrintLabelsPageProps) {
  const job = usePrintJob(props.seed);
  const [addOpen, setAddOpen] = useState(props.addOpen ?? false);
  const addControl = (
    <PrintAddDialog
      trigger={
        <Button size="sm" variant="outline" prefix={<Plus className="size-4" aria-hidden />}>
          Add
        </Button>
      }
      open={addOpen}
      onOpenChange={setAddOpen}
      catalogue={props.catalogue}
      selectedIds={new Set(job.subjects.map((subject) => subject.id))}
      onAdd={job.add}
      initialSearch={props.addSearch}
    />
  );
  return (
    <div className={PAGE}>
      <LabelPrintStyles />
      <Header count={job.labels.length} onPrint={job.block ? undefined : job.print} />
      <div className={BODY}>
        <aside className="flex min-h-0 min-w-0 flex-col">
          <PrintSelection
            job={job}
            source={props.source}
            lookup={props.lookup}
            addControl={addControl}
            onAdd={() => setAddOpen(true)}
            editSeed={props.editSeed}
          />
        </aside>
        <section className="flex min-h-0 min-w-0 flex-col gap-4" aria-label="Labels">
          <PrintOptions
            job={job}
            customOpen={props.customOpen}
            labelShowsOpen={props.labelShowsOpen}
          />
          <PrintPreview job={job} monochrome={props.monochrome} />
        </section>
      </div>
    </div>
  );
}

/** The page while the selection loads: skeletons, never a spinner. */
export function PrintLabelsLoading() {
  return (
    <div className={PAGE}>
      <Header count={0} />
      <div className={BODY}>
        <div className="space-y-3" aria-busy="true" aria-label="Loading items">
          <Skeleton className="h-9 w-40" />
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-12 w-full" />
          ))}
        </div>
        <div className="flex min-h-0 flex-col gap-4">
          <Skeleton className="h-16 w-full max-w-3xl" />
          <Skeleton className="mx-auto aspect-[210/297] min-h-0 w-full max-w-md flex-1" />
        </div>
      </div>
    </div>
  );
}
