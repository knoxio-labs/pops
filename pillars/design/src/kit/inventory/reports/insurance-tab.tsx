import { StateBanner, locationPath } from '@/kit/inventory/foundation';
import {
  EmptyBody,
  LoadFailedBody,
  NoMatchBody,
  ScrollPanel,
  SkeletonRows,
} from '@/kit/inventory/secondary-page';
/**
 * Reports, Insurance: the schedule an insurer asks for. Rooms with a
 * subtotal each, rows with quantity, unit and total value, purchase date,
 * receipt and photo count. Limit it to one place, sort by value or name, or
 * show only the rows with a gap. Export CSV and Print take exactly what is
 * shown.
 */
import { FileWarning } from 'lucide-react';
import { useState } from 'react';

import { ComboboxSelect, Switch, Tabs, TabsList, TabsTrigger } from '@pops/ui';

import { insuranceGroups } from './insurance-model';
import { InsuranceColumns, InsuranceRoom } from './insurance-rows';
import { formatDollars } from './report-model';
import { PAPERLESS_DOWN_REASON } from './report-parts';

import type { PlacementWorld } from '@/kit/inventory/foundation';

import type { InsuranceGroup, InsuranceOptions } from './insurance-model';
import type { ReportEntry } from './report-model';

/** Props for {@link InsuranceTab}. */
export interface InsuranceTabProps {
  entries: readonly ReportEntry[];
  world: PlacementWorld;
  status?: 'ready' | 'loading' | 'error';
  options?: Partial<InsuranceOptions>;
  paperlessDown?: boolean;
}

function scopeOptions(world: PlacementWorld) {
  const places = [...world.locations.values()]
    .map((location) => ({
      value: location.id,
      label: locationPath(world, location.id)
        .map((node) => node.name)
        .join(' / '),
    }))
    .toSorted((a, b) => a.label.localeCompare(b.label));
  return [{ value: 'all', label: 'Whole house' }, ...places];
}

function Controls(props: {
  world: PlacementWorld;
  options: InsuranceOptions;
  onChange: (patch: Partial<InsuranceOptions>) => void;
  count: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <ComboboxSelect
        aria-label="Which places"
        size="sm"
        className="w-64"
        options={scopeOptions(props.world)}
        value={props.options.scopeId ?? 'all'}
        searchPlaceholder="Find a place"
        onChange={(value) =>
          props.onChange({ scopeId: value === 'all' || typeof value !== 'string' ? null : value })
        }
      />
      <Tabs
        value={props.options.sort}
        onValueChange={(value) => props.onChange({ sort: value === 'name' ? 'name' : 'value' })}
      >
        <TabsList aria-label="Sort rows">
          <TabsTrigger value="value" className="flex-none px-3">
            Highest value
          </TabsTrigger>
          <TabsTrigger value="name" className="flex-none px-3">
            Name
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <Switch
          checked={props.options.gapsOnly}
          onCheckedChange={(checked) => props.onChange({ gapsOnly: checked })}
        />
        Only gaps
      </label>
      <p className="ml-auto flex items-center gap-3 text-sm tabular-nums">
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex">
          <span className="size-3 rounded-sm border bg-warning/10" aria-hidden />
          Missing a value or photo
        </span>
        <span>
          <span className="text-muted-foreground">{props.count} items, </span>
          <span className="font-semibold">{formatDollars(props.total)}</span>
        </span>
      </p>
    </div>
  );
}

function Schedule(props: {
  groups: readonly InsuranceGroup[];
  loading: boolean;
  paperlessDown: boolean;
  onClear: () => void;
}) {
  return (
    <ScrollPanel label="Insurance schedule" className="@container" header={<InsuranceColumns />}>
      {props.loading ? <SkeletonRows /> : null}
      {!props.loading && props.groups.length === 0 ? (
        <NoMatchBody what="items" onClear={props.onClear} />
      ) : null}
      {props.loading ? null : (
        <ul>
          {props.groups.map((group) => (
            <InsuranceRoom key={group.roomId} group={group} paperlessDown={props.paperlessDown} />
          ))}
        </ul>
      )}
    </ScrollPanel>
  );
}

function EmptyOrFailed({ status }: { status: InsuranceTabProps['status'] }) {
  return (
    <ScrollPanel>
      {status === 'error' ? (
        <LoadFailedBody what="The schedule" />
      ) : (
        <EmptyBody
          icon={FileWarning}
          title="Nothing to insure yet"
          description="The schedule lists active items. Add some and give them a replacement value."
        />
      )}
    </ScrollPanel>
  );
}

/** The Insurance tab. */
export function InsuranceTab(props: InsuranceTabProps) {
  const [options, setOptions] = useState<InsuranceOptions>({
    scopeId: null,
    sort: 'value',
    gapsOnly: false,
    ...props.options,
  });
  const groups = insuranceGroups(props.entries, props.world, options);
  const paperlessDown = props.paperlessDown ?? false;
  if (props.status === 'error' || (props.status !== 'loading' && props.entries.length === 0)) {
    return <EmptyOrFailed status={props.status} />;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Controls
        world={props.world}
        options={options}
        onChange={(patch) => setOptions((current) => ({ ...current, ...patch }))}
        count={groups.reduce((sum, group) => sum + group.entries.length, 0)}
        total={groups.reduce((sum, group) => sum + group.subtotal, 0)}
      />
      {paperlessDown ? (
        <StateBanner
          kind="error"
          title={PAPERLESS_DOWN_REASON}
          detail="The schedule and CSV still list receipt numbers; they open again once Paperless answers."
        />
      ) : null}
      <Schedule
        groups={groups}
        loading={props.status === 'loading'}
        paperlessDown={paperlessDown}
        onClear={() => setOptions({ scopeId: null, sort: options.sort, gapsOnly: false })}
      />
    </div>
  );
}
