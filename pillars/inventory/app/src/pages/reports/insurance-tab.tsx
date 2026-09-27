import { FileWarning } from 'lucide-react';
import { type ReactElement } from 'react';

import { Button, ComboboxSelect, EmptyState, Switch, Tabs, TabsList, TabsTrigger } from '@pops/ui';

import { StateBanner } from '../../foundation/feedback/state-banner.js';
import { locationPath } from '../../foundation/model/placement-model.js';
import { InsuranceColumns, InsuranceRoom, PAPERLESS_DOWN_REASON } from './insurance-rows.js';
import { formatDollars } from './report-model.js';
import { ReportPanel, ReportSkeletonRows } from './reports-parts.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PaperlessState } from '../../inventory-web/usePaperlessStatus.js';
import type { ReportEntry } from '../../inventory-web/useReportEntries.js';
import type { InsuranceGroup, InsuranceOptions } from './insurance-model.js';

/** Props for the Reports Insurance tab. */
export interface InsuranceTabProps {
  entries: readonly ReportEntry[];
  world: PlacementWorld;
  groups: readonly InsuranceGroup[];
  options: InsuranceOptions;
  status: 'ready' | 'loading' | 'error';
  paperlessState: PaperlessState | null;
  onOptionsChange: (patch: Partial<InsuranceOptions>) => void;
  onRetry: () => void;
}

function FailedBody({ onRetry }: { onRetry: () => void }): ReactElement {
  return (
    <div
      role="alert"
      className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <h2 className="font-semibold">The schedule did not load</h2>
      <p className="text-sm text-muted-foreground">The inventory service did not answer.</p>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function scopeOptions(world: PlacementWorld): { value: string; label: string }[] {
  const places = [...world.locations.values()]
    .map((location) => ({
      value: location.id,
      label: locationPath(world, location.id)
        .map((node) => node.name)
        .join(' / '),
    }))
    .toSorted((left, right) => left.label.localeCompare(right.label));
  return [{ value: 'all', label: 'Whole house' }, ...places];
}

function Controls({
  world,
  options,
  count,
  total,
  onChange,
}: {
  world: PlacementWorld;
  options: InsuranceOptions;
  count: number;
  total: number;
  onChange: (patch: Partial<InsuranceOptions>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ComboboxSelect
        aria-label="Which places"
        size="sm"
        className="w-64"
        options={scopeOptions(world)}
        value={options.scopeId ?? 'all'}
        searchPlaceholder="Find a place"
        onChange={(value) =>
          onChange({ scopeId: value === 'all' || typeof value !== 'string' ? null : value })
        }
      />
      <Tabs
        value={options.sort}
        onValueChange={(value) => onChange({ sort: value === 'name' ? 'name' : 'value' })}
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
          checked={options.gapsOnly}
          onCheckedChange={(checked) => onChange({ gapsOnly: checked })}
        />
        Only gaps
      </label>
      <p className="ml-auto flex items-center gap-3 text-sm tabular-nums">
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex">
          <span className="size-3 rounded-sm border bg-warning/10" aria-hidden />
          Missing a value or photo
        </span>
        <span>
          <span className="text-muted-foreground">{count} items, </span>
          <span className="font-semibold">{formatDollars(total)}</span>
        </span>
      </p>
    </div>
  );
}

function NoMatchBody({ onClear }: { onClear: () => void }): ReactElement {
  return (
    <div
      className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center"
      role="status"
    >
      <h2 className="font-semibold">No items match these filters</h2>
      <Button variant="outline" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

function Schedule({
  groups,
  status,
  paperlessState,
  onClear,
}: {
  groups: readonly InsuranceGroup[];
  status: InsuranceTabProps['status'];
  paperlessState: PaperlessState | null;
  onClear: () => void;
}): ReactElement {
  const paperlessDown = paperlessState?.available !== true;
  return (
    <ReportPanel title="Insurance schedule">
      <InsuranceColumns />
      {status === 'loading' ? <ReportSkeletonRows /> : null}
      {status === 'ready' && groups.length === 0 ? <NoMatchBody onClear={onClear} /> : null}
      {status === 'ready' && groups.length > 0 ? (
        <ul>
          {groups.map((group) => (
            <InsuranceRoom
              key={group.roomId}
              group={group}
              paperlessBaseUrl={paperlessState?.baseUrl ?? null}
              paperlessDown={paperlessDown}
            />
          ))}
        </ul>
      ) : null}
    </ReportPanel>
  );
}

/** Renders the insurance schedule controls, states, rows, and Paperless notice. */
export function InsuranceTab(props: InsuranceTabProps): ReactElement {
  if (props.status === 'error') {
    return (
      <ReportPanel title="Insurance schedule">
        <FailedBody onRetry={props.onRetry} />
      </ReportPanel>
    );
  }
  if (props.status === 'ready' && props.entries.length === 0) {
    return (
      <ReportPanel title="Insurance schedule">
        <EmptyState
          icon={FileWarning}
          title="Nothing to insure yet"
          description="The schedule lists active items. Add some and give them a replacement value."
        />
      </ReportPanel>
    );
  }
  const count = props.groups.reduce((sum, group) => sum + group.entries.length, 0);
  const total = props.groups.reduce((sum, group) => sum + group.subtotal, 0);
  const paperlessDown =
    props.paperlessState?.configured === true && !props.paperlessState.available;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Controls
        world={props.world}
        options={props.options}
        count={count}
        total={total}
        onChange={props.onOptionsChange}
      />
      {paperlessDown ? (
        <StateBanner
          kind="error"
          title={PAPERLESS_DOWN_REASON}
          detail="The schedule and CSV still list receipt numbers; they open again once Paperless answers."
        />
      ) : null}
      <Schedule
        groups={props.groups}
        status={props.status}
        paperlessState={props.paperlessState}
        onClear={() => props.onOptionsChange({ scopeId: null, gapsOnly: false })}
      />
    </div>
  );
}
