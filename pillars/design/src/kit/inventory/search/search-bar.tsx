/**
 * The search page's header row: the query, the two scope chips with their
 * result counts (Tab switches them, as in the palette), and the Type and
 * Placement filters, which apply to the Inventory scope only.
 */
import { MapPin, Search, Shapes } from 'lucide-react';

import { ButtonPrimitive, Select, TextInput, cn } from '@pops/ui';

import { KeyCombo } from '../foundation';
import { typeTreeOptions } from '../type-tree/model';

import type { TypeTreeRecord } from '../type-tree/model';
import type { SearchFilters } from './search-model';

/** The two things search can look through. */
export type SearchScope = 'inventory' | 'purchases';

/** One filter option. */
export interface SearchOption {
  value: string;
  label: string;
  parentTypeId?: string | null;
}

/** Props for {@link SearchBar}. */
export interface SearchBarProps {
  query: string;
  scope: SearchScope;
  counts: Readonly<Record<SearchScope, number>>;
  filters: SearchFilters;
  types: readonly SearchOption[];
  places: readonly SearchOption[];
  onQuery?: (query: string) => void;
  onScope?: (scope: SearchScope) => void;
  onFilters?: (patch: Partial<SearchFilters>) => void;
}

/** One scope, with its result count once something is typed. */
export function ScopeChip({
  id,
  label,
  count,
  active,
  onScope,
}: {
  id: SearchScope;
  label: string;
  count: number | null;
  active: boolean;
  onScope?: (scope: SearchScope) => void;
}) {
  return (
    <ButtonPrimitive
      role="radio"
      aria-checked={active}
      variant="ghost"
      size="xs"
      className={cn(
        'h-7 gap-1.5 px-2.5 text-xs',
        active
          ? 'bg-background text-foreground shadow-sm hover:bg-background'
          : 'text-muted-foreground'
      )}
      onClick={() => onScope?.(id)}
    >
      {label}
      {count === null ? null : <span className="tabular-nums text-muted-foreground">{count}</span>}
    </ButtonPrimitive>
  );
}

function FilterSelect({
  icon: Icon,
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  icon: typeof MapPin;
  label: string;
  value: string | null;
  options: readonly SearchOption[];
  onChange: (value: string | null) => void;
  disabled: boolean;
}) {
  return (
    <div className="w-44 shrink-0">
      <Select
        size="sm"
        aria-label={label}
        value={value ?? ''}
        disabled={disabled}
        placeholder={label}
        prefix={<Icon className="size-3.5 text-muted-foreground" aria-hidden />}
        options={[...options]}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      />
    </div>
  );
}

function treeTypeOptions(types: readonly SearchOption[]): SearchOption[] {
  const records: TypeTreeRecord[] = types.map((type) => ({
    id: type.value,
    label: type.label,
    parentTypeId: type.parentTypeId ?? null,
  }));
  const paths = typeTreeOptions(records, '', true);
  return types.map((type) => ({
    ...type,
    label: paths.find((option) => option.value === type.value)?.pathLabel ?? type.label,
  }));
}

/** The search header row. */
export function SearchBar(props: SearchBarProps) {
  const { scope, counts, filters, onFilters } = props;
  const purchases = scope === 'purchases';
  return (
    <div className="flex items-center gap-2">
      <div className="w-72 shrink-0">
        <TextInput
          size="sm"
          value={props.query}
          onChange={(event) => props.onQuery?.(event.target.value)}
          clearable
          onClear={() => props.onQuery?.('')}
          aria-label="Search"
          placeholder={
            purchases ? 'Merchant, order number or item' : 'Name, code, note, type or place'
          }
          prefix={<Search className="size-4" aria-hidden />}
        />
      </div>
      <div
        role="radiogroup"
        aria-label="Search in"
        className="flex items-center gap-0.5 rounded-lg bg-muted p-1"
      >
        <ScopeChip
          id="inventory"
          label="Inventory"
          count={props.query.trim() === '' ? null : counts.inventory}
          active={!purchases}
          onScope={props.onScope}
        />
        <ScopeChip
          id="purchases"
          label="Purchases"
          count={props.query.trim() === '' ? null : counts.purchases}
          active={purchases}
          onScope={props.onScope}
        />
      </div>
      <KeyCombo sequence={['Tab']} className="mr-2" />
      <FilterSelect
        icon={Shapes}
        label="Any type"
        value={filters.typeId}
        options={treeTypeOptions(props.types)}
        disabled={purchases}
        onChange={(typeId) => onFilters?.({ typeId })}
      />
      <FilterSelect
        icon={MapPin}
        label="Anywhere"
        value={filters.within}
        options={props.places}
        disabled={purchases}
        onChange={(within) => onFilters?.({ within })}
      />
    </div>
  );
}
