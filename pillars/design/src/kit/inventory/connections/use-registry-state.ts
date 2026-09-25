import { EMPTY_SELECTION, useSelection } from '@/kit/inventory/foundation';
/**
 * The connections page's local state: filters, view, selection, the traced
 * item, the connect dialog, and edges removed optimistically with an undo
 * waiting. Everything a review state needs to open in is a seed.
 */
import { useMemo, useState } from 'react';

import { connectionRows, filterConnections, registrySummary } from './connection-model';
import { traceChain } from './connection-trace';

import type { ConnectionModel } from '@/kit/inventory/fixtures/fixture-model';

import type { ConnectionIndex, ConnectionKindFilter } from './connection-model';

/** Where the page opens. */
export interface RegistrySeed {
  query?: string;
  kind?: ConnectionKindFilter;
  view?: 'list' | 'graph';
  selected?: readonly string[];
  focusedId?: string;
  traceItemId?: string;
  connectOpen?: boolean;
  /** Edges shown as just disconnected, with the undo toast. */
  disconnected?: readonly string[];
}

/** The page's state for one set of connections. */
export function useRegistryState(
  connections: readonly ConnectionModel[],
  index: ConnectionIndex,
  seed: RegistrySeed = {}
) {
  const [query, setQuery] = useState(seed.query ?? '');
  const [kind, setKind] = useState<ConnectionKindFilter>(seed.kind ?? 'all');
  const [view, setView] = useState<'list' | 'graph'>(seed.view ?? 'list');
  const [traceItemId, setTraceItemId] = useState<string | null>(seed.traceItemId ?? null);
  const [connectOpen, setConnectOpen] = useState(seed.connectOpen ?? false);
  const [removed, setRemoved] = useState<readonly string[]>(seed.disconnected ?? []);
  const live = useMemo(
    () => connections.filter((edge) => !removed.includes(edge.id)),
    [connections, removed]
  );
  const all = useMemo(() => connectionRows(live, index), [live, index]);
  const rows = useMemo(() => filterConnections(all, { query, kind }), [all, query, kind]);
  const order = useMemo(() => rows.map((row) => row.edge.id), [rows]);
  const selection = useSelection(order, {
    ...EMPTY_SELECTION,
    selected: new Set(seed.selected ?? []),
    focusedId: seed.focusedId ?? null,
  });
  const chain = traceItemId === null ? null : traceChain(traceItemId, live, index);
  return {
    query,
    setQuery,
    kind,
    setKind,
    view,
    setView,
    rows,
    total: all.length,
    summary: registrySummary(rows),
    filtered: query.trim() !== '' || kind !== 'all',
    clearFilters: () => {
      setQuery('');
      setKind('all');
    },
    selection,
    chain,
    trace: setTraceItemId,
    connectOpen,
    setConnectOpen,
    removed,
    disconnect: (ids: readonly string[]) => setRemoved((current) => [...current, ...ids]),
    undo: () => setRemoved([]),
    live,
  };
}

/** What {@link useRegistryState} returns. */
export type RegistryState = ReturnType<typeof useRegistryState>;
