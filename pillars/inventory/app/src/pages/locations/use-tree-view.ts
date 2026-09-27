import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { revealIds, stepRow, treeRows } from './tree-rows.js';

import type { KeyboardEvent } from 'react';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { TreeRow } from './tree-rows.js';

/** The tree's selected URL state, expansion state, filter, and keyboard actions. */
export interface TreeViewApi {
  readonly rows: TreeRow[];
  readonly selectedId: string | null;
  readonly expanded: ReadonlySet<string>;
  readonly filter: string;
  readonly select: (id: string | null) => void;
  readonly toggle: (id: string) => void;
  readonly reveal: (id: string) => void;
  readonly setFilter: (filter: string) => void;
  readonly onKey: (event: KeyboardEvent<HTMLElement>) => boolean;
}

function selectedFromSearch(search: string): string | null {
  return new URLSearchParams(search).get('selected');
}

function openOrClose(
  rows: readonly TreeRow[],
  selectedId: string | null,
  open: boolean
): string | null {
  const row = rows.find((entry) => entry.node.id === selectedId);
  if (row === undefined || !row.hasChildren || row.expanded === open) return null;
  return row.node.id;
}

function updateSelectedSearch(search: string, id: string | null): string {
  const params = new URLSearchParams(search);
  if (id === null) params.delete('selected');
  else params.set('selected', id);
  const next = params.toString();
  return next === '' ? '' : `?${next}`;
}

function useTreeKeyboard(
  rows: readonly TreeRow[],
  selectedId: string | null,
  select: (id: string | null) => void,
  toggle: (id: string) => void
): (event: KeyboardEvent<HTMLElement>) => boolean {
  return useCallback(
    (event: KeyboardEvent<HTMLElement>): boolean => {
      if (event.key === 'j' || event.key === 'ArrowDown') {
        select(stepRow(rows, selectedId, 1));
        return true;
      }
      if (event.key === 'k' || event.key === 'ArrowUp') {
        select(stepRow(rows, selectedId, -1));
        return true;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const id = openOrClose(rows, selectedId, event.key === 'ArrowRight');
        if (id !== null) toggle(id);
        return true;
      }
      return false;
    },
    [rows, select, selectedId, toggle]
  );
}

interface ExpansionState {
  readonly expanded: ReadonlySet<string>;
  readonly collapsed: ReadonlySet<string>;
}

function useTreeExpansion(
  world: PlacementWorld,
  selectedId: string | null
): {
  readonly expanded: ReadonlySet<string>;
  readonly toggle: (id: string) => void;
  readonly reveal: (id: string) => void;
} {
  const [state, setState] = useState<ExpansionState>({
    expanded: new Set(),
    collapsed: new Set(),
  });
  const revealed = useMemo(
    () => new Set(selectedId === null ? [] : revealIds(world, selectedId)),
    [selectedId, world]
  );
  const expanded = useMemo(() => {
    const next = new Set([...state.expanded, ...revealed]);
    for (const id of state.collapsed) next.delete(id);
    return next;
  }, [revealed, state.collapsed, state.expanded]);
  const toggle = useCallback(
    (id: string): void => {
      setState((current) => {
        const nextExpanded = new Set(current.expanded);
        const nextCollapsed = new Set(current.collapsed);
        const isOpen = (nextExpanded.has(id) || revealed.has(id)) && !nextCollapsed.has(id);
        if (isOpen) {
          nextExpanded.delete(id);
          nextCollapsed.add(id);
        } else {
          nextExpanded.add(id);
          nextCollapsed.delete(id);
        }
        return { expanded: nextExpanded, collapsed: nextCollapsed };
      });
    },
    [revealed]
  );
  const reveal = useCallback(
    (id: string): void => {
      const ancestors = revealIds(world, id);
      setState((current) => {
        const nextExpanded = new Set(current.expanded);
        const nextCollapsed = new Set(current.collapsed);
        for (const ancestor of ancestors) {
          nextExpanded.add(ancestor);
          nextCollapsed.delete(ancestor);
        }
        return { expanded: nextExpanded, collapsed: nextCollapsed };
      });
    },
    [world]
  );
  return { expanded, toggle, reveal };
}

/** Owns Locations tree state and writes selection without dropping other URL parameters. */
export function useTreeView(world: PlacementWorld): TreeViewApi {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedId = selectedFromSearch(location.search);
  const [filter, setFilter] = useState('');
  const { expanded, toggle, reveal: revealExpansion } = useTreeExpansion(world, selectedId);
  const rows = useMemo(() => treeRows(world, expanded, filter), [expanded, filter, world]);

  const select = useCallback(
    (id: string | null): void => {
      if (id !== null) revealExpansion(id);
      void navigate(
        { pathname: location.pathname, search: updateSelectedSearch(location.search, id) },
        { replace: true }
      );
    },
    [location.pathname, location.search, navigate, revealExpansion]
  );
  const reveal = useCallback((id: string): void => select(id), [select]);
  const onKey = useTreeKeyboard(rows, selectedId, select, toggle);

  return {
    rows,
    selectedId,
    expanded,
    filter,
    select,
    toggle,
    reveal,
    setFilter,
    onKey,
  };
}
