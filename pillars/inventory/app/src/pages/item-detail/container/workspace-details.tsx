import { EmptyLine } from '../../../foundation/item-page/section-parts.js';
import { INVENTORY_ICONS } from '../../../foundation/model/icons.js';
import { ConnectionsSection } from '../connections-section.js';
import { FactsSection } from '../facts-section.js';
import { HistoryPreviewSection } from '../history-preview-section.js';
import { ProvenanceSection, provenanceSummary } from '../provenance-section.js';
import { SectionStack } from '../section-stack.js';

import type { ReactElement } from 'react';

import type { ItemDetailModel } from '../detail-model.js';
import type { SectionSpec } from '../section-stack.js';

const EMPTY_PROVENANCE = {
  purchasedOn: null,
  pricePaid: null,
  merchant: null,
  warrantyUntil: null,
  purchase: null,
} as const;

function connectionsSummary(model: ItemDetailModel): string {
  if (model.connections === null) return 'Connections are loading';
  if (model.connections.length === 0) return 'Not connected to anything';
  return `${model.connections.length} connection${model.connections.length === 1 ? '' : 's'}`;
}

function historySummary(model: ItemDetailModel): string {
  if (model.eventCount === null) return 'History is loading';
  if (model.eventCount === 0) return 'Nothing recorded yet';
  return `${model.eventCount} event${model.eventCount === 1 ? '' : 's'}`;
}

/** Builds the folded detail sections shown beside a container's contents. */
export function containerSectionSpecs(
  itemId: string,
  model: ItemDetailModel,
  readOnly: boolean,
  onLinksChanged: () => void
): SectionSpec[] {
  const provenance = model.aggregate?.provenance ?? EMPTY_PROVENANCE;
  return [
    {
      id: 'connections',
      title: 'Connections',
      icon: INVENTORY_ICONS.connection,
      count: model.connections?.length ?? null,
      summary: connectionsSummary(model),
      flagged: model.connections === null,
      body: (
        <ConnectionsSection
          itemId={itemId}
          model={model}
          readOnly={readOnly}
          onLinksChanged={onLinksChanged}
        />
      ),
    },
    {
      id: 'provenance',
      title: 'Provenance',
      icon: INVENTORY_ICONS.computed,
      count: null,
      summary:
        model.aggregate === null ? 'Purchase details are loading' : provenanceSummary(provenance),
      flagged: model.aggregate === null,
      body: <ProvenanceSection provenance={provenance} />,
    },
    {
      id: 'history',
      title: 'History',
      icon: INVENTORY_ICONS.history,
      count: model.eventCount,
      summary: historySummary(model),
      flagged: model.eventCount === null,
      body: (
        <HistoryPreviewSection
          itemId={itemId}
          eventCount={model.eventCount}
          events={model.events}
        />
      ),
    },
  ];
}

/** Renders facts and the folded detail sections for the container workspace. */
export function ContainerDetails({
  model,
  sections,
  readOnly,
}: {
  model: ItemDetailModel;
  sections: readonly SectionSpec[];
  readOnly: boolean;
}): ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="@container shrink-0 rounded-xl border bg-card p-3">
        {model.aggregate === null ? (
          <EmptyLine icon={INVENTORY_ICONS.computed} text="Facts are loading." />
        ) : (
          <FactsSection
            facts={model.aggregate.facts}
            typeName={model.item.typeName ?? model.aggregate.type?.label ?? null}
            layout="list"
            readOnly={readOnly}
          />
        )}
      </div>
      <SectionStack sections={sections} />
    </div>
  );
}
