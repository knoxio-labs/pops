import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';

import { useSetPageContext } from '@pops/navigation';

import { ItemDetailProblem, ItemDetailSkeleton } from '../../foundation/item-page/detail-fallbacks';
import { useShortcutScope } from '../../foundation/shortcuts/shortcut-provider';
import { listTrailState, readListTrail, trailPosition } from '../../inventory-web/list-trail';
import { useOnline } from '../../inventory-web/useOnline';
import { usePlacementSources } from '../../inventory-web/usePlacementSources';
import { parseDetailTab } from './detail-model';
import { DetailReadyView } from './detail-ready-view';
import { useDetailActions } from './use-detail-actions';
import { useFactEditing } from './use-fact-editing';
import { useItemDetailModel } from './use-item-detail-model';

import type { ReactElement } from 'react';

import type { ShortcutHandlers } from '../../foundation/shortcuts/shortcut-provider';
import type { DetailTab } from './detail-model';
import type { DetailTrailPosition } from './detail-trail';

function useDetailPageControls(itemId: string, actionHandlers: ShortcutHandlers) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const onTab = useCallback(
    (nextTab: DetailTab): void => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (nextTab === 'overview') next.delete('tab');
          else next.set('tab', nextTab);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
  const onLinksChanged = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: ['inventory', 'connections'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory', 'fixtures'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory', 'documents'] });
  }, [queryClient]);
  const shortcutHandlers = useMemo(
    () => ({
      'detail-tab-1': () => {
        onTab('overview');
        return true;
      },
      'detail-tab-2': () => {
        onTab('connections');
        return true;
      },
      'detail-tab-3': () => {
        onTab('history');
        return true;
      },
      'detail-history': () => {
        if (itemId.length > 0) void navigate(`/inventory/items/${itemId}/history`);
        return true;
      },
      ...actionHandlers,
    }),
    [actionHandlers, itemId, navigate, onTab]
  );
  useShortcutScope('detail', shortcutHandlers);
  return { tab: parseDetailTab(searchParams.get('tab')), onTab, onLinksChanged };
}

function useTrailPosition(itemId: string): {
  position: DetailTrailPosition | null;
  trail: ReturnType<typeof readListTrail>;
} {
  const location = useLocation();
  const trail = readListTrail(location.state);
  const current = trailPosition(trail, itemId);
  const position =
    current === null
      ? null
      : {
          ...current,
          trailState: trail === null ? undefined : listTrailState(trail),
        };
  return { position, trail };
}

/** The loaded data model consumed by the item-detail view. */
export type ItemDetailModel = NonNullable<ReturnType<typeof useItemDetailModel>['model']>;
type ItemContainer = NonNullable<ItemDetailModel['item']['container']>;

function containerTargetState(container: ItemContainer): 'closed' | 'full' | 'open' {
  if (container.access === 'closed') return 'closed';
  return container.full ? 'full' : 'open';
}

function storeTargetFor(model: ItemDetailModel) {
  const container = model.item.container;
  if (container === null) return null;
  return {
    kind: 'container' as const,
    id: model.item.id,
    name: model.item.name,
    state: containerTargetState(container),
  };
}

function useDetailReadyState({
  itemId,
  model,
  offline,
}: {
  itemId: string;
  model: ItemDetailModel;
  offline: boolean;
}) {
  const navigate = useNavigate();
  const { position, trail } = useTrailPosition(model.item.id);
  const placementSubject = useMemo(() => ({ kind: 'items' as const, ids: [itemId] }), [itemId]);
  const placement = usePlacementSources(placementSubject);
  const actions = useDetailActions(model, position, offline);
  const editing = useFactEditing(model);
  const controls = useDetailPageControls(itemId, actions.keyHandlers);
  const readOnly = offline || model.item.lifecycle === 'destroyed';
  const onQuantity = useCallback(
    (action: 'split' | 'change'): void => {
      const id = action === 'split' ? 'split' : 'change-quantity';
      const entry = actions.verbs.menu.flat().find((candidate) => candidate.id === id);
      if (entry !== undefined) actions.onMenu(entry);
    },
    [actions]
  );
  const onTrailItem = useCallback(
    (id: string | null): void => {
      if (id === null || trail === null) return;
      void navigate(`/inventory/items/${id}`, { state: listTrailState(trail) });
    },
    [navigate, trail]
  );
  const storeTarget = storeTargetFor(model);
  const createPlace = useCallback(
    async (name: string, parentId: string | null): Promise<void> => {
      await placement.createLocation.mutateAsync({ name, parentId });
    },
    [placement.createLocation]
  );
  return {
    position,
    placement,
    actions,
    editing,
    readOnly,
    onQuantity,
    onTrailItem,
    storeTarget,
    createPlace,
    ...controls,
  };
}

/** The loaded item-detail interaction state shared by its view sections. */
export type DetailReadyState = ReturnType<typeof useDetailReadyState>;

function DetailReady({
  itemId,
  model,
  offline,
}: {
  itemId: string;
  model: ItemDetailModel;
  offline: boolean;
}): ReactElement {
  const ready = useDetailReadyState({ itemId, model, offline });
  return <DetailReadyView itemId={itemId} model={model} ready={ready} offline={offline} />;
}

/** Renders the item detail split view at `/inventory/items/:id`. */
export function ItemDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const itemId = id ?? '';
  const state = useItemDetailModel(itemId);
  const offline = !useOnline();
  const entity = useMemo(
    () => ({
      uri: `pops:inventory/item/${itemId}`,
      type: 'item' as const,
      title: state.model?.item.name ?? '',
    }),
    [itemId, state.model?.item.name]
  );
  useSetPageContext({ page: 'item-detail', pageType: 'drill-down', entity });

  if (state.status === 'not-found') return <ItemDetailProblem variant="not-found" />;
  if (state.status === 'loading') return <ItemDetailSkeleton />;
  if (state.status === 'error' || state.model === null) {
    return <ItemDetailProblem variant="error" onRetry={state.retry} />;
  }
  return <DetailReady itemId={itemId} model={state.model} offline={offline} />;
}
