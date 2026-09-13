import { useMemo, useState } from 'react';

import { itemCountByLocationId } from './locations-page-types';
import { buildNodeMap } from './utils';

import type { LocationsPageData } from './locations-page-types';
import type { LocationTreeNode } from './utils';

/** The tree itself, plus the lookups every other hook in this screen reads from it. */
export function useLocationTreeData(data: LocationsPageData) {
  const [tree, setTree] = useState<LocationTreeNode[]>(data.tree);
  const nodeMap = useMemo(() => {
    const map = new Map<string, LocationTreeNode>();
    buildNodeMap(tree, map);
    return map;
  }, [tree]);
  const itemCounts = useMemo(() => itemCountByLocationId(data.items), [data.items]);
  return { tree, setTree, nodeMap, itemCounts };
}
