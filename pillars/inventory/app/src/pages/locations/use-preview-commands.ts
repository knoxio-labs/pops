import { useCallback } from 'react';
import { useNavigate } from 'react-router';

import type { LocationModel } from '../../foundation/model/model.js';

/** Provides item and new-item navigation commands for the selected-place preview. */
export function usePreviewCommands(place: LocationModel): {
  readonly openItem: (id: string, ids: readonly string[]) => void;
  readonly createItem: () => void;
} {
  const navigate = useNavigate();
  const openItem = useCallback(
    (id: string, ids: readonly string[]): void => {
      const href = `/inventory/locations?selected=${encodeURIComponent(place.id)}`;
      void navigate(`/inventory/items/${id}`, {
        state: { listName: place.name, href, ids },
      });
    },
    [navigate, place.id, place.name]
  );
  const createItem = useCallback((): void => {
    void navigate(`/inventory/items/new?in=${encodeURIComponent(place.id)}`);
  }, [navigate, place.id]);
  return { openItem, createItem };
}
