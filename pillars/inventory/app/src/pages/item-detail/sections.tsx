import { Receipt } from 'lucide-react';

import { PaneLabel } from '../../foundation/item-page/section-parts';
import { ConnectionsSection } from './connections-section';
import { DocumentsSection } from './documents-section';
import { HistoryPreviewSection } from './history-preview-section';
import { ProvenanceSection } from './provenance-section';

import type { ReactElement } from 'react';

import type { ItemDetailModel } from './detail-model';

/** Renders the Overview tab's purchase, documents, and history sections. */
export function OverviewSections({
  itemId,
  model,
  readOnly,
  onLinksChanged,
}: {
  itemId: string;
  model: ItemDetailModel;
  readOnly: boolean;
  onLinksChanged: () => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Provenance" className="flex flex-col gap-3">
        <PaneLabel>
          <span className="inline-flex items-center gap-2">
            <Receipt className="size-4" aria-hidden />
            Provenance
          </span>
        </PaneLabel>
        <ProvenanceSection provenance={model.aggregate?.provenance ?? emptyProvenance()} />
      </section>
      <DocumentsSection
        itemId={itemId}
        model={model}
        readOnly={readOnly}
        onLinksChanged={onLinksChanged}
      />
      <HistoryPreviewSection itemId={itemId} eventCount={model.eventCount} events={model.events} />
    </div>
  );
}

/** Renders the Connections tab content. */
export function ConnectionsTabSection({
  itemId,
  model,
  readOnly,
  onLinksChanged,
}: {
  itemId: string;
  model: ItemDetailModel;
  readOnly: boolean;
  onLinksChanged: () => void;
}): ReactElement {
  return (
    <ConnectionsSection
      itemId={itemId}
      model={model}
      readOnly={readOnly}
      onLinksChanged={onLinksChanged}
    />
  );
}

function emptyProvenance() {
  return {
    purchasedOn: null,
    pricePaid: null,
    merchant: null,
    warrantyUntil: null,
    purchase: null,
  } as const;
}
