import { unwrap } from '../../inventory-api-helpers.js';
import { webList } from '../../inventory-api/index.js';
import { MAX_LABEL_IDS } from './label-params.js';

import type { WebListData } from '../../inventory-api/types.gen.js';
import type { WebItem } from './label-item';

type LabelItemQuery = Pick<
  WebListData['query'],
  'ids' | 'containingItemId' | 'within' | 'includeInactive'
>;

/** Reads every page of the selected items, direct contents, or contained descendants. */
export async function listLabelItems(query: LabelItemQuery): Promise<WebItem[]> {
  const items: WebItem[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = unwrap(
      await webList({
        query: { ...query, limit: MAX_LABEL_IDS, ...(cursor === undefined ? {} : { cursor }) },
      })
    );
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
    if (cursor !== undefined) {
      if (seenCursors.has(cursor)) throw new Error('Inventory returned a repeated page cursor');
      seenCursors.add(cursor);
    }
  } while (cursor !== undefined);

  return items;
}
