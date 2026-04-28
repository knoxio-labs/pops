import { useTranslation } from 'react-i18next';

import { ComboboxSelect } from './ComboboxSelect';
import { NumberInput } from './NumberInput';
import { Select, type SelectOption } from './Select';
import { TextInput } from './TextInput';

import type { Column } from '@tanstack/react-table';

interface TextFilterProps {
  column: Column<unknown>;
  placeholder?: string;
}

export function TextFilter({ column, placeholder }: TextFilterProps) {
  const { t } = useTranslation('ui');
  return (
    <TextInput
      placeholder={placeholder ?? t('dataTableFilters.filterPlaceholder')}
      value={(column.getFilterValue() as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.target.value)}
      clearable
      onClear={() => column.setFilterValue('')}
      className="w-full sm:max-w-sm"
    />
  );
}

interface SelectFilterProps {
  column: Column<unknown>;
  options: SelectOption[];
  placeholder?: string;
}

export function SelectFilter({ column, options, placeholder }: SelectFilterProps) {
  const { t } = useTranslation('ui');
  return (
    <Select
      value={(column.getFilterValue() as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      options={options}
      placeholder={placeholder ?? t('dataTableFilters.selectPlaceholder')}
      className="w-full sm:w-45"
    />
  );
}

interface MultiSelectFilterProps {
  column: Column<unknown>;
  options: SelectOption[];
  placeholder?: string;
}

export function MultiSelectFilter({ column, options, placeholder }: MultiSelectFilterProps) {
  const { t } = useTranslation('ui');
  const filterValue = (column.getFilterValue() as string[]) ?? [];

  return (
    <ComboboxSelect
      options={options.map((opt) => ({ label: opt.label, value: opt.value }))}
      value={filterValue}
      onChange={(value) =>
        column.setFilterValue(Array.isArray(value) && value.length > 0 ? value : undefined)
      }
      multiple
      placeholder={placeholder ?? t('dataTableFilters.selectPlaceholder')}
      className="w-full sm:min-w-50"
    />
  );
}

interface DateRangeFilterProps {
  column: Column<unknown>;
}

export function DateRangeFilter({ column }: DateRangeFilterProps) {
  const { t } = useTranslation('ui');
  const filterValue = (column.getFilterValue() as [string, string]) ?? ['', ''];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <TextInput
        type="date"
        value={filterValue[0]}
        onChange={(e) => column.setFilterValue([e.target.value, filterValue[1]])}
        placeholder={t('dataTableFilters.from')}
        className="w-full sm:w-38"
      />
      <span className="hidden text-muted-foreground sm:block">{t('dataTableFilters.to')}</span>
      <TextInput
        type="date"
        value={filterValue[1]}
        onChange={(e) => column.setFilterValue([filterValue[0], e.target.value])}
        placeholder={t('dataTableFilters.to')}
        className="w-full sm:w-38"
      />
    </div>
  );
}

interface NumberRangeFilterProps {
  column: Column<unknown>;
  minPlaceholder?: string;
  maxPlaceholder?: string;
}

export function NumberRangeFilter({
  column,
  minPlaceholder,
  maxPlaceholder,
}: NumberRangeFilterProps) {
  const { t } = useTranslation('ui');
  const resolvedMinPlaceholder = minPlaceholder ?? t('dataTableFilters.min');
  const resolvedMaxPlaceholder = maxPlaceholder ?? t('dataTableFilters.max');
  const filterValue = (column.getFilterValue() as [number, number]) ?? [undefined, undefined];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <NumberInput
        value={filterValue[0]}
        onChange={(value) => column.setFilterValue([value, filterValue[1]])}
        placeholder={resolvedMinPlaceholder}
        className="w-full sm:w-25"
      />
      <span className="hidden text-muted-foreground sm:block">{t('dataTableFilters.to')}</span>
      <NumberInput
        value={filterValue[1]}
        onChange={(value) => column.setFilterValue([filterValue[0], value])}
        placeholder={resolvedMaxPlaceholder}
        className="w-full sm:w-25"
      />
    </div>
  );
}
