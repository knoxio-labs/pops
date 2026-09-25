import { ItemMark, StateBanner } from '@/kit/inventory/foundation';
import {
  ColumnHeader,
  EmptyBody,
  LoadFailedBody,
  ScrollPanel,
  SkeletonRows,
} from '@/kit/inventory/secondary-page';
/**
 * Reports, Warranties (was its own nav item): warranties in four segments by
 * how soon they end, each row with the item, where it is, the end date, how
 * long is left and the Paperless receipt a claim needs. With Paperless down
 * the receipts stay listed and say why they cannot open.
 */
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { ButtonPrimitive, Tabs, TabsList, TabsTrigger, cn } from '@pops/ui';

import { formatDollars, entryValue, roomOf } from './report-model';
import { PAPERLESS_DOWN_REASON, ReceiptLink } from './report-parts';
import { WARRANTY_TIERS, daysLabel, tierCounts, warrantyRows } from './warranty-model';

import type { PlacementWorld } from '@/kit/inventory/foundation';

import type { ReportEntry } from './report-model';
import type { WarrantyRow, WarrantyTier } from './warranty-model';

const TIER_LABELS: Readonly<Record<WarrantyTier, string>> = {
  soon: 'Next 30 days',
  quarter: '31 to 90 days',
  later: 'Later',
  expired: 'Expired',
};

const TIER_EMPTY: Readonly<Record<WarrantyTier, string>> = {
  soon: 'No warranty ends in the next 30 days.',
  quarter: 'No warranty ends between 31 and 90 days from now.',
  later: 'No warranty runs longer than 90 days.',
  expired: 'No recorded warranty has ended.',
};

const GRID = 'grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_6.5rem_6.5rem_5rem_5.5rem]';

/** Props for {@link WarrantiesTab}. */
export interface WarrantiesTabProps {
  entries: readonly ReportEntry[];
  world: PlacementWorld;
  now: Date;
  status?: 'ready' | 'loading' | 'error';
  tier?: WarrantyTier;
  paperlessDown?: boolean;
  onOpenItem?: (id: string) => void;
}

function Row({
  row,
  world,
  paperlessDown,
  onOpen,
}: {
  row: WarrantyRow;
  world: PlacementWorld;
  paperlessDown: boolean;
  onOpen?: (id: string) => void;
}) {
  const { item } = row.entry;
  const value = entryValue(row.entry);
  return (
    <li className={cn('grid h-11 items-center gap-3 px-3', GRID)}>
      <span className="flex min-w-0 items-center gap-2">
        <ItemMark item={item} />
        <ButtonPrimitive
          variant="ghost"
          size="xs"
          className="h-auto min-w-0 shrink justify-start px-0 text-sm font-medium hover:bg-transparent hover:underline"
          aria-label={`Open ${item.name}`}
          onClick={() => onOpen?.(item.id)}
        >
          <span className="truncate">{item.name}</span>
        </ButtonPrimitive>
      </span>
      <span className="truncate text-xs text-muted-foreground">{roomOf(world, item.id).name}</span>
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
          receiptId={row.entry.provenance?.receiptId ?? null}
          paperlessDown={paperlessDown}
        />
      </span>
    </li>
  );
}

function TierTabs(props: {
  tier: WarrantyTier;
  counts: Record<WarrantyTier, number>;
  onChange: (tier: WarrantyTier) => void;
}) {
  return (
    <Tabs
      value={props.tier}
      onValueChange={(value) => {
        const found = WARRANTY_TIERS.find((entry) => entry === value);
        if (found) props.onChange(found);
      }}
    >
      <TabsList aria-label="When the warranty ends">
        {WARRANTY_TIERS.map((entry) => (
          <TabsTrigger key={entry} value={entry} className="flex-none gap-1.5 px-3">
            {TIER_LABELS[entry]}
            <span className="text-xs tabular-nums text-muted-foreground">
              {props.counts[entry]}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function WarrantyTable(props: {
  rows: readonly WarrantyRow[];
  tier: WarrantyTier;
  loading: boolean;
  tab: WarrantiesTabProps;
}) {
  const header = (
    <ColumnHeader className={GRID}>
      <span>Item</span>
      <span>Room</span>
      <span>Ends</span>
      <span>{props.tier === 'expired' ? 'Ended' : 'Left'}</span>
      <span className="text-right">Value</span>
      <span className="text-right">Receipt</span>
    </ColumnHeader>
  );
  return (
    <ScrollPanel label="Warranties" header={header}>
      {props.loading ? <SkeletonRows /> : null}
      {!props.loading && props.rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{TIER_EMPTY[props.tier]}</p>
      ) : null}
      {props.loading ? null : (
        <ul className="divide-y divide-border/60">
          {props.rows.map((row) => (
            <Row
              key={row.entry.item.id}
              row={row}
              world={props.tab.world}
              paperlessDown={props.tab.paperlessDown ?? false}
              onOpen={props.tab.onOpenItem}
            />
          ))}
        </ul>
      )}
    </ScrollPanel>
  );
}

/** The Warranties tab. */
export function WarrantiesTab(props: WarrantiesTabProps) {
  const rows = warrantyRows(props.entries, props.now);
  const [tier, setTier] = useState<WarrantyTier>(props.tier ?? 'soon');
  if (props.status === 'error') {
    return (
      <ScrollPanel>
        <LoadFailedBody what="Warranties" />
      </ScrollPanel>
    );
  }
  if (props.status !== 'loading' && rows.length === 0) {
    return (
      <ScrollPanel>
        <EmptyBody
          icon={ShieldCheck}
          title="No warranties recorded"
          description="Add a warranty end date to an item and it is tracked here, soonest first."
        />
      </ScrollPanel>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <TierTabs tier={tier} counts={tierCounts(rows)} onChange={setTier} />
      {props.paperlessDown ? (
        <StateBanner
          kind="error"
          title={PAPERLESS_DOWN_REASON}
          detail="Receipts stay listed; they open again once Paperless answers."
        />
      ) : null}
      <WarrantyTable
        rows={rows.filter((row) => row.tier === tier)}
        tier={tier}
        loading={props.status === 'loading'}
        tab={props}
      />
    </div>
  );
}
