import { ButtonPrimitive, cn } from '@pops/ui';

import { useTopbarDropdownModel } from './topbar-dropdown-state.js';
import { PurchaseRow, Recents, ResultRow } from './topbar-rows.js';

import type { ReactElement } from 'react';

import type { SearchScope } from '../../pages/search/search-model.js';
import type { TopbarDropdownModel, TopbarDropdownProps } from './topbar-dropdown-state.js';

function ScopeChip({
  id,
  label,
  count,
  active,
  onScope,
}: {
  readonly id: SearchScope;
  readonly label: string;
  readonly count: number;
  readonly active: boolean;
  readonly onScope: (scope: SearchScope) => void;
}): ReactElement {
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
      onClick={() => onScope(id)}
    >
      {label}
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </ButtonPrimitive>
  );
}

function Scopes({
  scope,
  totals,
  onScope,
}: {
  readonly scope: SearchScope;
  readonly totals: Readonly<Record<SearchScope, number>>;
  readonly onScope: (scope: SearchScope) => void;
}): ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label="Search in"
      className="flex items-center gap-0.5 border-b bg-muted/60 p-1"
    >
      <ScopeChip
        id="inventory"
        label="Inventory"
        count={totals.inventory}
        active={scope === 'inventory'}
        onScope={onScope}
      />
      <ScopeChip
        id="purchases"
        label="Purchases"
        count={totals.purchases}
        active={scope === 'purchases'}
        onScope={onScope}
      />
    </div>
  );
}

function ResultRows(props: TopbarDropdownProps & TopbarDropdownModel): ReactElement {
  if (!props.typed) {
    return (
      <Recents
        queries={props.recentQueries}
        records={props.recentRecords}
        activeIndex={props.activeIndex}
        optionId={props.optionId}
        onQuery={props.setQuery}
        onRecord={props.onRecord}
      />
    );
  }
  if (props.scope === 'inventory') {
    return (
      <>
        {props.rows.map((row, index) => (
          <ResultRow
            key={row.kind === 'place' ? row.place.id : row.hit.item.id}
            id={props.optionId(index)}
            row={row}
            query={props.query}
            world={props.world}
            active={props.activeIndex === index}
            onActivate={() => props.onOpen(index)}
          />
        ))}
      </>
    );
  }
  return (
    <>
      {props.purchases.slice(0, 8).map((hit, index) => (
        <PurchaseRow
          key={hit.id}
          id={props.optionId(index)}
          hit={hit}
          active={props.activeIndex === index}
          onActivate={() => props.onOpen(index)}
        />
      ))}
    </>
  );
}

/** Renders the inventory typeahead and handles its keyboard contract. */
export function TopbarDropdown(props: TopbarDropdownProps): ReactElement {
  const model = useTopbarDropdownModel(props);
  return (
    <div className="overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
      {model.typed ? (
        <Scopes scope={props.scope} totals={props.totals} onScope={props.onScope} />
      ) : null}
      <div id={props.listboxId} role="listbox" aria-label="Search results" className="p-1.5">
        {model.typed ? props.emptyState : null}
        <ResultRows {...props} {...model} />
      </div>
      {props.footer}
    </div>
  );
}
