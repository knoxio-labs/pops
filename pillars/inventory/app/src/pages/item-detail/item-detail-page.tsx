import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { useSetPageContext } from '@pops/navigation';

import { ItemDetailProblem, ItemDetailSkeleton } from '../../foundation/item-page/detail-fallbacks';
import { useShortcutScope } from '../../foundation/shortcuts/shortcut-provider';
import { DetailHeader } from './detail-header';
import { parseDetailTab } from './detail-model';
import { ItemDetailView } from './item-detail-view';
import { useItemDetailModel } from './use-item-detail-model';

import type { ReactElement } from 'react';

import type { DetailTab } from './detail-model';

function useDetailPageControls(itemId: string) {
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
    }),
    [itemId, navigate, onTab]
  );
  useShortcutScope('detail', shortcutHandlers);
  return { tab: parseDetailTab(searchParams.get('tab')), onTab, onLinksChanged };
}

/** Renders the read-only item detail split view at `/inventory/items/:id`. */
export function ItemDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const itemId = id ?? '';
  const state = useItemDetailModel(itemId);
  const { tab, onTab, onLinksChanged } = useDetailPageControls(itemId);
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
  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
      <DetailHeader item={state.model.item} world={state.model.world} />
      <ItemDetailView
        itemId={itemId}
        model={state.model}
        tab={tab}
        readOnly={state.model.item.lifecycle === 'destroyed'}
        onTab={onTab}
        onLinksChanged={onLinksChanged}
      />
    </div>
  );
}
