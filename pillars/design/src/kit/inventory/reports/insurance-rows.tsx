import { CodeBadge } from '@/kit/inventory/foundation';
import { ColumnHeader } from '@/kit/inventory/secondary-page';
/**
 * The insurance schedule's rows: a room header with its subtotal, then one
 * line per record. A row missing a value or a photo is tinted, since those
 * are the gaps an insurer asks about.
 */
import { Camera } from 'lucide-react';

import { cn } from '@pops/ui';

import { hasGap } from './insurance-model';
import { entryValue, formatDollars } from './report-model';
import { ReceiptLink } from './report-parts';

import type { InsuranceGroup } from './insurance-model';
import type { ReportEntry } from './report-model';

const GRID =
  'grid-cols-[minmax(0,1.8fr)_3rem_5.5rem_5rem_3rem] @3xl:grid-cols-[minmax(0,1.8fr)_3rem_5.5rem_5.5rem_6rem_5rem_3rem]';

function shortDate(iso: string | null): string {
  if (iso === null) return 'Unknown';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function MoneyCells({ entry }: { entry: ReportEntry }) {
  const unit = entry.provenance?.replacementValue;
  const total = entryValue(entry);
  return (
    <>
      <span className="hidden text-right text-muted-foreground @3xl:block">
        {unit == null ? '' : formatDollars(unit)}
      </span>
      <span className={cn('text-right', total === null && 'text-muted-foreground')}>
        {total === null ? 'No value' : formatDollars(total)}
      </span>
    </>
  );
}

function PhotoCount({ photos }: { photos: number }) {
  return (
    <span
      className={cn('flex items-center justify-end gap-1', photos === 0 && 'text-muted-foreground')}
    >
      <Camera className="size-3.5" aria-hidden />
      <span className="sr-only">Photos</span>
      {photos}
    </span>
  );
}

function Row({ entry, paperlessDown }: { entry: ReportEntry; paperlessDown: boolean }) {
  const { item, provenance } = entry;
  return (
    <li
      className={cn(
        'grid h-10 items-center gap-3 px-3 text-xs tabular-nums',
        GRID,
        hasGap(entry) && 'bg-warning/5'
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm">{item.name}</span>
        <span className="shrink-0 whitespace-nowrap">
          <CodeBadge code={item.code} />
        </span>
      </span>
      <span className="text-right">{item.quantity}</span>
      <MoneyCells entry={entry} />
      <span className="hidden text-muted-foreground @3xl:block">
        {shortDate(provenance?.purchasedOn ?? null)}
      </span>
      <span className="flex justify-end">
        <ReceiptLink receiptId={provenance?.receiptId ?? null} paperlessDown={paperlessDown} />
      </span>
      <PhotoCount photos={provenance?.photos ?? 0} />
    </li>
  );
}

/** One room of the schedule and its rows. */
export function InsuranceRoom({
  group,
  paperlessDown,
}: {
  group: InsuranceGroup;
  paperlessDown: boolean;
}) {
  return (
    <li>
      <div className="sticky top-0 z-10 flex h-9 items-center justify-between border-y bg-muted/80 px-3 backdrop-blur">
        <span className="text-sm font-medium">{group.room}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {group.entries.length === 1 ? '1 item' : `${group.entries.length} items`},{' '}
          <span className="font-medium text-foreground">{formatDollars(group.subtotal)}</span>
        </span>
      </div>
      <ul className="divide-y divide-border/60">
        {group.entries.map((entry) => (
          <Row key={entry.item.id} entry={entry} paperlessDown={paperlessDown} />
        ))}
      </ul>
    </li>
  );
}

/** The schedule's column captions; Each and Bought drop out on narrow widths. */
export function InsuranceColumns() {
  return (
    <ColumnHeader className={GRID}>
      <span>Item</span>
      <span className="text-right">Qty</span>
      <span className="hidden text-right @3xl:block">Each</span>
      <span className="text-right">Total</span>
      <span className="hidden @3xl:block">Bought</span>
      <span className="text-right">Receipt</span>
      <span className="text-right">Photos</span>
    </ColumnHeader>
  );
}
