/**
 * The tree's view state, apart from the data: which place is selected,
 * which are open, the filter, and the keys that walk it (j/k or the arrows
 * to move, right and left to open and close).
 */
import { useCallback, useMemo, useState } from 'react';

import { revealIds, stepRow, treeRows } from './tree-rows';

import type { PlacementWorld } from '../foundation';
import type { TreeRow } from './tree-rows';

/** What {@link useTreeView} hands the page. */
export interface TreeViewApi {
  rows: TreeRow[];
  selectedId: string | null;
  expanded: ReadonlySet<string>;
  filter: string;
  select: (id: string | null) => void;
  toggle: (id: string) => void;
  /** Opens every ancestor of `id` and selects it. */
  reveal: (id: string) => void;
  setFilter: (filter: string) => void;
  /** Handles one tree key; true when it was a tree key. */
  onKey: (key: string) => boolean;
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

/** View state over one world. */
export function useTreeView(
  world: PlacementWorld,
  seed: { selectedId?: string | null; expanded?: readonly string[]; filter?: string }
): TreeViewApi {
  const [selectedId, select] = useState(seed.selectedId ?? null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set(seed.expanded ?? []));
  const [filter, setFilter] = useState(seed.filter ?? '');
  const rows = useMemo(() => treeRows(world, expanded, filter), [world, expanded, filter]);
  const toggle = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const reveal = useCallback(
    (id: string) => {
      setExpanded((current) => new Set([...current, ...revealIds(world, id)]));
      select(id);
    },
    [world]
  );
  const onKey = useCallback(
    (key: string) => {
      if (key === 'j' || key === 'ArrowDown') select(stepRow(rows, selectedId, 1));
      else if (key === 'k' || key === 'ArrowUp') select(stepRow(rows, selectedId, -1));
      else if (key === 'ArrowRight' || key === 'ArrowLeft') {
        const id = openOrClose(rows, selectedId, key === 'ArrowRight');
        if (id !== null) toggle(id);
      } else return false;
      return true;
    },
    [rows, selectedId, toggle]
  );
  return { rows, selectedId, expanded, filter, select, toggle, reveal, setFilter, onKey };
}
