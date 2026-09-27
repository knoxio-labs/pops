import { useMemo } from 'react';
import { useParams } from 'react-router';

import { useSetPageContext } from '@pops/navigation';

import { ItemDetailProblem, ItemDetailSkeleton } from '../../foundation/item-page/detail-fallbacks';
import { isUnavailableError } from '../../inventory-api-helpers.js';
import { useOnline } from '../../inventory-web/useOnline';
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
}: {
  itemId: string;
  model: ItemDetailModel;
  offline: boolean;
  banner: ItemDetailBannerState | null;
  onRetry: () => void;
}): ReactElement {
  const ready: DetailReadyState = useDetailReadyState({ itemId, model, offline });
  return (
    <DetailReadyView
      itemId={itemId}
      model={model}
      ready={ready}
      offline={offline}
      banner={offline ? 'unavailable' : banner}
      onRetry={onRetry}
    />
  );
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
    />
  );
}
