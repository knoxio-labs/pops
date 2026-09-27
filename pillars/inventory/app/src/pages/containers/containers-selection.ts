import { useCallback, useMemo, useState } from 'react';

import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { labelsHref } from '../labels-page/label-params.js';

import type { useNavigate } from 'react-router';

import type { SelectionBarAction } from '../../foundation/model/contracts.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { useSelection } from '../../foundation/selection/use-selection.js';
import type { BulkItemRefusal, BulkResult } from '../../inventory-web/item-verbs-bulk-types.js';
import type { useBulkItemVerbs } from '../../inventory-web/item-verbs-bulk.js';

function refusalMessage(refusal: BulkItemRefusal): string {
  if (refusal.kind === 'failed') return 'The inventory service did not answer.';
  if (refusal.kind === 'no-previous-place') return 'This container has no remembered place.';
  return 'message' in refusal.outcome && typeof refusal.outcome.message === 'string'
    ? refusal.outcome.message
    : 'The inventory service rejected this action.';
}

function mergeRejections(
  previous: Readonly<Record<string, string>>,
  ids: readonly string[],
  result: BulkResult
): Readonly<Record<string, string>> {
  const next = { ...previous };
  ids.forEach((id) => delete next[id]);
  result.refused.forEach(({ id, refusal }) => {
    next[id] = refusalMessage(refusal);
  });
  return next;
}

function selectionActions({
  ids,
  world,
  online,
  onAccess,
  onPrint,
  onLifecycle,
}: {
  ids: readonly string[];
  world: PlacementWorld;
  online: boolean;
  onAccess: (access: 'open' | 'closed') => void;
  onPrint: () => void;
  onLifecycle: (lifecycle: 'retired' | 'discarded') => void;
}): SelectionBarAction[] {
  const allClosed =
    ids.length > 0 && ids.every((id) => world.items.get(id)?.container?.access === 'closed');
  const access = allClosed ? 'open' : 'closed';
  const disabledReason = online ? undefined : 'No connection';
  return [
    {
      id: access,
      label: allClosed ? 'Open' : 'Close',
      icon: allClosed ? INVENTORY_ICONS.open : INVENTORY_ICONS.closed,
      onSelect: () => onAccess(access),
      disabledReason,
    },
    {
      id: 'label',
      label: 'Print labels',
      icon: INVENTORY_ICONS.label,
      shortcutId: 'label',
      onSelect: onPrint,
      disabledReason,
    },
    {
      id: 'retire',
      label: 'Retire',
      icon: INVENTORY_ICONS.retired,
      onSelect: () => onLifecycle('retired'),
      disabledReason,
      overflow: true,
    },
    {
      id: 'discard',
      label: 'Discard',
      icon: INVENTORY_ICONS.discarded,
      onSelect: () => onLifecycle('discarded'),
      disabledReason,
      overflow: true,
    },
  ];
}

/** Provides selection verbs and row-level rejection messages for containers. */
export function useContainerSelectionActions({
  selection,
  world,
  online,
  navigate,
  verbs,
}: {
  selection: ReturnType<typeof useSelection>;
  world: PlacementWorld;
  online: boolean;
  navigate: ReturnType<typeof useNavigate>;
  verbs: ReturnType<typeof useBulkItemVerbs>;
}) {
  const [rejections, setRejections] = useState<Readonly<Record<string, string>>>({});
  const ids = selection.selectedIds;

  const finish = useCallback((selectedIds: readonly string[], result: BulkResult): void => {
    setRejections((previous) => mergeRejections(previous, selectedIds, result));
  }, []);

  const run = useCallback(
    async (selectedIds: readonly string[], operation: () => Promise<BulkResult>): Promise<void> => {
      try {
        finish(selectedIds, await operation());
      } catch {
        setRejections((previous) => {
          const next = { ...previous };
          selectedIds.forEach((id) => {
            next[id] = 'The inventory service did not answer.';
          });
          return next;
        });
      }
    },
    [finish]
  );

  const onAccess = useCallback(
    (access: 'open' | 'closed'): void => {
      const selectedIds = [...ids];
      void run(selectedIds, () => verbs.setAccess(selectedIds, access));
    },
    [ids, run, verbs]
  );
  const onLifecycle = useCallback(
    (lifecycle: 'retired' | 'discarded'): void => {
      const selectedIds = [...ids];
      void run(selectedIds, () => verbs.setLifecycle(selectedIds, lifecycle, null));
    },
    [ids, run, verbs]
  );
  const onPrint = useCallback((): void => {
    void navigate(labelsHref(ids));
  }, [ids, navigate]);
  const actions = useMemo(
    () => selectionActions({ ids, world, online, onAccess, onPrint, onLifecycle }),
    [ids, onAccess, onLifecycle, onPrint, online, world]
  );

  return { actions, rejections };
}
