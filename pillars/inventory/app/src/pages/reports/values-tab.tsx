import { BarChart3 } from 'lucide-react';

import { Button, EmptyState, Skeleton } from '@pops/ui';

import { formatReportDollars, isValueReportEmpty } from './reports-model.js';
import { ReportPanel, ReportSkeletonRows } from './reports-parts.js';
import { ValueEntryRow, ValueGroupRow, ValuesSegmented } from './values-rows.js';

import type { ReactElement } from 'react';

import type { WebReportsValuesResponse } from '../../inventory-api/types.gen.js';
import type { ValueReportBasis, ValueReportBy } from '../../inventory-web/useValueReport.js';

/** The query state and URL controls consumed by the Values tab. */
export interface ValuesTabProps {
  readonly data: WebReportsValuesResponse | undefined;
  readonly status: 'loading' | 'error' | 'ready';
  readonly by: ValueReportBy;
  readonly basis: ValueReportBasis;
  readonly groupKey: string | null;
  readonly onByChange: (value: ValueReportBy) => void;
  readonly onBasisChange: (value: ValueReportBasis) => void;
  readonly onGroupChange: (value: string | null) => void;
  readonly onOpenItem?: (id: string) => void;
  readonly onRetry?: () => void;
}

function ValuesToolbar({
  by,
  basis,
  total,
  loading,
  onByChange,
  onBasisChange,
}: {
  readonly by: ValueReportBy;
  readonly basis: ValueReportBasis;
  readonly total: number | undefined;
  readonly loading: boolean;
  readonly onByChange: (value: ValueReportBy) => void;
  readonly onBasisChange: (value: ValueReportBasis) => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ValuesSegmented
        label="Group by"
        value={by}
        onChange={onByChange}
        options={[
          { value: 'room', label: 'By room' },
          { value: 'type', label: 'By type' },
        ]}
      />
      <ValuesSegmented
        label="Value basis"
        value={basis}
        onChange={onBasisChange}
        options={[
          { value: 'replacement', label: 'Replacement value' },
          { value: 'purchase', label: 'Price paid' },
        ]}
      />
      <div className="ml-auto text-sm tabular-nums">
        <span className="text-muted-foreground">Total </span>
        {loading || total === undefined ? (
          <Skeleton className="inline-block h-5 w-20 align-middle" />
        ) : (
          <span className="font-semibold">{formatReportDollars(total)}</span>
        )}
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry?: () => void }): ReactElement {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border p-6 text-center">
      <BarChart3 className="size-10 text-muted-foreground/40" aria-hidden />
      <div>
        <h2 className="font-semibold">Values did not load</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The inventory service did not answer. Nothing was changed.
        </p>
      </div>
      {onRetry === undefined ? null : (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

function EmptyValues(): ReactElement {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-lg border">
      <EmptyState
        icon={BarChart3}
        title="No values to break down"
        description="Give items a replacement value or a purchase price and they appear here."
      />
    </div>
  );
}

function ValuesPanels({
  data,
  by,
  basis,
  groupKey,
  onGroupChange,
  onOpenItem,
}: {
  readonly data: WebReportsValuesResponse;
  readonly by: ValueReportBy;
  readonly basis: ValueReportBasis;
  readonly groupKey: string | null;
  readonly onGroupChange: (value: string | null) => void;
  readonly onOpenItem?: (id: string) => void;
}): ReactElement {
  const selected = data.groups.find((group) => group.key === groupKey) ?? data.groups[0];
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
      <ReportPanel title={by === 'room' ? 'Rooms' : 'Types'}>
        <div className="divide-y divide-border/60">
          {data.groups.map((group) => (
            <ValueGroupRow
              key={group.key}
              group={group}
              active={group.key === selected?.key}
              onSelect={() => onGroupChange(group.key)}
            />
          ))}
        </div>
      </ReportPanel>
      <ReportPanel
        title={selected === undefined ? 'Items' : `${selected.label}: ${selected.records} items`}
        aside={
          selected === undefined || selected.unvalued === 0 ? null : (
            <span className="text-xs text-muted-foreground">
              {selected.unvalued} without a value
            </span>
          )
        }
      >
        {selected === undefined ? null : (
          <ul className="divide-y divide-border/60">
            {selected.entries.map((entry) => (
              <ValueEntryRow key={entry.itemId} entry={entry} basis={basis} onOpen={onOpenItem} />
            ))}
          </ul>
        )}
      </ReportPanel>
    </div>
  );
}

/** Renders server-grouped Values data with URL-backed controls. */
export function ValuesTab(props: ValuesTabProps): ReactElement {
  if (props.status === 'error') return <ErrorState onRetry={props.onRetry} />;
  if (props.status === 'loading') {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3" aria-busy="true">
        <ValuesToolbar
          by={props.by}
          basis={props.basis}
          total={undefined}
          loading
          onByChange={props.onByChange}
          onBasisChange={props.onBasisChange}
        />
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          <ReportPanel title={props.by === 'room' ? 'Rooms' : 'Types'}>
            <ReportSkeletonRows />
          </ReportPanel>
          <ReportPanel title="Items">
            <ReportSkeletonRows />
          </ReportPanel>
        </div>
      </div>
    );
  }
  if (props.data === undefined || isValueReportEmpty(props.data)) return <EmptyValues />;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ValuesToolbar
        by={props.by}
        basis={props.basis}
        total={props.data.totals[props.basis]}
        loading={false}
        onByChange={props.onByChange}
        onBasisChange={props.onBasisChange}
      />
      <ValuesPanels
        data={props.data}
        by={props.by}
        basis={props.basis}
        groupKey={props.groupKey}
        onGroupChange={props.onGroupChange}
        onOpenItem={props.onOpenItem}
      />
    </div>
  );
}
