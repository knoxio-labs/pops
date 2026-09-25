import {
  EmptyBody,
  LoadFailedBody,
  ScrollPanel,
  SkeletonRows,
} from '@/kit/inventory/secondary-page';
/**
 * Reports, Values: value grouped by room or type, on replacement value or
 * price paid. Groups sit on the left with their share of the total; the
 * chosen group's items fill the right, largest first, unvalued ones last
 * and marked. Both lists scroll; the page does not.
 */
import { BarChart3 } from 'lucide-react';
import { useState } from 'react';

import { breakdown, formatDollars } from './report-model';
import { ReportPanel } from './report-parts';
import { EntryRow, GroupRow, Segmented } from './values-rows';

import type { PlacementWorld } from '@/kit/inventory/foundation';

import type { BreakdownGroup, BreakdownKey, ReportEntry, ValueBasis } from './report-model';

/** Props for {@link ValuesTab}. */
export interface ValuesTabProps {
  entries: readonly ReportEntry[];
  world: PlacementWorld;
  status?: 'ready' | 'loading' | 'error';
  by?: BreakdownKey;
  basis?: ValueBasis;
  groupKey?: string;
  onOpenItem?: (id: string) => void;
}

function Toolbar(props: {
  by: BreakdownKey;
  basis: ValueBasis;
  total: number;
  onBy: (by: BreakdownKey) => void;
  onBasis: (basis: ValueBasis) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Segmented
        label="Group by"
        value={props.by}
        onChange={props.onBy}
        options={[
          { value: 'room', label: 'By room' },
          { value: 'type', label: 'By type' },
        ]}
      />
      <Segmented
        label="Value"
        value={props.basis}
        onChange={props.onBasis}
        options={[
          { value: 'replacement', label: 'Replacement value' },
          { value: 'purchase', label: 'Price paid' },
        ]}
      />
      <p className="ml-auto text-sm tabular-nums">
        <span className="text-muted-foreground">Total </span>
        <span className="font-semibold">{formatDollars(props.total)}</span>
      </p>
    </div>
  );
}

function GroupItems(props: {
  group: BreakdownGroup | undefined;
  basis: ValueBasis;
  loading: boolean;
  onOpen?: (id: string) => void;
}) {
  const { group } = props;
  const aside =
    group !== undefined && group.unvalued > 0 ? (
      <span className="text-xs text-muted-foreground">{group.unvalued} without a value</span>
    ) : null;
  return (
    <ReportPanel
      title={group === undefined ? 'Items' : `${group.label}: ${group.records} items`}
      aside={aside}
    >
      {props.loading || group === undefined ? (
        <SkeletonRows />
      ) : (
        <ul className="divide-y divide-border/60">
          {group.entries.map((entry) => (
            <EntryRow key={entry.item.id} entry={entry} basis={props.basis} onOpen={props.onOpen} />
          ))}
        </ul>
      )}
    </ReportPanel>
  );
}

/** The Values tab. */
export function ValuesTab(props: ValuesTabProps) {
  const [by, setBy] = useState<BreakdownKey>(props.by ?? 'room');
  const [basis, setBasis] = useState<ValueBasis>(props.basis ?? 'replacement');
  const [picked, setPicked] = useState<string | undefined>(props.groupKey);
  const groups = breakdown(props.entries, props.world, by, basis);
  const group = groups.find((entry) => entry.key === picked) ?? groups[0];
  const loading = props.status === 'loading';
  if (props.status === 'error')
    return (
      <ScrollPanel>
        <LoadFailedBody what="Values" />
      </ScrollPanel>
    );
  if (!loading && groups.length === 0) {
    return (
      <ScrollPanel>
        <EmptyBody
          icon={BarChart3}
          title="No values to break down"
          description="Give items a replacement value or a purchase price and they appear here."
        />
      </ScrollPanel>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Toolbar
        by={by}
        basis={basis}
        total={groups.reduce((sum, entry) => sum + entry.value, 0)}
        onBy={(next) => {
          setBy(next);
          setPicked(undefined);
        }}
        onBasis={setBasis}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
        <ReportPanel title={by === 'room' ? 'Rooms' : 'Types'}>
          {loading ? (
            <SkeletonRows />
          ) : (
            groups.map((entry) => (
              <GroupRow
                key={entry.key}
                group={entry}
                active={entry.key === group?.key}
                onSelect={() => setPicked(entry.key)}
              />
            ))
          )}
        </ReportPanel>
        <GroupItems group={group} basis={basis} loading={loading} onOpen={props.onOpenItem} />
      </div>
    </div>
  );
}
