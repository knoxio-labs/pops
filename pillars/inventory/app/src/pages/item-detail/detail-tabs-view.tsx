import { cn, Tabs, TabsContent, TabsList, TabsTrigger } from '@pops/ui';

import { EmptyLine } from '../../foundation/item-page/section-parts';
import { INVENTORY_ICONS } from '../../foundation/model/icons';
import { ShortcutHint } from '../../foundation/shortcuts/shortcut-hint';
import { FactsSection } from './facts-section';
import { HistoryPreviewSection } from './history-preview-section';
import { PhotosSection } from './photos-section';
import { ConnectionsTabSection, OverviewSections } from './sections';

import type { ReactElement } from 'react';

import type { DetailTab, ItemDetailModel } from './detail-model';

function TabLabel({
  label,
  shortcutId,
  count,
}: {
  label: string;
  shortcutId?: string;
  count: number | null;
}): ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {count !== null ? <span className="tabular-nums text-muted-foreground">{count}</span> : null}
      {shortcutId ? <ShortcutHint id={shortcutId} className="hidden @md:inline-flex" /> : null}
    </span>
  );
}

/** Renders the facts/photo rail in its desktop or folded tablet presentation. */
export function FactsRail({
  model,
  readOnly,
  onSetType,
  mobile = false,
}: {
  model: ItemDetailModel;
  readOnly: boolean;
  onSetType: () => void;
  mobile?: boolean;
}): ReactElement {
  const disabledReason = readOnly ? 'Nothing can change on this item.' : undefined;
  const aggregate = model.aggregate;
  return (
    <aside
      aria-label="Facts rail"
      className={cn(
        'min-h-0 shrink-0 flex-col gap-4 overflow-y-auto rounded-xl border bg-card p-4',
        mobile ? 'flex @2xl:hidden' : 'hidden @2xl:flex'
      )}
      style={{ width: 'var(--rail-width)' }}
    >
      <PhotosSection
        itemId={model.item.id}
        itemName={model.item.name}
        photos={aggregate?.photos ?? []}
        disabledReason={disabledReason}
      />
      {aggregate === null ? (
        <EmptyLine icon={INVENTORY_ICONS.computed} text="Facts are loading." />
      ) : (
        <FactsSection
          facts={aggregate.facts}
          typeName={aggregate.type?.label ?? model.item.typeName}
          readOnly={readOnly}
          onSetType={onSetType}
        />
      )}
    </aside>
  );
}

function isDetailTab(value: string): value is DetailTab {
  return (
    value === 'facts' || value === 'overview' || value === 'connections' || value === 'history'
  );
}

function TabBar({ model }: { model: ItemDetailModel }): ReactElement {
  return (
    <TabsList variant="line" className="w-full shrink-0 justify-start border-b px-2">
      <TabsTrigger value="facts" className="@2xl:hidden">
        <TabLabel label="Facts" count={null} />
      </TabsTrigger>
      <TabsTrigger value="overview">
        <TabLabel label="Overview" shortcutId="detail-tab-1" count={null} />
      </TabsTrigger>
      <TabsTrigger value="connections">
        <TabLabel
          label="Connections"
          shortcutId="detail-tab-2"
          count={model.connections?.length ?? null}
        />
      </TabsTrigger>
      <TabsTrigger value="history">
        <TabLabel label="History" shortcutId="detail-tab-3" count={model.eventCount} />
      </TabsTrigger>
    </TabsList>
  );
}

function TabPanels({
  itemId,
  model,
  readOnly,
  onSetType,
  onLinksChanged,
}: {
  itemId: string;
  model: ItemDetailModel;
  readOnly: boolean;
  onSetType: () => void;
  onLinksChanged: () => void;
}): ReactElement {
  return (
    <>
      <TabsContent value="facts" className="min-h-0 overflow-y-auto p-4 @2xl:hidden">
        <FactsRail model={model} readOnly={readOnly} onSetType={onSetType} mobile />
      </TabsContent>
      <TabsContent value="overview" className="min-h-0 flex-1 overflow-y-auto p-4">
        <OverviewSections
          itemId={itemId}
          model={model}
          readOnly={readOnly}
          onLinksChanged={onLinksChanged}
        />
      </TabsContent>
      <TabsContent value="connections" className="min-h-0 flex-1 overflow-y-auto p-4">
        <ConnectionsTabSection
          itemId={itemId}
          model={model}
          readOnly={readOnly}
          onLinksChanged={onLinksChanged}
        />
      </TabsContent>
      <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto p-4">
        <HistoryPreviewSection itemId={itemId} eventCount={model.eventCount} />
      </TabsContent>
    </>
  );
}

/** Renders the URL-backed detail tabs and their independent section panes. */
export function DetailTabs({
  itemId,
  model,
  tab,
  readOnly,
  onSetType,
  onTab,
  onLinksChanged,
}: {
  itemId: string;
  model: ItemDetailModel;
  tab: DetailTab;
  readOnly: boolean;
  onSetType: () => void;
  onTab: (tab: DetailTab) => void;
  onLinksChanged: () => void;
}): ReactElement {
  const tabValue = tab === 'facts' ? 'facts' : tab;
  return (
    <Tabs
      value={tabValue}
      onValueChange={(value) => {
        if (isDetailTab(value)) onTab(value);
      }}
      className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 rounded-xl border bg-card"
    >
      <TabBar model={model} />
      <TabPanels
        itemId={itemId}
        model={model}
        readOnly={readOnly}
        onSetType={onSetType}
        onLinksChanged={onLinksChanged}
      />
    </Tabs>
  );
}
