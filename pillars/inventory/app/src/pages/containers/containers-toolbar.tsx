import { Segmented } from '../../foundation/frame/segmented.js';
import { ItemsSummary } from '../../foundation/list-page/items-summary.js';
import { ItemsToolbar } from '../../foundation/list-page/items-toolbar.js';
import {
  filterChips,
  isNarrowed,
  placeFilterOptions,
  typeFilterOptions,
} from '../../foundation/list-page/list-filters.js';
import { OfflineBanner } from '../../foundation/list-page/list-states.js';
import { containersSearch } from '../../inventory-web/items-url-filters.js';
import { containerSegmentOptions } from './containers-model.js';
import { ContainersPackingStrip } from './containers-packing-strip.js';

import type { ReactElement } from 'react';

import type { WebSummaryGetResponse } from '../../inventory-api/types.gen.js';
import type { ContainersPageModel } from './containers-page-model.js';

function hasAnyContainer(summary: WebSummaryGetResponse): boolean {
  return summary.containerSegments.all + summary.containerSegments.retired > 0;
}

function showToolbar(model: ContainersPageModel): boolean {
  return (
    model.itemRows.status === 'success' &&
    model.summary.status === 'success' &&
    model.summary.data !== undefined &&
    (hasAnyContainer(model.summary.data) || isNarrowed(model.filters.filters))
  );
}

/** Renders the filter toolbar, state segments, and server-backed summary. */
export function ContainersToolbar({ model }: { model: ContainersPageModel }): ReactElement | null {
  if (!showToolbar(model) || model.summary.data === undefined) return null;
  const types = typeFilterOptions(
    model.typeOptions.filter((type) => type.capabilities.includes('containment'))
  );
  const places = placeFilterOptions(model.placeOptions, []);
  return (
    <div className="shrink-0 space-y-2">
      <ItemsToolbar
        filters={model.filters.filters}
        types={types}
        places={places}
        onFilters={model.filters.setFilters}
        onClear={model.filters.clearFilters}
        placeholder="Filter by name or code"
        scope="containers"
      >
        <Segmented
          label="Show"
          segments={containerSegmentOptions(model.summary.data.containerSegments)}
          value={model.filters.filters.segment}
          onChange={(segment) => model.filters.setFilters({ segment })}
        />
      </ItemsToolbar>
      <ItemsSummary
        shown={model.itemRows.total ?? 0}
        total={model.itemRows.unfilteredTotal ?? 0}
        hiddenInactive={model.itemRows.hiddenInactiveCount ?? 0}
        noun="containers"
        chips={filterChips(model.filters.filters, types, places, model.filters.setFilters)}
        href={`/inventory/containers${containersSearch(model.filters.filters)}`}
      />
    </div>
  );
}

/** Renders the offline notice and moving-day packing strip. */
export function ContainersBanner({ model }: { model: ContainersPageModel }): ReactElement | null {
  const strip =
    model.online &&
    model.filters.filters.segment === 'moving' &&
    model.summary.data !== undefined ? (
      <ContainersPackingStrip
        progress={model.summary.data.packing}
        printing={model.printing}
        onPrint={() => void model.printClosed()}
      />
    ) : null;
  if (model.online && strip === null) return null;
  return (
    <>
      {!model.online ? <OfflineBanner /> : null}
      {strip}
    </>
  );
}
