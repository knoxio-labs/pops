import { useCallback, useState } from 'react';

import { type ItemFormOpening } from './item-form-opening';

import type { ConnectCandidateItem } from '@/kit/inventory/connections/types';

export function useConnectionsState(opening: ItemFormOpening, isEditMode: boolean) {
  const [pendingConnections, setPendingConnections] = useState(opening.pendingConnections ?? []);
  const [connectionSearch, setConnectionSearch] = useState(opening.connectionSearch ?? '');
  const candidates = opening.connectionCandidates ?? [];
  const searchLoading = opening.connectionSearchLoading ?? false;

  // The source's search is a server query (`itemsList({ search })`); the
  // canvas has no server, so a search 2+ characters long answers with the
  // whole fixture candidate pool rather than filtering it client-side, and
  // `ConnectionsSection` itself still excludes anything already pending.
  const searchResults =
    !isEditMode && connectionSearch.length >= 2 ? { data: candidates } : undefined;

  const onAdd = useCallback((item: ConnectCandidateItem) => {
    setPendingConnections((prev) => [...prev, { id: item.id, itemName: item.itemName }]);
  }, []);
  const onRemove = useCallback((itemId: string) => {
    setPendingConnections((prev) => prev.filter((c) => c.id !== itemId));
  }, []);

  return {
    pendingConnections,
    connectionSearch,
    setConnectionSearch,
    searchResults,
    searchLoading,
    onAdd,
    onRemove,
  };
}
