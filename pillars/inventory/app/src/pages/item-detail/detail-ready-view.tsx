import { DetailDialogs } from './detail-dialogs';
import { DetailHeader } from './detail-header';
import { DetailStateBanner } from './detail-state-banner';
import { DetailStoreHereSheet } from './detail-store-here';
import { HeaderActions } from './header-actions';
import { ItemDetailView } from './item-detail-view';

import type { ReactElement } from 'react';

import type { ItemDetailModel } from './detail-model';
import type { DetailReadyState } from './use-detail-ready-state';
import type { ItemDetailBannerState } from './use-item-detail-state';

function ReadyHeader({
  model,
  ready,
}: {
  model: ItemDetailModel;
  ready: DetailReadyState;
}): ReactElement {
  return (
    <DetailHeader
      item={model.item}
      world={model.world}
      position={ready.position}
      onPrevious={() => ready.onTrailItem(ready.position?.previousId ?? null)}
      onNext={() => ready.onTrailItem(ready.position?.nextId ?? null)}
      actions={
        <HeaderActions
          itemId={model.item.id}
          verbs={ready.actions.verbs}
          world={ready.placement.world}
          recents={ready.placement.recents}
          pickerOpen={ready.actions.pickerOpen}
          onPickerOpenChange={ready.actions.setPickerOpen}
          onVerb={ready.actions.onVerb}
          onMenu={ready.actions.onMenu}
          onPick={ready.actions.onPick}
          onCreatePlace={ready.createPlace}
        />
      }
    />
  );
}

function ReadyContent({
  itemId,
  model,
  ready,
  offline,
  banner,
  onRetry,
}: {
  itemId: string;
  model: ItemDetailModel;
  ready: DetailReadyState;
  offline: boolean;
  banner: ItemDetailBannerState | null;
  onRetry: () => void;
}): ReactElement {
  return (
    <>
      {banner ? <DetailStateBanner state={banner} onRetry={onRetry} /> : null}
      {ready.actions.refusal ? (
        <p role="alert" className="text-sm text-destructive">
          Not saved. {ready.actions.refusal}
        </p>
      ) : null}
      <ItemDetailView
        itemId={itemId}
        model={model}
        tab={ready.tab}
        readOnly={ready.readOnly}
        onTab={ready.onTab}
        onLinksChanged={ready.onLinksChanged}
        editing={ready.readOnly ? undefined : ready.editing}
        onQuantity={ready.readOnly ? undefined : ready.onQuantity}
      />
      <DetailDialogs
        item={model.item}
        world={model.world}
        open={ready.actions.dialog}
        onClose={() => ready.actions.setDialog(null)}
        onDone={ready.actions.onDone}
      />
      {ready.storeTarget ? (
        <DetailStoreHereSheet
          key={`${model.item.id}-${ready.actions.storeHereOpen ? 'open' : 'closed'}`}
          open={ready.actions.storeHereOpen}
          onOpenChange={ready.actions.setStoreHereOpen}
          target={ready.storeTarget}
          offline={offline}
        />
      ) : null}
    </>
  );
}

/** Renders the loaded item-detail header, content, dialogs, and live sheets. */
export function DetailReadyView({
  itemId,
  model,
  ready,
  offline,
  banner,
  onRetry,
}: {
  itemId: string;
  model: ItemDetailModel;
  ready: DetailReadyState;
  offline: boolean;
  banner: ItemDetailBannerState | null;
  onRetry: () => void;
}): ReactElement {
  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
      <ReadyHeader model={model} ready={ready} />
      <ReadyContent
        itemId={itemId}
        model={model}
        ready={ready}
        offline={offline}
        banner={banner}
        onRetry={onRetry}
      />
    </div>
  );
}
