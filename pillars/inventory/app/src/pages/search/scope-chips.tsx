import { ButtonPrimitive, cn } from '@pops/ui';

import type { SearchScope } from './search-model.js';

/** Props for the Inventory/Purchases scope radio group. */
export interface ScopeChipsProps {
  readonly scope: SearchScope;
  readonly counts: Readonly<Record<SearchScope, number>>;
  readonly onScopeChange: (scope: SearchScope) => void;
}

function ScopeChip({
  scope,
  current,
  count,
  onSelect,
}: {
  readonly scope: SearchScope;
  readonly current: SearchScope;
  readonly count: number;
  readonly onSelect: (scope: SearchScope) => void;
}) {
  const selected = scope === current;
  const label = scope === 'inventory' ? 'Inventory' : 'Purchases';
  return (
    <ButtonPrimitive
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${label} ${count}`}
      variant="ghost"
      size="sm"
      className={cn(
        'h-8 gap-1.5 rounded-md px-2.5 text-sm',
        selected && 'bg-card text-foreground shadow-sm'
      )}
      onClick={() => onSelect(scope)}
    >
      {label}
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </ButtonPrimitive>
  );
}

/** Renders the scope switcher with per-scope server result counts. */
export function ScopeChips({ scope, counts, onScopeChange }: ScopeChipsProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Search scope"
      className="flex shrink-0 items-center gap-0.5 rounded-lg bg-muted p-0.5"
    >
      <ScopeChip
        scope="inventory"
        current={scope}
        count={counts.inventory}
        onSelect={onScopeChange}
      />
      <ScopeChip
        scope="purchases"
        current={scope}
        count={counts.purchases}
        onSelect={onScopeChange}
      />
    </div>
  );
}
