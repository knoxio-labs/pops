import { TabsContent } from '@pops/ui';

import { HistoryPreviewSection } from './history-preview-section';
import { ConnectionsTabSection, OverviewSections } from './sections';

import type { ReactElement } from 'react';

import type { ItemDetailModel } from './detail-model';

/** Renders the detail tab panes without owning the tab selection state. */
export function TabPanels({
  itemId,
  model,
  factsRail,
  readOnly,
  onLinksChanged,
}: {
  itemId: string;
  model: ItemDetailModel;
  factsRail: ReactElement;
  readOnly: boolean;
  onLinksChanged: () => void;
}): ReactElement {
  return (
    <>
      <TabsContent value="facts" className="min-h-0 overflow-y-auto p-4 @2xl:hidden">
        {factsRail}
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
        <HistoryPreviewSection
          itemId={itemId}
          eventCount={model.eventCount}
          events={model.events}
        />
      </TabsContent>
    </>
  );
}
