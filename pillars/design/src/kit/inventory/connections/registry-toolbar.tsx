import { FilterField } from '@/kit/inventory/secondary-page/list-parts';
/**
 * The registry's filter row: the query, which edges (all, between items, to
 * fixtures), the count that says what the filters left, and List or Graph.
 */
import { List, Network } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger, ViewToggleGroup } from '@pops/ui';

import type { ConnectionKindFilter } from './connection-model';
import type { RegistryState } from './use-registry-state';

const KINDS: readonly { value: ConnectionKindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'item', label: 'Between items' },
  { value: 'fixture', label: 'To fixtures' },
];

function summaryText(state: RegistryState): string | null {
  if (!state.filtered) return null;
  const { connections, items, fixtures } = state.summary;
  return `${connections} of ${state.total} shown: ${items} items, ${fixtures} fixtures`;
}

/** The filter row. */
export function RegistryToolbar({ state }: { state: RegistryState }) {
  return (
    <div className="flex items-center gap-3">
      <FilterField
        value={state.query}
        placeholder="Filter by item, fixture or code"
        onChange={state.setQuery}
        className="w-64 shrink-0"
      />
      <Tabs
        className="shrink-0"
        value={state.kind}
        onValueChange={(value) => {
          const found = KINDS.find((kind) => kind.value === value);
          if (found) state.setKind(found.value);
        }}
      >
        <TabsList aria-label="Which connections" className="w-auto shrink-0">
          {KINDS.map((kind) => (
            <TabsTrigger key={kind.value} value={kind.value} className="flex-none px-3">
              {kind.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="min-w-0 truncate text-xs tabular-nums text-muted-foreground" aria-live="polite">
        {summaryText(state)}
      </p>
      <ViewToggleGroup
        className="ml-auto"
        value={state.view}
        onChange={state.setView}
        options={[
          { value: 'list', label: 'List', icon: <List className="size-4" /> },
          { value: 'graph', label: 'Graph', icon: <Network className="size-4" /> },
        ]}
      />
    </div>
  );
}
