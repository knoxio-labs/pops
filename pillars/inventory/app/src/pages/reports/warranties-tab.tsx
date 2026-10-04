import { ShieldCheck } from 'lucide-react';
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { Button, EmptyState, Tabs, TabsList, TabsTrigger, cn } from '@pops/ui';

import { ItemMark } from '../../foundation/badges/item-mark.js';
import { StateBanner } from '../../foundation/feedback/state-banner.js';
import { ColumnHeader, PAPERLESS_DOWN_REASON, ReceiptLink } from './insurance-rows.js';
import { formatDollars } from './report-model.js';
import { ReportPanel, ReportSkeletonRows } from './reports-parts.js';
import { WarrantiesFailedBody } from './warranties-failed-body.js';
import {
  WARRANTY_TIERS,
  WARRANTY_TIER_EMPTY as TIER_EMPTY,
  WARRANTY_TIER_LABEL_KEYS as TIER_LABEL_KEYS,
  daysLabel,
  tierCounts,
  warrantyRows,
  type WarrantyRow,
  type WarrantyTier,
} from './warranty-model.js';

import type { PaperlessState } from '../../inventory-web/usePaperlessStatus.js';
import type { ReportEntry } from '../../inventory-web/useReportEntries.js';

const GRID = 'grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_6.5rem_6.5rem_5rem_5.5rem]';

/** Props for the Reports Warranties tab. */
export interface WarrantiesTabProps {
  entries: readonly ReportEntry[];
  status: 'ready' | 'loading' | 'error';
  tier: WarrantyTier;
  now: Date;
  paperlessState: PaperlessState | null;
  onTierChange: (tier: WarrantyTier) => void;
  onRetry: () => void;
}

function Row({ row, paperlessState }: { row: WarrantyRow; paperlessState: PaperlessState | null }) {
  const value =
    row.entry.replacementValue === null ? null : row.entry.replacementValue * row.entry.quantity;
  const paperlessDown = paperlessState?.available !== true;
  return (
    <li className={cn('grid h-11 items-center gap-3 px-3', GRID)}>
      <span className="flex min-w-0 items-center gap-2">
        <ItemMark item={{ name: row.entry.name, photoUrl: null, container: null }} />
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-9 min-w-0 shrink justify-start px-0 text-sm font-medium hover:bg-transparent hover:underline"
        >
          <Link
            to={`/inventory/items/${encodeURIComponent(row.entry.itemId)}`}
            aria-label={`Open ${row.entry.name}`}
          >
            <span className="truncate">{row.entry.name}</span>
          </Link>
        </Button>
      </span>
      <span className="truncate text-xs text-muted-foreground">{row.entry.room.label}</span>
      <span className="text-xs tabular-nums">
        {new Date(`${row.expires}T00:00:00`).toLocaleDateString('en-AU', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </span>
      <span
        className={cn(
          'text-xs tabular-nums',
          row.tier === 'soon' ? 'font-medium' : 'text-muted-foreground'
        )}
      >
        {daysLabel(row.days)}
      </span>
      <span className="text-right text-xs tabular-nums text-muted-foreground">
        {value === null ? '' : formatDollars(value)}
      </span>
      <span className="flex justify-end">
        <ReceiptLink
          receiptId={row.entry.receiptId}
          paperlessBaseUrl={paperlessState?.baseUrl ?? null}
          paperlessDown={paperlessDown}
        />
      </span>
    </li>
  );
}

function TierTabs({
  tier,
  counts,
  onChange,
}: {
  tier: WarrantyTier;
  counts: Record<WarrantyTier, number>;
  onChange: (tier: WarrantyTier) => void;
}) {
  const { t } = useTranslation('inventory');

  return (
    <Tabs
      value={tier}
      onValueChange={(value) => {
        const next = WARRANTY_TIERS.find((entry) => entry === value);
        if (next !== undefined) onChange(next);
      }}
    >
      <TabsList aria-label="When the warranty ends">
        {WARRANTY_TIERS.map((entry) => (
          <TabsTrigger key={entry} value={entry} className="flex-none gap-1.5 px-3">
            {t(TIER_LABEL_KEYS[entry])}
            <span className="text-xs tabular-nums text-muted-foreground">{counts[entry]}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function WarrantyTable({
  rows,
  tier,
  status,
  paperlessState,
}: {
  rows: readonly WarrantyRow[];
  tier: WarrantyTier;
  status: WarrantiesTabProps['status'];
  paperlessState: PaperlessState | null;
}) {
  return (
    <ReportPanel title="Warranties">
      <ColumnHeader className={GRID}>
        <span>Item</span>
        <span>Room</span>
        <span>Ends</span>
        <span>{tier === 'expired' ? 'Ended' : 'Left'}</span>
        <span className="text-right">Value</span>
        <span className="text-right">Receipt</span>
      </ColumnHeader>
      {status === 'loading' ? <ReportSkeletonRows /> : null}
      {status === 'ready' && rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{TIER_EMPTY[tier]}</p>
      ) : null}
      {status === 'ready' ? (
        <ul className="divide-y divide-border/60">
          {rows.map((row) => (
            <Row key={row.entry.itemId} row={row} paperlessState={paperlessState} />
          ))}
        </ul>
      ) : null}
    </ReportPanel>
  );
}

/** Renders warranties grouped into the four local tier tabs. */
export function WarrantiesTab(props: WarrantiesTabProps): ReactElement {
  const rows = warrantyRows(props.entries, props.now);
  if (props.status === 'error') {
    return (
      <ReportPanel title="Warranties">
        <WarrantiesFailedBody onRetry={props.onRetry} />
      </ReportPanel>
    );
  }
  if (props.status === 'ready' && rows.length === 0) {
    return (
      <ReportPanel title="Warranties">
        <EmptyState
          icon={ShieldCheck}
          title="No warranties recorded"
          description="Add a warranty end date to an item and it is tracked here, soonest first."
        />
      </ReportPanel>
    );
  }
  const paperlessDown =
    props.paperlessState?.configured === true && !props.paperlessState.available;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <TierTabs tier={props.tier} counts={tierCounts(rows)} onChange={props.onTierChange} />
      {paperlessDown ? (
        <StateBanner
          kind="error"
          title={PAPERLESS_DOWN_REASON}
          detail="Receipts stay listed; they open again once Paperless answers."
        />
      ) : null}
      <WarrantyTable
        rows={rows.filter((row) => row.tier === props.tier)}
        tier={props.tier}
        status={props.status}
        paperlessState={props.paperlessState}
      />
    </div>
  );
}
