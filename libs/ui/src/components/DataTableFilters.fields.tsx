import { ComboboxSelect } from './ComboboxSelect';
import { NumberInput } from './NumberInput';
import { Select, type SelectOption } from './Select';
import { TextInput } from './TextInput';

import type { Column } from '@tanstack/react-table';

interface TextFilterProps<TData> {
  column: Column<TData>;
  placeholder?: string;
  ariaLabel?: string;
}

export function TextFilter<TData>({ column, placeholder, ariaLabel }: TextFilterProps<TData>) {
  return (
    <TextInput
      placeholder={placeholder ?? 'Filter...'}
      value={(column.getFilterValue() as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.target.value)}
      clearable
      onClear={() => column.setFilterValue('')}
      className="w-full"
      aria-label={ariaLabel}
    />
  );
}

interface SelectFilterProps<TData> {
  column: Column<TData>;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
}

export function SelectFilter<TData>({
  column,
  options,
  placeholder,
  ariaLabel,
}: SelectFilterProps<TData>) {
  return (
    <Select
      value={(column.getFilterValue() as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      options={options}
      placeholder={placeholder}
      className="w-full"
      aria-label={ariaLabel}
    />
  );
}

interface MultiSelectFilterProps<TData> {
  column: Column<TData>;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
}

export function MultiSelectFilter<TData>({
  column,
  options,
  placeholder,
  ariaLabel,
}: MultiSelectFilterProps<TData>) {
  const filterValue = (column.getFilterValue() as string[]) ?? [];

  return (
    <ComboboxSelect
      options={options.map((opt) => ({ label: opt.label, value: opt.value }))}
      value={filterValue}
      onChange={(value) =>
        column.setFilterValue(Array.isArray(value) && value.length > 0 ? value : undefined)
      }
      multiple
      placeholder={placeholder ?? 'Select...'}
      className="w-full"
      aria-label={ariaLabel}
    />
  );
}

interface DateRangeFilterProps<TData> {
  column: Column<TData>;
  ariaLabel?: string;
}

export function DateRangeFilter<TData>({ column, ariaLabel }: DateRangeFilterProps<TData>) {
  const filterValue = (column.getFilterValue() as [string, string]) ?? ['', ''];
  const fromLabel = ariaLabel ? `${ariaLabel} (from)` : 'From';
  const toLabel = ariaLabel ? `${ariaLabel} (to)` : 'To';

  return (
    <div className="flex min-w-0 flex-col gap-2 overflow-hidden sm:flex-row sm:items-center">
      <TextInput
        type="date"
        value={filterValue[0]}
        onChange={(e) => column.setFilterValue([e.target.value, filterValue[1]])}
        placeholder="From"
        className="min-w-0 flex-1"
        aria-label={fromLabel}
      />
      <span className="hidden text-muted-foreground sm:block">to</span>
      <TextInput
        type="date"
        value={filterValue[1]}
        onChange={(e) => column.setFilterValue([filterValue[0], e.target.value])}
        placeholder="To"
        className="min-w-0 flex-1"
        aria-label={toLabel}
      />
    </div>
  );
}

interface NumberRangeFilterProps<TData> {
  column: Column<TData>;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  ariaLabel?: string;
}

export function NumberRangeFilter<TData>({
  column,
  minPlaceholder = 'Min',
  maxPlaceholder = 'Max',
  ariaLabel,
}: NumberRangeFilterProps<TData>) {
  const filterValue = (column.getFilterValue() as [number, number]) ?? [undefined, undefined];
  const minLabel = ariaLabel ? `${ariaLabel} (min)` : minPlaceholder;
  const maxLabel = ariaLabel ? `${ariaLabel} (max)` : maxPlaceholder;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <NumberInput
        value={filterValue[0]}
        onChange={(value) => column.setFilterValue([value, filterValue[1]])}
        placeholder={minPlaceholder}
        className="w-full sm:w-25"
        aria-label={minLabel}
      />
      <span className="hidden text-muted-foreground sm:block">to</span>
      <NumberInput
        value={filterValue[1]}
        onChange={(value) => column.setFilterValue([filterValue[0], value])}
        placeholder={maxPlaceholder}
        className="w-full sm:w-25"
        aria-label={maxLabel}
      />
    </div>
  );
}
