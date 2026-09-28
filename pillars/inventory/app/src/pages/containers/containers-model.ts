import { effectiveCapabilities } from '../../lib/type-tree.js';

import type { Segment } from '../../foundation/frame/segmented.js';
import type { WebSummaryGetResponse } from '../../inventory-api/types.gen.js';
import type { ContainerSegment } from '../../inventory-web/items-url-filters.js';
import type { CatalogueType } from '../../inventory-web/useCatalogueLookups.js';

/** The segment controls shown by the Containers page. */
export function containerSegmentOptions(
  counts: WebSummaryGetResponse['containerSegments'] | null
): readonly Segment<ContainerSegment>[] {
  return [
    { id: 'all', label: 'All', count: counts?.all },
    { id: 'open', label: 'Open', count: counts?.open },
    { id: 'closed', label: 'Closed', count: counts?.closed },
    { id: 'full', label: 'Full', count: counts?.full },
    { id: 'moving', label: 'Moving day' },
    { id: 'retired', label: 'Retired', count: counts?.retired },
  ];
}

/** Returns the first active published type that can contain other items. */
export function containerTypeKey(types: readonly CatalogueType[]): string | null {
  return (
    types
      .filter(
        (type) =>
          type.archivedAt === null && effectiveCapabilities(types, type.id).includes('containment')
      )
      .toSorted((left, right) => left.sortOrder - right.sortOrder)[0]?.key ?? null
  );
}
