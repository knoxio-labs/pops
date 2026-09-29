import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { labelsHref, MAX_LABEL_IDS } from '../labels-page/label-params.js';

import type { NavigateFunction } from 'react-router';

import type { FilterOption } from '../../foundation/list-page/list-filters.js';
import type { PlacementTarget, PlacementWorld } from '../../foundation/model/contracts.js';
import type { CatalogueLookups } from '../../inventory-web/useCatalogueLookups.js';
import type { BulkEntry } from './use-bulk-entry.js';

interface PlacementPresetSource {
  world: PlacementWorld;
  isLoading: boolean;
  isError: boolean;
}

/** The source state needed to apply the bulk-entry URL presets once. */
export interface BulkEntryPresetSources {
  placement: PlacementPresetSource;
  catalogue: Pick<CatalogueLookups, 'isPending' | 'error'>;
}

/** Applies cold-load URL presets without overriding a user's toolbar choice. */
export function useBulkEntryPresets(
  search: string,
  entry: Pick<BulkEntry, 'setDestination' | 'setDefaultTypeKey'>,
  sources: BulkEntryPresetSources,
  typeOptions: readonly FilterOption[]
): {
  onDestination: (target: PlacementTarget) => void;
  onDefaultTypeKey: (key: string | null) => void;
} {
  const paramsRef = useRef(new URLSearchParams(search));
  const destinationApplied = useRef(false);
  const typeApplied = useRef(false);
  const destinationPicked = useRef(false);
  const typePicked = useRef(false);
  const { setDestination, setDefaultTypeKey } = entry;

  useEffect(() => {
    if (destinationApplied.current || sources.placement.isLoading) return;
    destinationApplied.current = true;
    if (sources.placement.isError || destinationPicked.current) return;
    const id = paramsRef.current.get('in');
    if (id === null) return;
    if (sources.placement.world.locations.has(id)) {
      setDestination({ kind: 'location', locationId: id });
    } else if (sources.placement.world.items.has(id)) {
      setDestination({ kind: 'container', containerId: id });
    }
  }, [setDestination, sources.placement]);

  useEffect(() => {
    if (typeApplied.current || sources.catalogue.isPending) return;
    typeApplied.current = true;
    if (sources.catalogue.error !== null || typePicked.current) return;
    const key = paramsRef.current.get('type');
    if (key !== null && typeOptions.some((option) => option.value === key)) {
      setDefaultTypeKey(key);
    }
  }, [setDefaultTypeKey, sources.catalogue, typeOptions]);

  const onDestination = useCallback(
    (target: PlacementTarget): void => {
      destinationPicked.current = true;
      setDestination(target);
    },
    [setDestination]
  );
  const onDefaultTypeKey = useCallback(
    (key: string | null): void => {
      typePicked.current = true;
      setDefaultTypeKey(key);
    },
    [setDefaultTypeKey]
  );
  return { onDestination, onDefaultTypeKey };
}

/** Provides navigation and undo actions for the most recent bulk commit. */
export function useBulkEntryPageActions(
  entry: Pick<BulkEntry, 'createdIds' | 'undoCreated'>,
  navigate: NavigateFunction
): {
  onShowInItems: () => void;
  onPrintLabels: () => void;
  onUndo: () => void;
} {
  const { createdIds, undoCreated } = entry;
  const onShowInItems = useCallback((): void => {
    void navigate('/inventory/items?sort=updated');
  }, [navigate]);
  const onPrintLabels = useCallback((): void => {
    if (createdIds.length > MAX_LABEL_IDS) return;
    void navigate(labelsHref(createdIds));
  }, [createdIds, navigate]);
  const onUndo = useCallback((): void => {
    void undoCreated().then((result) => {
      const kept = result.kept.length === 0 ? '' : ` ${result.kept.length} could not be removed.`;
      toast(`Removed ${result.removed.length} items.${kept}`);
    });
  }, [undoCreated]);
  return { onShowInItems, onPrintLabels, onUndo };
}
