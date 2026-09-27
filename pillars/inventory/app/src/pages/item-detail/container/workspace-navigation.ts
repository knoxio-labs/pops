import { useCallback } from 'react';
import { useNavigate } from 'react-router';

import { labelsHref, MAX_LABEL_IDS } from '../../labels-page/label-params.js';

/** Navigation actions used by rows in the container contents list. */
export interface ContainerNavigation {
  onLabel: (ids: readonly string[]) => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
}

/** Creates guarded row navigation for labels, details, and editing. */
export function useContainerNavigation(readOnly: boolean): ContainerNavigation {
  const navigate = useNavigate();
  const onLabel = useCallback(
    (ids: readonly string[]): void => {
      if (readOnly || ids.length === 0 || ids.length > MAX_LABEL_IDS) return;
      void navigate(labelsHref(ids));
    },
    [navigate, readOnly]
  );
  const onOpen = useCallback(
    (id: string): void => {
      void navigate(`/inventory/items/${id}`);
    },
    [navigate]
  );
  const onEdit = useCallback(
    (id: string): void => {
      if (!readOnly) void navigate(`/inventory/items/${id}/edit`);
    },
    [navigate, readOnly]
  );
  return { onLabel, onOpen, onEdit };
}
