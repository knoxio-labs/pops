/**
 * `/inventory/labels?ids=…`: prints QR labels for the listed items onto
 * adhesive A4 sheets, as approved in the design playground's
 * `inventory/print/labels` screen (POPS-3992). The items sit on the left,
 * the job's choices above the preview on the right, and Print in the
 * header; printing is the browser's own dialog.
 */
import { Plus, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { Alert, AlertDescription, AlertTitle, Button, PageHeader, Skeleton } from '@pops/ui';

import { AddDialog } from './add-dialog';
import { MAX_LABEL_IDS, readLabelParams } from './label-params';
import { PrintOptions } from './print-options';
import { PrintPreview } from './print-preview';
import { LabelPrintStyles } from './print-styles';
import { SelectionPanel } from './selection-panel';
import { useLabelJob } from './useLabelJob';
import { useLabelSubjects } from './useLabelSubjects';
import { useSaveCode } from './useSaveCode';

import type { LabelParams } from './label-params';
import type { LabelSubjects } from './useLabelSubjects';

function printLabel(count: number): string {
  if (count === 0) return 'Print labels';
  return count === 1 ? 'Print 1 label' : `Print ${count} labels`;
}

function Header({ count, onPrint }: { count: number; onPrint?: () => void }) {
  return (
    <PageHeader
      title="Print labels"
      backHref="/inventory/items"
      breadcrumbs={[{ label: 'Inventory', href: '/inventory' }, { label: 'Print labels' }]}
      renderLink={Link}
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

const GRID = 'grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]';

function LabelsLoading() {
  return (
    <div className="space-y-4">
      <Header count={0} />
      <div className={GRID}>
        <div className="space-y-3" aria-busy="true" aria-label="Loading items">
          <Skeleton className="h-9 w-40" />
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-12 w-full" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-16 w-full max-w-3xl" />
          <Skeleton className="mx-auto aspect-[210/297] w-full max-w-md" />
        </div>
      </div>
    </div>
  );
}

function useIdsParam() {
  const [search, setSearch] = useSearchParams();
  const params = readLabelParams(search);
  const setIds = (ids: string[], dropContents = false) =>
    setSearch(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('ids', [...new Set(ids)].slice(0, MAX_LABEL_IDS).join(','));
        if (dropContents) next.delete('contents');
        return next;
      },
      { replace: true }
    );
  return { params, setIds };
}

/**
 * `contents=1` prints each listed box with what is in it: once the boxes'
 * contents are known they are written into `ids`, which stays the one
 * record of what the job holds.
 */
function useExpandContents(
  params: LabelParams,
  data: LabelSubjects,
  setIds: (ids: string[], dropContents: boolean) => void
) {
  useEffect(() => {
    if (!params.contents || data.isLoading || data.contentsLoading) return;
    const expanded = params.ids.flatMap((id) => [
      id,
      ...(data.contents.get(id) ?? []).map((held) => held.id),
    ]);
    setIds(expanded, true);
  }, [params.contents, params.ids, data.isLoading, data.contentsLoading, data.contents, setIds]);
}

function LabelsContent({
  data,
  params,
  setIds,
}: {
  data: LabelSubjects;
  params: LabelParams;
  setIds: (ids: string[]) => void;
}) {
  const job = useLabelJob(data.subjects, { template: params.template, sheetId: params.sheetId });
  const { save } = useSaveCode();
  const [addOpen, setAddOpen] = useState(false);
  const add = (ids: string[]) => setIds([...params.ids, ...ids]);
  const addControl = (
    <AddDialog
      trigger={
        <Button size="sm" variant="outline" prefix={<Plus className="size-4" aria-hidden />}>
          Add
        </Button>
      }
      open={addOpen}
      onOpenChange={setAddOpen}
      selectedIds={new Set(params.ids)}
      onAdd={add}
    />
  );
  return (
    <div className="space-y-4">
      <LabelPrintStyles />
      <Header count={job.labels.length} onPrint={job.block ? undefined : job.print} />
      <div className={GRID}>
        <aside className="flex min-w-0 flex-col lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:self-start">
          <SelectionPanel
            subjects={data.subjects}
            contents={data.contents}
            missing={data.missing}
            saveCode={save}
            addControl={addControl}
            onOpenAdd={() => setAddOpen(true)}
            onAdd={add}
            onRemove={(id) => setIds(params.ids.filter((held) => held !== id))}
          />
        </aside>
        <section className="flex min-w-0 flex-col gap-4" aria-label="Labels">
          <PrintOptions job={job} />
          <PrintPreview job={job} />
        </section>
      </div>
    </div>
  );
}

/** The label print page. */
export function LabelsPage() {
  const { params, setIds } = useIdsParam();
  const data = useLabelSubjects(params.ids);
  useExpandContents(params, data, setIds);
  if (data.isLoading || params.contents) return <LabelsLoading />;
  if (data.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load the items</AlertTitle>
        <AlertDescription>{data.error.message}</AlertDescription>
      </Alert>
    );
  }
  return <LabelsContent data={data} params={params} setIds={setIds} />;
}
