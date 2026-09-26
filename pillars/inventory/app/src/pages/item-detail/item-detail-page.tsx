import { useMemo } from 'react';

import { buildItemDetailAggregate } from '../../foundation/item-page';
import { isNotFoundError } from '../../inventory-api-helpers.js';
import { DetailHeader, LifecycleNotice } from './detail-header';
import { ItemDetailProblem, ItemDetailSkeleton } from './detail-states';
import { DetailTabs } from './detail-tabs';
import { HeaderActions } from './header-actions';
import { useItemDetailPageModel } from './useItemDetailPageModel';

type DetailModel = ReturnType<typeof useItemDetailPageModel>;

function DetailContent({ model, itemId }: { model: DetailModel; itemId: string }) {
  const item = model.item;
  const detail = useMemo(
    () =>
      item === undefined
        ? null
        : buildItemDetailAggregate({
            legacyItem: item,
            webItem: model.webItem,
            locationPath: model.locationPath,
            photos: model.photosData?.data ?? [],
            history: model.history,
          }),
    [item, model.history, model.locationPath, model.photosData?.data, model.webItem]
  );
  if (!item || !detail) return null;
  const connections = model.connectionsData?.data ?? [];
  const photos = model.photosData?.data ?? [];

  return (
    <div className="flex max-w-7xl flex-col gap-4">
      <DetailHeader
        detail={detail}
        locationPath={model.locationPath}
        actions={
          <HeaderActions
            id={itemId}
            itemName={detail.name}
            connectionsCount={connections.length}
            photosCount={model.photosData?.pagination?.total ?? photos.length}
            readOnly={detail.readOnly}
            onDelete={() => model.deleteMutation.mutate({ id: itemId })}
          />
        }
      />
      <LifecycleNotice detail={detail} />
      <DetailTabs
        detail={detail}
        connections={connections}
        connectionsLoading={model.connectionsLoading}
        photos={photos}
        photosLoading={model.photosLoading}
        history={detail.history}
        model={model}
        itemId={itemId}
      />
    </div>
  );
}

/** Renders the split item-detail page while preserving the existing route contract. */
export function ItemDetailPage() {
  const model = useItemDetailPageModel();
  if (!model.id || isNotFoundError(model.error)) return <ItemDetailProblem variant="not-found" />;
  const itemId = model.id;
  if (model.isLoading) return <ItemDetailSkeleton />;
  if (model.error) {
    return (
      <ItemDetailProblem variant="error" error={model.error} onRetry={() => void model.refetch()} />
    );
  }
  return <DetailContent model={model} itemId={itemId} />;
}
