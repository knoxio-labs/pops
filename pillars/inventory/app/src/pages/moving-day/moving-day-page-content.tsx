import { PlacementPicker } from '../../foundation/placement-picker/placement-picker.js';
import { MovingDayBoard, MovingDaySummary, MovingDayToolbar } from './moving-day-board.js';
import { MovingDayPanel } from './moving-day-panel.js';
import {
  MovingDayDone,
  MovingDayEmpty,
  MovingDayError,
  MovingDayLoading,
} from './moving-day-states.js';

import type { ReactElement } from 'react';

import type { MovingDayPageModel } from './moving-day-page-model.js';

/** Renders the moving-day aggregate's loading, error, first-run, done, or board body. */
export function MovingDayBody({ model }: { readonly model: MovingDayPageModel }): ReactElement {
  if (model.body === 'loading') return <MovingDayLoading />;
  if (model.body === 'error' || model.data === undefined) {
    return <MovingDayError onRetry={model.retry} />;
  }
  if (model.body === 'empty') {
    return (
      <MovingDayEmpty
        looseCount={model.data.looseCount + model.data.inHand.length}
        offline={!model.online}
        onNewBox={model.newBox}
      />
    );
  }
  if (model.body === 'done') {
    return <MovingDayDone data={model.data} onPrintLabels={model.printLabels} />;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <MovingDaySummary summary={model.data} onPrintLabels={model.printLabels} />
      <MovingDayToolbar
        data={model.data}
        view={model.view}
        query={model.query}
        onViewChange={model.setView}
        onQueryChange={model.setQuery}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <MovingDayBoard
          data={model.data}
          world={model.placement.world}
          view={model.view}
          query={model.query}
          selectedId={model.openBoxId}
          pendingIds={model.actions.pendingIds}
          disabledReason={model.disabledReason}
          rejections={model.actions.rejections}
          onAction={model.actions.onBoxAction}
          onOpenBox={model.setOpenBoxId}
          onPack={model.setPackingIds}
          onClearSearch={() => model.setQuery('')}
        />
      </div>
    </div>
  );
}

/** Renders the selected-box sheet and the shared placement picker overlay. */
export function MovingDayOverlay({ model }: { readonly model: MovingDayPageModel }): ReactElement {
  const data = model.data;
  const openBox = model.openBox;
  return (
    <>
      {openBox !== null && data !== undefined ? (
        <MovingDayPanel
          data={data}
          world={model.placement.world}
          box={openBox}
          pendingIds={model.actions.pendingIds}
          disabledReason={model.disabledReason}
          rejections={model.actions.rejections}
          onAction={model.actions.onBoxAction}
          onPutIn={(ids) =>
            model.actions.onPack(ids, { kind: 'container', containerId: openBox.id })
          }
          onClose={() => model.setOpenBoxId(null)}
        />
      ) : null}
      {model.packingIds.length > 0 ? (
        <PlacementPicker
          world={model.placement.world}
          subject={{ kind: 'items', ids: model.packingIds }}
          recents={model.recents}
          open
          onOpenChange={(open) => {
            if (!open) model.setPackingIds([]);
          }}
          onPick={(target) => {
            model.actions.onPack(model.packingIds, target);
            model.setPackingIds([]);
          }}
          onCreatePlace={
            model.online
              ? (name, parentId) => model.placement.createLocation.mutate({ name, parentId })
              : undefined
          }
          trigger={<span aria-hidden className="fixed bottom-28 left-1/3 size-px" />}
        />
      ) : null}
    </>
  );
}
