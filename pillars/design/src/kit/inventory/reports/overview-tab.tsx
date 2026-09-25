import { EmptyBody, LoadFailedBody, ScrollPanel } from '@/kit/inventory/secondary-page';
/**
 * Reports, Overview: four figures, then three short panels that each open
 * the tab holding the detail: value by room (Values), warranties ending in
 * the next 90 days (Warranties), and the gaps an insurer would ask about
 * (Insurance, gaps only).
 */
import { BarChart3, Camera, CircleDollarSign } from 'lucide-react';

import { Button, ButtonPrimitive } from '@pops/ui';

import { breakdown, formatDollars, reportTotals } from './report-model';
import { ReportPanel, ShareBar, StatTile } from './report-parts';
import { daysLabel, tierCounts, warrantyRows } from './warranty-model';

import type { PlacementWorld } from '@/kit/inventory/foundation';

import type { ReportEntry } from './report-model';
import type { ReportTab } from './reports-shell';

/** Props for {@link OverviewTab}. */
export interface OverviewTabProps {
  entries: readonly ReportEntry[];
  world: PlacementWorld;
  now: Date;
  status?: 'ready' | 'loading' | 'error';
  onOpen?: (tab: ReportTab, detail?: string) => void;
}

function Figures({ props }: { props: OverviewTabProps }) {
  const totals = reportTotals(props.entries);
  const counts = tierCounts(warrantyRows(props.entries, props.now));
  const loading = props.status === 'loading';
  return (
    <div className="grid shrink-0 grid-cols-2 gap-3 xl:grid-cols-4">
      <StatTile
        label="Replacement value"
        value={formatDollars(totals.replacement)}
        detail={`Leaves out ${totals.unvalued} unvalued`}
        loading={loading}
      />
      <StatTile
        label="Paid"
        value={formatDollars(totals.purchase)}
        detail="Purchase prices on record"
        loading={loading}
      />
      <StatTile
        label="Counted"
        value={`${totals.records}`}
        detail={`${totals.units} units, active only`}
        loading={loading}
      />
      <StatTile
        label="Warranties ending"
        value={`${counts.soon}`}
        detail="In the next 30 days"
        tone={counts.soon > 0 ? 'warning' : 'neutral'}
        loading={loading}
        onClick={() => props.onOpen?.('warranties')}
      />
    </div>
  );
}

function ByRoom({ props }: { props: OverviewTabProps }) {
  const rooms = breakdown(props.entries, props.world, 'room').slice(0, 7);
  return (
    <ReportPanel
      title="Value by room"
      aside={<OpenLink label="All values" onClick={() => props.onOpen?.('values')} />}
    >
      <ul className="divide-y divide-border/60">
        {rooms.map((room) => (
          <li
            key={room.key}
            className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-x-3 gap-y-1 px-4 py-2"
          >
            <span className="truncate text-sm">{room.label}</span>
            <span className="text-right text-sm tabular-nums">{formatDollars(room.value)}</span>
            <ShareBar share={room.share} className="col-span-2" />
          </li>
        ))}
      </ul>
    </ReportPanel>
  );
}

function Ending({ props }: { props: OverviewTabProps }) {
  const rows = warrantyRows(props.entries, props.now).filter(
    (row) => row.tier === 'soon' || row.tier === 'quarter'
  );
  return (
    <ReportPanel
      title="Ending in 90 days"
      aside={<OpenLink label="All warranties" onClick={() => props.onOpen?.('warranties')} />}
    >
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Nothing ends in the next 90 days.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {rows.map((row) => (
            <li
              key={row.entry.item.id}
              className="flex h-11 items-center justify-between gap-3 px-4"
            >
              <span className="truncate text-sm">{row.entry.item.name}</span>
              <span
                className={
                  row.tier === 'soon'
                    ? 'shrink-0 text-xs font-medium'
                    : 'shrink-0 text-xs text-muted-foreground'
                }
              >
                {daysLabel(row.days)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </ReportPanel>
  );
}

function Gaps({ props }: { props: OverviewTabProps }) {
  const totals = reportTotals(props.entries);
  const gap = (icon: typeof Camera, count: number, text: string) => {
    const Icon = icon;
    return (
      <ButtonPrimitive
        variant="ghost"
        onClick={() => props.onOpen?.('insurance', 'gaps')}
        className="h-auto w-full justify-start gap-3 rounded-none px-4 py-3 text-left font-normal"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-medium tabular-nums">{count} items</span>
          <span className="text-xs whitespace-normal text-muted-foreground">{text}</span>
        </span>
      </ButtonPrimitive>
    );
  };
  return (
    <ReportPanel title="What an insurer would ask about">
      <div className="divide-y divide-border/60">
        {gap(
          CircleDollarSign,
          totals.unvalued,
          'No replacement value, so they add nothing to the totals.'
        )}
        {gap(
          Camera,
          totals.withoutPhoto,
          'No photo to show they exist or what state they were in.'
        )}
      </div>
    </ReportPanel>
  );
}

function OpenLink({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="-mr-2 shrink-0 text-xs whitespace-nowrap text-muted-foreground"
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

/** The Overview tab. */
export function OverviewTab(props: OverviewTabProps) {
  if (props.status === 'error')
    return (
      <ScrollPanel>
        <LoadFailedBody what="Reports" />
      </ScrollPanel>
    );
  if (props.status !== 'loading' && props.entries.length === 0) {
    return (
      <ScrollPanel>
        <EmptyBody
          icon={BarChart3}
          title="Nothing to report yet"
          description="Reports count active items with a value. Add items, or give the ones you have a replacement value."
        />
      </ScrollPanel>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <Figures props={props} />
      {props.status === 'loading' ? (
        <div className="min-h-0 flex-1 rounded-lg border bg-card" aria-busy="true" />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
          <ByRoom props={props} />
          <Ending props={props} />
          <Gaps props={props} />
        </div>
      )}
    </div>
  );
}
