import { SlidersHorizontal } from 'lucide-react';

import {
  Button,
  Checkbox,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  Switch,
  cn,
} from '@pops/ui';

import { activeFilterCount } from './list-filters.js';

import type { ReactElement } from 'react';

import type { ItemsUrlFilters } from '../../inventory-web/items-url-filters.js';
import type { FilterOption } from './list-filters.js';

/** Props for {@link FilterPopover}. */
export interface FilterPopoverProps {
  filters: ItemsUrlFilters;
  types: readonly FilterOption[];
  places: readonly FilterOption[];
  onChange: (patch: Partial<ItemsUrlFilters>) => void;
  onClear: () => void;
  scope?: 'items' | 'containers';
}

function TypeFields({ filters, types, onChange, scope }: FilterPopoverProps): ReactElement {
  return (
    <div className="space-y-2">
      <Label htmlFor="items-filter-type">Type</Label>
      <Select
        id="items-filter-type"
        size="sm"
        value={filters.untyped ? '' : (filters.typeKey ?? '')}
        disabled={filters.untyped}
        placeholder="Any type"
        options={[...types]}
        onChange={(event) =>
          onChange({ typeKey: event.target.value === '' ? null : event.target.value })
        }
      />
      {scope === 'containers' ? null : (
        <div className="flex items-center gap-2">
          <Checkbox
            id="items-filter-untyped"
            checked={filters.untyped}
            onCheckedChange={(checked) => onChange({ untyped: checked === true })}
          />
          <Label htmlFor="items-filter-untyped" className="font-normal">
            Only items with no type yet
          </Label>
        </div>
      )}
    </div>
  );
}

function InactiveField({ filters, onChange, scope }: FilterPopoverProps): ReactElement {
  if (scope === 'containers') return <></>;
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor="items-filter-inactive" className="font-normal">
        Include retired, discarded, lost and destroyed
      </Label>
      <Switch
        id="items-filter-inactive"
        checked={filters.inactive}
        onCheckedChange={(checked) => onChange({ inactive: checked })}
      />
    </div>
  );
}

/** Renders the type, placement, and inactive filters for an inventory list. */
export function FilterPopover(props: FilterPopoverProps): ReactElement {
  const { filters, places, onChange, onClear } = props;
  const count = activeFilterCount(filters);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-pressed={count > 0}
          className={cn(count > 0 && 'border-app-accent/60 bg-app-accent/10')}
          prefix={<SlidersHorizontal className="size-4" aria-hidden />}
        >
          Filter
          {count > 0 ? (
            <span className="rounded-full bg-app-accent px-1.5 text-2xs font-semibold text-app-accent-foreground tabular-nums">
              {count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-4">
        <TypeFields {...props} />
        <div className="space-y-2">
          <Label htmlFor="items-filter-where">Where</Label>
          <Select
            id="items-filter-where"
            size="sm"
            value={filters.within ?? ''}
            placeholder="Anywhere"
            options={[...places]}
            onChange={(event) =>
              onChange({ within: event.target.value === '' ? null : event.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">Includes what is inside boxes there.</p>
        </div>
        <InactiveField {...props} />
        {count > 0 ? (
          <Button variant="ghost" size="sm" className="w-full" onClick={onClear}>
            Clear filters
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
