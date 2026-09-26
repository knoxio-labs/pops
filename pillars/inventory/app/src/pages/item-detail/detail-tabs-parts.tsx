import { TabsList, TabsTrigger } from '@pops/ui';

import { FactsSection } from './facts-section';
import { PhotosSection } from './photos-section';
import { RailSplitter } from './rail-splitter';

import type {
  DetailPhoto,
  DetailSectionSummary,
  ItemDetailAggregate,
} from '../../foundation/item-page';
import type { useItemDetailPageModel } from './useItemDetailPageModel';

type DetailTab = 'facts' | 'overview' | 'connections' | 'history';
type DetailModel = ReturnType<typeof useItemDetailPageModel>;

function TabLabel({
  label,
  count,
  summary,
}: {
  label: string;
  count: number | null;
  summary: string;
}) {
  return (
    <span title={summary}>
      {label}
      {count !== null ? (
        <span className="ml-1 text-xs tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </span>
  );
}

function summaryFor(
  summaries: readonly DetailSectionSummary[],
  id: 'connections' | 'history'
): DetailSectionSummary | undefined {
  return summaries.find((summary) => summary.id === id);
}

/** Renders the resizable facts rail alongside the item tabs. */
export function FactsRail({
  detail,
  photos,
  photosLoading,
  model,
  itemId,
  railWidth,
  activeTab,
  onRailWidth,
}: {
  detail: ItemDetailAggregate;
  photos: readonly DetailPhoto[];
  photosLoading: boolean;
  model: DetailModel;
  itemId: string;
  railWidth: number;
  activeTab: DetailTab;
  onRailWidth: (width: number) => void;
}) {
  return (
    <>
      <aside
        aria-label="Facts"
        className={`${activeTab === 'facts' ? 'flex' : 'hidden'} w-full shrink-0 flex-col gap-4 rounded-xl border bg-card p-4 xl:flex xl:w-auto`}
        style={activeTab === 'facts' ? undefined : { width: railWidth }}
      >
        <PhotosSection
          photos={photos}
          isLoading={photosLoading}
          isReordering={model.reorderPhotosMutation.isPending}
          readOnly={detail.readOnly}
          onReorder={(orderedIds) => model.reorderPhotosMutation.mutate({ itemId, orderedIds })}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FactsSection facts={detail.facts} readOnly={detail.readOnly} />
        </div>
      </aside>
      <RailSplitter width={railWidth} onWidth={onRailWidth} />
    </>
  );
}

/** Renders the tab labels and their section counts. */
export function DetailTabHeader({ summaries }: { summaries: readonly DetailSectionSummary[] }) {
  const connections = summaryFor(summaries, 'connections');
  const history = summaryFor(summaries, 'history');
  return (
    <TabsList variant="line" className="w-full shrink-0 justify-start border-b px-2">
      <TabsTrigger value="facts" className="xl:hidden">
        Facts
      </TabsTrigger>
      <TabsTrigger value="overview">
        <TabLabel label="Overview" count={null} summary="Purchase details and documents" />
      </TabsTrigger>
      <TabsTrigger value="connections">
        <TabLabel
          label="Connections"
          count={connections?.count ?? 0}
          summary={connections?.summary ?? 'Connections'}
        />
      </TabsTrigger>
      <TabsTrigger value="history">
        <TabLabel
          label="History"
          count={history?.count ?? 0}
          summary={history?.summary ?? 'History'}
        />
      </TabsTrigger>
    </TabsList>
  );
}
