import { ComboboxSelect, Switch, Tabs, TabsList, TabsTrigger } from '@pops/ui';

import { locationPath } from '../../foundation/model/placement-model.js';
import { formatDollars } from './report-model.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { InsuranceOptions } from './insurance-model.js';

/** Props for the insurance schedule's scope, sort, and gap controls. */
export interface InsuranceControlsProps {
  world: PlacementWorld;
  options: InsuranceOptions;
  count: number;
  total: number;
  onChange: (patch: Partial<InsuranceOptions>) => void;
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

/** Renders the insurance schedule controls and current result summary. */
export function InsuranceControls({
  world,
  options,
  count,
  total,
  onChange,
}: InsuranceControlsProps) {
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
          onCheckedChange={(checked) =>
            onChange({ gapsOnly: checked, gapReason: checked ? options.gapReason : null })
          }
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
