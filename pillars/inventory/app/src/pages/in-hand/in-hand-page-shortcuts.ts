import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';

import { returnRoute } from '../../foundation/in-hand/in-hand-model.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { useShortcutScope } from '../../foundation/shortcuts/shortcut-provider.js';
import { listTrailState } from '../../inventory-web/list-trail.js';
import { labelsHref, MAX_LABEL_IDS } from '../labels-page/label-params.js';

import type { SelectionBarAction } from '../../foundation/model/contracts.js';
import type { ShortcutHandlers } from '../../foundation/shortcuts/shortcut-provider.js';
import type { InHandPageActions } from './in-hand-page-actions.js';
import type { InHandPageData } from './in-hand-page-model.js';

function selectedOrFocusedIds(data: InHandPageData): string[] {
  if (data.selection.count > 0) return data.selection.selectedIds;
  const focusedId = data.selection.state.focusedId;
  return focusedId !== null && data.items.some((row) => row.id === focusedId) ? [focusedId] : [];
}

interface HandlerContext {
  data: InHandPageData;
  actions: InHandPageActions;
  navigate: ReturnType<typeof useNavigate>;
  selectedOrFocused: () => string[];
  openFocused: (event: KeyboardEvent) => boolean;
}

function createHandlers({
  data,
  actions,
  navigate,
  selectedOrFocused,
  openFocused,
}: HandlerContext): ShortcutHandlers {
  return {
    'put-back': (): boolean => {
      if (!data.online) return false;
      const ids = selectedOrFocused();
      if (ids.length === 0) return false;
      if (data.selection.count > 0) actions.putBackAll(ids);
      else if (data.world.items.get(ids[0] ?? '') !== undefined) {
        const item = data.world.items.get(ids[0] ?? '');
        if (item !== undefined && returnRoute(item).kind === 'back') actions.putBack(ids[0] ?? '');
        else return false;
      }
      return true;
    },
    move: (): boolean => {
      if (!data.online) return false;
      const ids = selectedOrFocused();
      if (ids.length === 0) return false;
      actions.openPicker(ids, data.selection.count > 0 ? 'dock' : 'row');
      return true;
    },
    label: (): boolean => {
      if (!data.online) return false;
      const ids = selectedOrFocused();
      if (ids.length === 0 || ids.length > MAX_LABEL_IDS) return false;
      void navigate(labelsHref(ids));
      return true;
    },
    'list-open': openFocused,
    dismiss: (): boolean => {
      if (data.selection.count === 0) return false;
      data.selection.clearSelection();
      return true;
    },
  };
}

function selectionActions(
  data: InHandPageData,
  actions: InHandPageActions,
  navigate: ReturnType<typeof useNavigate>,
  labelReason: string | undefined
): SelectionBarAction[] {
  const selectedIds = data.selection.selectedIds;
  return [
    {
      id: 'put-back',
      label: 'Put back',
      icon: INVENTORY_ICONS.putBack,
      shortcutId: 'put-back',
      disabledReason: data.disabledReason,
      onSelect: () => actions.putBackAll(selectedIds),
    },
    {
      id: 'move',
      label: 'Move',
      icon: INVENTORY_ICONS.move,
      shortcutId: 'move',
      disabledReason: data.disabledReason,
      onSelect: () => actions.openPicker(selectedIds, 'dock'),
    },
    {
      id: 'label',
      label: 'Label',
      icon: INVENTORY_ICONS.label,
      shortcutId: 'label',
      disabledReason: labelReason,
      onSelect: () => void navigate(labelsHref(selectedIds)),
    },
  ];
}

/** Registers in-hand keyboard commands and returns the selection-bar actions. */
export function useInHandPageShortcuts(
  data: InHandPageData,
  actions: InHandPageActions
): SelectionBarAction[] {
  const navigate = useNavigate();
  const selectedOrFocused = useCallback(() => selectedOrFocusedIds(data), [data]);
  const openFocused = useCallback(
    (event: KeyboardEvent): boolean => {
      if (
        !(event.target instanceof HTMLElement) ||
        event.target.closest('[role="grid"]') === null
      ) {
        return false;
      }
      const id = data.selection.state.focusedId;
      if (id === null) return false;
      void navigate(`/inventory/items/${id}`, {
        state: listTrailState({
          listName: 'In hand',
          href: '/inventory/in-hand',
          ids: data.itemIds,
        }),
      });
      return true;
    },
    [data.itemIds, data.selection.state.focusedId, navigate]
  );
  const handlers = useMemo(
    () => createHandlers({ data, actions, navigate, selectedOrFocused, openFocused }),
    [actions, data, navigate, openFocused, selectedOrFocused]
  );
  useShortcutScope('list', handlers);
  const labelReason =
    data.disabledReason ??
    (data.selection.selectedIds.length > MAX_LABEL_IDS
      ? `Print labels takes at most ${MAX_LABEL_IDS} items`
      : undefined);
  return useMemo(
    () => selectionActions(data, actions, navigate, labelReason),
    [actions, data, labelReason, navigate]
  );
}
