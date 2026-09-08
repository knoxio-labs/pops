import { type KeyboardEvent, useCallback, useRef, useState } from 'react';

import type { TreeNode } from './tree-node';

interface FlatEntry<T> {
  node: TreeNode<T>;
  level: number;
}

interface UseTreeRovingFocusOptions<T> {
  flat: FlatEntry<T>[];
  expanded: Set<string>;
  toggle: (id: string) => void;
  onSelect?: (node: TreeNode<T>) => void;
  selectedId: string | null;
}

const ROVING_TARGET_INDEX: Record<string, (index: number, lastIndex: number) => number> = {
  ArrowDown: (index, lastIndex) => Math.min(index + 1, lastIndex),
  ArrowUp: (index) => Math.max(index - 1, 0),
  Home: () => 0,
  End: (_index, lastIndex) => lastIndex,
};

function handleExpandCollapse<T>(
  key: string,
  node: TreeNode<T>,
  expanded: Set<string>,
  toggle: (id: string) => void
): boolean {
  if (key === 'ArrowRight') {
    if (node.children.length > 0 && !expanded.has(node.id)) toggle(node.id);
    return true;
  }
  if (key === 'ArrowLeft') {
    if (expanded.has(node.id)) toggle(node.id);
    return true;
  }
  return false;
}

/**
 * WAI-ARIA tree roving-tabindex focus management: a single tab stop into the
 * tree (`activeId`), moved across visible rows by ArrowUp/ArrowDown/Home/End.
 * ArrowRight/ArrowLeft keep expanding/collapsing without moving focus.
 */
export function useTreeRovingFocus<T>({
  flat,
  expanded,
  toggle,
  onSelect,
  selectedId,
}: UseTreeRovingFocusOptions<T>) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const isVisible = useCallback(
    (id: string | null) => id !== null && flat.some((entry) => entry.node.id === id),
    [flat]
  );

  function resolveActiveId(): string | null {
    if (isVisible(focusedId)) return focusedId;
    if (isVisible(selectedId)) return selectedId;
    return flat[0]?.node.id ?? null;
  }
  const activeId = resolveActiveId();

  const focusIndex = useCallback(
    (index: number) => {
      const id = flat[index]?.node.id;
      if (id) itemRefs.current.get(id)?.focus();
    },
    [flat]
  );

  const registerItem = useCallback((id: string, el: HTMLLIElement | null) => {
    if (el) itemRefs.current.set(id, el);
    else itemRefs.current.delete(id);
  }, []);

  const handleKeyDown = useCallback(
    (index: number) => (e: KeyboardEvent<HTMLLIElement>) => {
      const entry = flat[index];
      if (!entry) return;
      const { node } = entry;

      const rovingTarget = ROVING_TARGET_INDEX[e.key];
      if (rovingTarget) {
        e.preventDefault();
        focusIndex(rovingTarget(index, flat.length - 1));
        return;
      }
      if (handleExpandCollapse(e.key, node, expanded, toggle)) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect?.(node);
      }
    },
    [flat, expanded, toggle, onSelect, focusIndex]
  );

  return { activeId, registerItem, handleKeyDown, onItemFocus: setFocusedId };
}
