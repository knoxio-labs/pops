import { useQueries } from '@tanstack/react-query';

import { WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { compareInventoryNames } from '../../lib/sort-names.js';
import { labelReadState } from './label-read-state';
import { listLabelItems } from './label-subject-reads';

import type { WebItem } from './label-item';

/** Reads each box independently, preserving per-box failures and background refresh state. */
export function useLabelItemReads(items: readonly WebItem[], relation: 'contents' | 'descendants') {
  const boxes = items.filter((item) => item.isContainer);
  const results = useQueries({
    queries: boxes.map((box) => ({
      queryKey: [...WEB_ITEMS_QUERY_KEY, `label-${relation}`, box.id] as const,
      queryFn: () =>
        listLabelItems(
          relation === 'contents'
            ? { containingItemId: box.id }
            : { within: box.id, includeInactive: true }
        ),
    })),
  });
  return {
    items: new Map(
      boxes.map((box, index) => [
        box.id,
        (results[index]?.data ?? [])
          .filter((item) => item.id !== box.id)
          .toSorted(compareInventoryNames),
      ])
    ),
    reads: new Map(
      boxes.map((box, index) => {
        const result = results[index];
        return [
          box.id,
          labelReadState(result?.isPending === true || result?.isFetching === true, result?.error),
        ];
      })
    ),
  };
}
