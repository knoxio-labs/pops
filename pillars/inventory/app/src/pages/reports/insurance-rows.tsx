import { Camera, FileText } from 'lucide-react';

import { ButtonPrimitive, cn } from '@pops/ui';

import { CodeBadge } from '../../foundation/badges/badges.js';
import { hasGap, entryValue } from './insurance-model.js';
import { formatDollars } from './report-model.js';

import type { ReactNode } from 'react';

import type { ReportEntry } from '../../inventory-web/useReportEntries.js';
import type { InsuranceGroup } from './insurance-model.js';

/** The reason a receipt stays visible but cannot open during a Paperless outage. */
export const PAPERLESS_DOWN_REASON = 'Paperless unreachable, documents unavailable.';

/** A compact report column header with the same grid as its rows. */
export function ColumnHeader({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid min-h-9 items-center gap-3 border-b px-3 text-xs font-medium text-muted-foreground',
        className
      )}
    >
      {children}
    </div>
  );
}

/** A Paperless receipt number that remains listed and disabled when unavailable. */
export function ReceiptLink({
  receiptId,
  paperlessBaseUrl,
  paperlessDown,
}: {
  receiptId: number | null;
  paperlessBaseUrl: string | null;
  paperlessDown: boolean;
}) {
  if (receiptId === null) return <span className="text-xs text-muted-foreground">No receipt</span>;
  const label = `Open receipt ${receiptId} in Paperless`;
  if (!paperlessDown && paperlessBaseUrl !== null) {
    return (
      <a
        href={`${paperlessBaseUrl}/documents/${receiptId}/details`}
        target="_blank"
        rel="noopener noreferrer"
        className="relative inline-flex min-h-11 min-w-11 items-center gap-1 rounded-md px-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={label}
        title={label}
      >
        <FileText className="size-3.5" aria-hidden />#{receiptId}
      </a>
    );
  }
  return (
    <ButtonPrimitive
      variant="ghost"
      size="xs"
      disabled
      aria-label={label}
      title={PAPERLESS_DOWN_REASON}
      className="gap-1 px-1 text-xs font-normal"
    >
      <FileText className="size-3.5" aria-hidden />#{receiptId}
    </ButtonPrimitive>
  );
}

const GRID =
  'grid-cols-[minmax(0,1.8fr)_3rem_5.5rem_5rem_3rem] @3xl:grid-cols-[minmax(0,1.8fr)_3rem_5.5rem_5.5rem_6rem_5rem_3rem]';

function shortDate(isoDate: string | null): string {
  if (isoDate === null) return 'Unknown';
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function MoneyCells({ entry }: { entry: ReportEntry }) {
  const total = entryValue(entry);
  return (
    <>
      <span className="hidden text-right text-muted-foreground @3xl:block">
        {entry.replacementValue === null ? '' : formatDollars(entry.replacementValue)}
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

function Row({
  entry,
  paperlessBaseUrl,
  paperlessDown,
}: {
  entry: ReportEntry;
  paperlessBaseUrl: string | null;
  paperlessDown: boolean;
}) {
  return (
    <li
      className={cn(
        'grid h-10 items-center gap-3 px-3 text-xs tabular-nums',
        GRID,
        hasGap(entry) && 'bg-warning/5'
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm">{entry.name}</span>
        <span className="shrink-0 whitespace-nowrap">
          <CodeBadge code={entry.code} />
        </span>
      </span>
      <span className="text-right">{entry.quantity}</span>
      <MoneyCells entry={entry} />
      <span className="hidden text-muted-foreground @3xl:block">
        {shortDate(entry.purchasedOn)}
      </span>
      <span className="flex justify-end">
        <ReceiptLink
          receiptId={entry.receiptId}
          paperlessBaseUrl={paperlessBaseUrl}
          paperlessDown={paperlessDown}
        />
      </span>
      <PhotoCount photos={entry.photos} />
    </li>
  );
}

/** Renders one room heading and all visible entries in that room. */
export function InsuranceRoom({
  group,
  paperlessBaseUrl,
  paperlessDown,
}: {
  group: InsuranceGroup;
  paperlessBaseUrl: string | null;
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
          <Row
            key={entry.itemId}
            entry={entry}
            paperlessBaseUrl={paperlessBaseUrl}
            paperlessDown={paperlessDown}
          />
        ))}
      </ul>
    </li>
  );
}

/** The insurance schedule's responsive column captions. */
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
