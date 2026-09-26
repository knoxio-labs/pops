import { useState } from 'react';

import { Tabs, TabsContent } from '@pops/ui';

import { buildDetailSectionSummaries, RAIL_DEFAULT } from '../../foundation/item-page';
import { ConnectionsSection } from './connections-section';
import { DetailTabHeader, FactsRail } from './detail-tabs-parts';
import { DocumentsSection } from './documents-section';
import { HistorySection } from './history-section';
import { ProvenanceSection } from './provenance-section';

import type { ItemConnection, ItemDetailAggregate } from '../../foundation/item-page';
import type { useItemDetailPageModel } from './useItemDetailPageModel';

type DetailTab = 'facts' | 'overview' | 'connections' | 'history';
type DetailModel = ReturnType<typeof useItemDetailPageModel>;

function isDetailTab(value: string): value is DetailTab {
  return (
    value === 'facts' || value === 'overview' || value === 'connections' || value === 'history'
  );
}

function SectionHeading({ children }: { children: string }) {
  return <h2 className="flex items-center gap-2 text-sm font-semibold">{children}</h2>;
}

function OverviewTab({ detail, itemId }: { detail: ItemDetailAggregate; itemId: string }) {
  return (
    <TabsContent value="overview" forceMount className="min-h-0 space-y-6 overflow-y-auto p-4">
      <section aria-label="Provenance" className="flex flex-col gap-3">
        <SectionHeading>Provenance</SectionHeading>
        <ProvenanceSection provenance={detail.provenance} />
      </section>
      <DocumentsSection itemId={itemId} readOnly={detail.readOnly} />
    </TabsContent>
  );
}

function ConnectionsTab({
  detail,
  connections,
  connectionsLoading,
  model,
  itemId,
}: {
  detail: ItemDetailAggregate;
  connections: readonly ItemConnection[];
  connectionsLoading: boolean;
  model: DetailModel;
  itemId: string;
}) {
  return (
    <TabsContent value="connections" forceMount className="min-h-0 overflow-y-auto p-4">
      <ConnectionsSection
        itemId={itemId}
        connections={connections}
        isLoading={connectionsLoading}
        isDisconnecting={model.disconnectMutation.isPending}
        readOnly={detail.readOnly}
        onConnected={() => undefined}
        onDisconnect={(connection) => {
          model.disconnectMutation.mutate({
            itemAId: connection.itemAId,
            itemBId: connection.itemBId,
          });
        }}
      />
    </TabsContent>
  );
}

function HistoryTab({ history }: { history: ItemDetailAggregate['history'] }) {
  return (
    <TabsContent value="history" forceMount className="min-h-0 overflow-y-auto p-4">
      <section aria-label="History" className="flex flex-col gap-3">
        <SectionHeading>History</SectionHeading>
        <HistorySection events={history} />
      </section>
    </TabsContent>
  );
}

function DetailTabsContent({
  detail,
  connections,
  connectionsLoading,
  history,
  model,
  itemId,
  visibleTab,
  sectionSummaries,
  onTabChange,
}: {
  detail: ItemDetailAggregate;
  connections: readonly ItemConnection[];
  connectionsLoading: boolean;
  history: ItemDetailAggregate['history'];
  model: DetailModel;
  itemId: string;
  visibleTab: DetailTab;
  sectionSummaries: ReturnType<typeof buildDetailSectionSummaries>;
  onTabChange: (value: string) => void;
}) {
  return (
    <Tabs
      value={visibleTab}
      onValueChange={onTabChange}
      className="min-w-0 flex-1 gap-0 rounded-xl border bg-card"
    >
      <DetailTabHeader summaries={sectionSummaries} />
      <OverviewTab detail={detail} itemId={itemId} />
      <ConnectionsTab
        detail={detail}
        connections={connections}
        connectionsLoading={connectionsLoading}
        model={model}
        itemId={itemId}
      />
      <HistoryTab history={history} />
    </Tabs>
  );
}

interface DetailTabsProps {
  detail: ItemDetailAggregate;
  connections: readonly ItemConnection[];
  connectionsLoading: boolean;
  photos: ItemDetailAggregate['photos'];
  photosLoading: boolean;
  history: ItemDetailAggregate['history'];
  model: DetailModel;
  itemId: string;
}

/** Renders the facts rail and tabbed item-detail content. */
export function DetailTabs(props: DetailTabsProps) {
  const { detail, connections, connectionsLoading, photos, photosLoading, history, model, itemId } =
    props;
  const [railWidth, setRailWidth] = useState(RAIL_DEFAULT);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [hasUserSelectedTab, setHasUserSelectedTab] = useState(false);
  const connectionsCount = connections.length;
  const sectionSummaries = buildDetailSectionSummaries({
    documentCount: detail.webItemDocumentCount,
    paperless: detail.paperless,
    connectionCount: connectionsCount,
    historyCount: history.length,
    hasProvenance: detail.hasProvenance,
  });
  const visibleTab = !hasUserSelectedTab && connectionsCount > 0 ? 'connections' : activeTab;
  const handleTabChange = (value: string) => {
    if (!isDetailTab(value)) return;
    setHasUserSelectedTab(true);
    setActiveTab(value);
  };
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex min-h-0 flex-col gap-4 xl:flex-row">
        <FactsRail
          detail={detail}
          photos={photos}
          photosLoading={photosLoading}
          model={model}
          itemId={itemId}
          railWidth={railWidth}
          activeTab={visibleTab}
          onRailWidth={setRailWidth}
        />
        <DetailTabsContent
          detail={detail}
          connections={connections}
          connectionsLoading={connectionsLoading}
          history={history}
          model={model}
          itemId={itemId}
          visibleTab={visibleTab}
          sectionSummaries={sectionSummaries}
          onTabChange={handleTabChange}
        />
      </div>
    </div>
  );
}
