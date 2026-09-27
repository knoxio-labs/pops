import { MAX_LABEL_IDS } from '../labels-page/label-params.js';

import type { Segment } from '../../foundation/frame/segmented.js';
import type { ItemRowModel } from '../../foundation/model/model.js';
import type { WebSummaryGetResponse } from '../../inventory-api/types.gen.js';
import type { ContainerSegment } from '../../inventory-web/items-url-filters.js';

/** The segment controls shown by the Containers page. */
export function containerSegmentOptions(
  counts: WebSummaryGetResponse['containerSegments']
): readonly Segment<ContainerSegment>[] {
  return [
    { id: 'all', label: 'All', count: counts.all },
    { id: 'open', label: 'Open', count: counts.open },
    { id: 'closed', label: 'Closed', count: counts.closed },
    { id: 'full', label: 'Full', count: counts.full },
    { id: 'moving', label: 'Moving day', count: counts.moving },
    { id: 'retired', label: 'Retired', count: counts.retired },
  ];
}

/** Returns at most the label route's supported number of closed container ids. */
export function printableContainerIds(rows: readonly ItemRowModel[]): string[] {
  return rows
    .filter((row) => row.lifecycle === 'active' && row.container?.access === 'closed')
    .map((row) => row.id)
    .slice(0, MAX_LABEL_IDS);
}
