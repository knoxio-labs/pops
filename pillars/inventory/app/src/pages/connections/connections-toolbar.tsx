import { List, Network, Search } from 'lucide-react';

import { Input, Tabs, TabsList, TabsTrigger, ViewToggleGroup } from '@pops/ui';

import { isConnectionKind, type ConnectionKind, type ConnectionView } from './connections-url.js';

import type { ReactElement } from 'react';

import type { WebConnectionsListResponse } from '../../inventory-api/types.gen.js';

/** Props for the server-backed Connections toolbar. */
export interface ConnectionsToolbarProps {
  query: string;
  kind: ConnectionKind;
  view: ConnectionView;
  summary: WebConnectionsListResponse['summary'] | null;
  total: number | null;
  narrowed: boolean;
  onQueryChange: (value: string) => void;
  onKindChange: (kind: ConnectionKind) => void;
  onViewChange: (view: ConnectionView) => void;
}

function Summary({
  summary,
  total,
  narrowed,
}: Pick<ConnectionsToolbarProps, 'summary' | 'total' | 'narrowed'>): ReactElement | null {
  if (!narrowed || summary === null || total === null) return null;
  return (
    <p aria-live="polite" className="text-xs tabular-nums text-muted-foreground">
      {summary.connections} of {total} shown: {summary.items} items, {summary.fixtures} fixtures
    </p>
  );
}

/** Renders query, kind, server-summary, and list/graph controls. */
export function ConnectionsToolbar({
  query,
  kind,
  view,
  summary,
  total,
  narrowed,
  onQueryChange,
  onKindChange,
  onViewChange,
}: ConnectionsToolbarProps): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="relative min-w-56 flex-1 sm:max-w-sm" htmlFor="connections-query">
        <span className="sr-only">Filter connections</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="connections-query"
          value={query}
          maxLength={200}
          placeholder="Filter by item, fixture or code"
          onChange={(event) => onQueryChange(event.target.value)}
          className="pl-9"
        />
      </label>
      <Tabs
        value={kind}
        onValueChange={(value) => {
          if (isConnectionKind(value)) onKindChange(value);
        }}
      >
        <TabsList aria-label="Connection kind" variant="line">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="item">Between items</TabsTrigger>
          <TabsTrigger value="fixture">To fixtures</TabsTrigger>
        </TabsList>
      </Tabs>
      <Summary summary={summary} total={total} narrowed={narrowed} />
      <ViewToggleGroup<ConnectionView>
        className="ml-auto"
        value={view}
        onChange={onViewChange}
        options={[
          { value: 'list', label: 'List', icon: <List className="size-4" aria-hidden /> },
          {
            value: 'graph',
            label: 'Graph',
            icon: <Network className="size-4" aria-hidden />,
          },
        ]}
      />
    </div>
  );
}
