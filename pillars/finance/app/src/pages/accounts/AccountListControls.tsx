import { Archive, Search } from 'lucide-react';

import {
  ACCOUNT_KIND_META,
  type AccountKind,
  Button,
  ComboboxSelect,
  cn,
  TextInput,
} from '@pops/ui';

import { ACCOUNT_SORT_OPTIONS, isAccountSort } from './account-list-sort';

import type { AccountListFilters } from './useAccountListFilters';

/**
 * Selected-chip treatment written out rather than left to the Button's
 * `default` variant, matching the design's `account-list-controls.tsx`
 * rationale: nine filled-solid chips would read as nine primary actions.
 */
const SELECTED_CHIP = 'border-primary bg-primary/15 text-primary hover:bg-primary/20';

function KindChip({
  kind,
  on,
  onToggle,
}: {
  kind: AccountKind;
  on: boolean;
  onToggle: () => void;
}) {
  const meta = ACCOUNT_KIND_META[kind];
  const Icon = meta.icon;
  return (
    <Button
      variant="outline"
      size="sm"
      prefix={<Icon className="h-4 w-4" />}
      aria-pressed={on}
      onClick={onToggle}
      className={cn(on && SELECTED_CHIP)}
    >
      {meta.label}
    </Button>
  );
}

const SORT_OPTIONS = ACCOUNT_SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

/** The control row: search, one toggle per kind present, the sort, and the archived reveal. */
export function AccountListControls({ filters }: { filters: AccountListFilters }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TextInput
        value={filters.query}
        onChange={(event) => filters.setQuery(event.target.value)}
        onClear={() => filters.setQuery('')}
        prefix={<Search className="h-4 w-4" />}
        placeholder="Search accounts"
        aria-label="Search accounts"
        clearable
        containerClassName="w-56"
      />
      {filters.presentKinds.map((kind) => (
        <KindChip
          key={kind}
          kind={kind}
          on={filters.kinds.includes(kind)}
          onToggle={() => filters.toggleKind(kind)}
        />
      ))}
      <div className="ml-auto flex items-center gap-2">
        <ComboboxSelect
          options={SORT_OPTIONS}
          value={filters.sort}
          onChange={(value) => {
            const next = Array.isArray(value) ? value[0] : value;
            if (next !== undefined && isAccountSort(next)) filters.setSort(next);
          }}
          size="sm"
          className="w-44"
        />
        {filters.archivedCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            prefix={<Archive className="h-4 w-4" />}
            aria-pressed={filters.showArchived}
            onClick={filters.toggleArchived}
            className={cn(filters.showArchived && SELECTED_CHIP)}
          >
            {filters.showArchived
              ? `Hide ${filters.archivedCount} archived`
              : `Show ${filters.archivedCount} archived`}
          </Button>
        )}
      </div>
    </div>
  );
}
