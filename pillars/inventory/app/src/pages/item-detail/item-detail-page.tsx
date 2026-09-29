import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';

import { useSetPageContext } from '@pops/navigation';

import { ItemDetailProblem, ItemDetailSkeleton } from '../../foundation/item-page/detail-fallbacks';
import { isUnavailableError } from '../../inventory-api-helpers.js';
import { WEB_ITEMS_QUERY_KEY, webItemDetailQueryKey } from '../../inventory-web/queryKeys.js';
import { useChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import { useOnline } from '../../inventory-web/useOnline';
import { useSyncLedger } from '../../inventory-web/useSyncLedger.js';
import { DetailBanners, type DetailStaleState, type DetailSyncCase } from './detail-banners';
import { DetailReadyView } from './detail-ready-view';
import { useDetailReadyState, type DetailReadyState } from './use-detail-ready-state';
import { useItemDetailModel } from './use-item-detail-model';

import type { ReactElement } from 'react';

import type { ItemDetailModel } from './detail-model';
import type { ItemDetailBannerState } from './use-item-detail-state';

function DetailReady({
  itemId,
  model,
  offline,
  banner,
  onRetry,
  cases,
  stale,
  onReload,
  onOpenCase,
}: {
  itemId: string;
  model: ItemDetailModel;
  offline: boolean;
  banner: ItemDetailBannerState | null;
  onRetry: () => void;
  cases: readonly DetailSyncCase[];
  stale: DetailStaleState | null;
  onReload: () => void;
  onOpenCase: (caseId: string) => void;
}): ReactElement {
  const ready: DetailReadyState = useDetailReadyState({ itemId, model, offline });
  return (
    <DetailReadyView
      itemId={itemId}
      model={model}
      ready={ready}
      offline={offline}
      banner={banner}
      onRetry={onRetry}
      detailBanners={
        <DetailBanners
          item={model.item}
          cases={cases}
          stale={stale}
          offline={offline}
          onReload={onReload}
          onOpenCase={onOpenCase}
        />
      }
    />
  );
}

/** Renders the item detail split view at `/inventory/items/:id`. */
export function ItemDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const itemId = id ?? '';
  const navigate = useNavigate();
  const state = useItemDetailModel(itemId);
  const offline = !useOnline();
  const changed = useChangedElsewhere({
    queryKeys: [webItemDetailQueryKey(itemId), [...WEB_ITEMS_QUERY_KEY, 'placement-subjects']],
    entityId: itemId,
    enabled: state.status === 'ready',
  });
  const sync = useSyncLedger();
  const cases = useMemo(
    () => sync.ledger?.attention.filter((entry) => entry.itemId === itemId) ?? [],
    [itemId, sync.ledger]
  );
  const stale = useMemo<DetailStaleState | null>(() => {
    const group = changed.groups[0];
    if (group === undefined) return null;
    return {
      actorLabel: group.actorLabel,
      latestServerTime: group.latestServerTime,
    };
  }, [changed.groups]);
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
    return (
      <ItemDetailProblem
        variant={isUnavailableError(state.error) ? 'unavailable' : 'error'}
        onRetry={state.retry}
      />
    );
  }
  return (
    <DetailReady
      itemId={itemId}
      model={state.model}
      offline={offline}
      banner={state.banner}
      onRetry={state.retry}
      cases={cases}
      stale={stale}
      onReload={() => void changed.reload()}
      onOpenCase={(caseId) => navigate(`/inventory/sync?case=${encodeURIComponent(caseId)}`)}
    />
  );
}
