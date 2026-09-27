import { Button } from '@pops/ui';

import {
  changedBy,
  changedCount,
  staleTitle,
} from '../../foundation/feedback/changed-elsewhere-copy.js';
import { OFFLINE_TITLE, StateBanner } from '../../foundation/feedback/state-banner.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { SelectionBar } from '../../foundation/selection/selection-bar.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';
import { ShortcutHint } from '../../foundation/shortcuts/shortcut-hint.js';
import { InHandPageBody } from './in-hand-page-body.js';

import type { ReactElement } from 'react';

import type { SelectionBarAction } from '../../foundation/model/contracts.js';
import type { ItemRowModel } from '../../foundation/model/model.js';
import type { InHandPageActions } from './in-hand-page-actions.js';
import type { InHandPageData } from './in-hand-page-model.js';

function PutBackAllButton({
  data,
  actions,
}: {
  data: InHandPageData;
  actions: InHandPageActions;
}): ReactElement {
  const reason = data.disabledReason ?? data.plan.disabledReason ?? undefined;
  return (
    <HintTooltip label={data.plan.label} disabledReason={reason}>
      <Button
        aria-disabled={reason !== undefined || undefined}
        className={reason === undefined ? undefined : 'opacity-50'}
        onClick={
          reason === undefined
            ? () => actions.putBackAll(data.plan.returnable.map((item: ItemRowModel) => item.id))
            : undefined
        }
        prefix={<INVENTORY_ICONS.putBack className="size-4" aria-hidden />}
      >
        {data.plan.label}
      </Button>
    </HintTooltip>
  );
}

function HeaderActions({
  data,
  actions,
}: {
  data: InHandPageData;
  actions: InHandPageActions;
}): ReactElement | null {
  if (data.body !== 'list' || data.items.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="hidden items-center gap-1 text-xs text-muted-foreground xl:inline-flex">
        <ShortcutHint id="put-back" /> puts back the focused row
      </span>
      <PutBackAllButton data={data} actions={actions} />
    </div>
  );
}

function PageBanner({ data }: { data: InHandPageData }): ReactElement | null {
  if (!data.online) {
    return (
      <StateBanner
        kind="offline"
        title={OFFLINE_TITLE}
        detail="Put back and Move are off until the connection is back."
        actionLabel="Retry"
        onAction={data.itemRows.refetch}
      />
    );
  }
  if (!data.changed.stale) return null;
  return (
    <StateBanner
      kind="stale"
      title={staleTitle(null, data.changed.groups, new Date().toISOString())}
      detail={`${changedBy(data.changed.groups)} changed ${changedCount(data.changed.groups)} things. Reload to see them; your selection stays until you do.`}
      actionLabel="Reload"
      onAction={() => void data.changed.reload()}
    />
  );
}

function SelectionDock({
  data,
  actions,
  selectionActions,
}: {
  data: InHandPageData;
  actions: InHandPageActions;
  selectionActions: readonly SelectionBarAction[];
}): ReactElement {
  return (
    <div className="relative">
      {actions.pickerAnchor === 'dock' ? actions.picker : null}
      <SelectionBar
        count={data.selection.count}
        loadedCount={data.items.length}
        coverage={data.selection.coverage}
        actions={selectionActions}
        onSelectAll={data.selection.onHeaderToggle}
        onClear={data.selection.clearSelection}
      />
    </div>
  );
}

/** Props for the rendered in-hand page frame. */
export interface InHandPageViewProps {
  data: InHandPageData;
  actions: InHandPageActions;
  selectionActions: readonly SelectionBarAction[];
}

/** Renders the in-hand page frame, banners, list body, and selection dock. */
export function InHandPageView({
  data,
  actions,
  selectionActions,
}: InHandPageViewProps): ReactElement {
  return (
    <InventoryPage
      title="In hand"
      icon={INVENTORY_ICONS.inHand}
      actions={<HeaderActions data={data} actions={actions} />}
      banner={<PageBanner data={data} />}
      bodyClassName="gap-3"
      dock={<SelectionDock data={data} actions={actions} selectionActions={selectionActions} />}
    >
      <InHandPageBody data={data} actions={actions} />
    </InventoryPage>
  );
}
