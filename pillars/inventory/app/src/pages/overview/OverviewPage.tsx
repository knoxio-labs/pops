import { LayoutDashboard } from 'lucide-react';

import { Skeleton } from '@pops/ui';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { LoadError } from '../../foundation/frame/load-error.js';
import { NewItemButton } from '../../foundation/frame/new-item-button.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { FirstRunCard } from './first-run.js';
import { MovingDayStrip } from './moving-day-strip.js';
import { type OverviewPageModel, useOverviewPageModel } from './overview-page-model.js';
import { InHandPanel, OpenContainersPanel } from './overview-panels.js';
import { RecentWorkPanel } from './recent-work-panel.js';
import { StatTiles } from './stat-tiles.js';

import type { ReactElement } from 'react';

import type { PanelContext } from './overview-panel-types.js';

function LoadingBody(): ReactElement {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3"
      aria-busy="true"
      aria-label="Loading overview"
    >
      <div className="grid grid-cols-3 gap-3">
        {['a', 'b', 'c'].map((key) => (
          <Skeleton key={key} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 gap-3 md:max-xl:grid-cols-2 md:max-xl:grid-rows-2 xl:grid-cols-3 xl:grid-rows-1">
        {['a', 'b', 'c'].map((key) => (
          <Skeleton key={key} className="h-full min-h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function Panels({ model }: { model: OverviewPageModel }): ReactElement {
  const data = model.summary.data;
  if (data === undefined) return <LoadingBody />;
  const context: PanelContext = {
    world: model.world,
    disabledReason: model.online ? undefined : OFFLINE_REASON,
    onNavigate: model.navigate,
  };
  return (
    <>
      <StatTiles counts={data.counts} onNavigate={model.navigate} />
      {data.moving.closed > 0 ? (
        <MovingDayStrip
          progress={data.moving}
          onOpen={() => void model.navigate('/inventory/moving-day')}
        />
      ) : null}
      <div className="grid min-h-0 flex-1 gap-3 md:max-xl:grid-cols-2 md:max-xl:grid-rows-2 xl:grid-cols-3 xl:grid-rows-1">
        <OpenContainersPanel
          rows={model.openContainers.rows}
          total={model.openContainers.total ?? model.openContainers.rows.length}
          contentCounts={model.openContainers.contentCounts}
          rejections={model.rejections}
          pendingIds={model.pendingIds}
          ctx={context}
          onClose={(item) => void model.close(item)}
        />
        <InHandPanel
          items={model.inHand.rows}
          total={model.inHand.total ?? model.inHand.rows.length}
          rejections={model.rejections}
          pendingIds={model.pendingIds}
          ctx={context}
          onPutBack={(item) => void model.put(item)}
          onMove={model.openMove}
        />
        <RecentWorkPanel
          events={model.events}
          now={model.now}
          disabledReason={model.online ? undefined : context.disabledReason}
          onNavigate={model.navigate}
          onUndo={model.undo}
          className="md:max-xl:col-span-2"
        />
      </div>
    </>
  );
}

function OverviewBody({ model }: { model: OverviewPageModel }): ReactElement {
  if (model.body === 'loading') return <LoadingBody />;
  if (model.body === 'error') {
    return (
      <LoadError
        title="The overview did not load"
        detail="The inventory service did not answer. Nothing was changed."
        onRetry={() => {
          model.retry();
        }}
      />
    );
  }
  if (model.body === 'first-run') return <FirstRunCard onNavigate={model.navigate} />;
  return <Panels model={model} />;
}

/** Renders the inventory Overview page and its stateful work panels. */
export function OverviewPage(): ReactElement {
  const model = useOverviewPageModel();
  return (
    <InventoryPage
      title="Overview"
      icon={LayoutDashboard}
      actions={<NewItemButton offline={!model.online} onNavigate={model.navigate} />}
      banner={model.banner}
      bodyClassName="gap-3"
      overlay={model.overlay}
    >
      <OverviewBody model={model} />
    </InventoryPage>
  );
}
