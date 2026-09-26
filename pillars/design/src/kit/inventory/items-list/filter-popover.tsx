/**
 * The Items filter control: one button that opens Type, Where and Include
 * inactive. It carries the number of active filters, so a narrowed list
 * says so even with the popover closed; the chips under the toolbar name
 * each filter and remove it in one click.
 */
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

import { descendantIds, typeTreeOptions } from '../type-tree/model';
import { activeFilterCount } from './browse-model';

import type { ItemsFilters } from './browse-model';

/** One option in a filter select. */
export interface FilterOption {
  value: string;
  label: string;
  parentTypeId?: string | null;
}

/** Props for {@link FilterPopover}. */
export interface FilterPopoverProps {
  filters: ItemsFilters;
  types: readonly FilterOption[];
  places: readonly FilterOption[];
  onChange: (patch: Partial<ItemsFilters>) => void;
  onClear: () => void;
  defaultOpen?: boolean;
  /** Containers are always typed and segment their own lifecycle, so they hide both. */
  scope?: 'items' | 'containers';
}

function TypeFields({ filters, types, onChange, scope }: FilterPopoverProps) {
  const typeRecords = types.map((type) => ({
    id: type.value,
    label: type.label,
    parentTypeId: type.parentTypeId ?? null,
  }));
  const treeOptions = typeTreeOptions(typeRecords, '', true);
  const typeOptions = types.map((type) => ({
    value: type.value,
    label: treeOptions.find((option) => option.value === type.value)?.pathLabel ?? type.label,
  }));
  const descendants = filters.typeId === null ? [] : descendantIds(typeRecords, filters.typeId);
  return (
    <div className="space-y-2">
      <Label htmlFor="items-filter-type">Type</Label>
      <Select
        id="items-filter-type"
        size="sm"
        value={filters.untyped ? '' : (filters.typeId ?? '')}
        disabled={filters.untyped}
        placeholder="Any type"
        options={typeOptions}
        onChange={(event) =>
          onChange({ typeId: event.target.value === '' ? null : event.target.value })
        }
      />
      {descendants.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Includes this type and {descendants.length} subtype{descendants.length === 1 ? '' : 's'}.
        </p>
      ) : null}
      <div className={cn('flex items-center gap-2', scope === 'containers' && 'hidden')}>
        <Checkbox
          id="items-filter-untyped"
          checked={filters.untyped}
          onCheckedChange={(checked) => onChange({ untyped: checked === true })}
        />
        <Label htmlFor="items-filter-untyped" className="font-normal">
          Only items with no type yet
        </Label>
      </div>
    </div>
  );
}

function InactiveField({ filters, onChange, scope }: FilterPopoverProps) {
  return (
    <div
      className={cn('flex items-center justify-between gap-3', scope === 'containers' && 'hidden')}
    >
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

/** The filter button and its popover. */
export function FilterPopover(props: FilterPopoverProps) {
  const { filters, places, onChange, onClear } = props;
  const count = activeFilterCount(filters);
  return (
    <Popover defaultOpen={props.defaultOpen}>
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
