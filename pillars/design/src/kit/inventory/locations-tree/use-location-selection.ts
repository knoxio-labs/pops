import { useCallback, useState } from 'react';

import type { LocationsPageSeed } from './locations-page-types';

/** Which node is selected, being renamed inline, mid-drag, or mid-add/move/delete. */
export function useLocationSelectionState(seed: LocationsPageSeed) {
  const [selectedId, setSelectedId] = useState(seed.selectedId);
  const [addingChildOf, setAddingChildOf] = useState(seed.addingChildOf);
  const [addingRoot, setAddingRoot] = useState(seed.addingRoot);
  const [movingId, setMovingId] = useState(seed.movingId);
  const [activeId, setActiveId] = useState<string | null>(seed.dragState?.activeId ?? null);
  const [overId, setOverId] = useState<string | null>(seed.dragState?.overId ?? null);

  const toggleSelected = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  return {
    selectedId,
    setSelectedId,
    toggleSelected,
    addingChildOf,
    setAddingChildOf,
    addingRoot,
    setAddingRoot,
    movingId,
    setMovingId,
    activeId,
    setActiveId,
    overId,
    setOverId,
  };
}
