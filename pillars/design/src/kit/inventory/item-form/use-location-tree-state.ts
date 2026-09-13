import { useCallback, useState } from 'react';

import { type ItemFormOpening } from './item-form-opening';

import type { LocationNode } from '@/fixtures/inventory-locations';

function insertUnder(node: LocationNode, parentId: string, child: LocationNode): LocationNode {
  if (node.id === parentId) return { ...node, children: [...node.children, child] };
  return { ...node, children: node.children.map((c) => insertUnder(c, parentId, child)) };
}

export function useLocationTreeState(opening: ItemFormOpening) {
  const [locationTree, setLocationTree] = useState<LocationNode[]>(opening.locationTree ?? []);
  const onCreateLocation = useCallback((name: string, parentId: string | null) => {
    const node: LocationNode = {
      id: `pending-${name}`,
      name,
      parentId,
      sortOrder: 0,
      children: [],
    };
    setLocationTree((prev) =>
      parentId === null ? [...prev, node] : prev.map((root) => insertUnder(root, parentId, node))
    );
  }, []);
  return { locationTree, onCreateLocation };
}
