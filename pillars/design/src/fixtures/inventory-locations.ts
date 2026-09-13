/**
 * The location tree every inventory screen reads its places from.
 *
 * Shaped as `LocationTreeNode` is served: `children` nested, `parentId` set
 * on every node including the roots' `null`, and `sortOrder` dense within a
 * parent. Screens that need a flat list or a breadcrumb map derive them from
 * this with the same helpers the app uses, so a fixture that is wrong here is
 * wrong everywhere rather than in one screen.
 */
export interface LocationNode {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  children: LocationNode[];
}

export interface LocationSegmentFixture {
  id: string;
  name: string;
}

export const locationTree: LocationNode[] = [
  {
    id: 'loc-house',
    name: 'Wattle Street house',
    parentId: null,
    sortOrder: 0,
    children: [
      {
        id: 'loc-living',
        name: 'Living room',
        parentId: 'loc-house',
        sortOrder: 0,
        children: [
          {
            id: 'loc-tv-unit',
            name: 'TV unit',
            parentId: 'loc-living',
            sortOrder: 0,
            children: [
              {
                id: 'loc-tv-drawer',
                name: 'Left drawer',
                parentId: 'loc-tv-unit',
                sortOrder: 0,
                children: [],
              },
            ],
          },
          {
            id: 'loc-bookshelf',
            name: 'Bookshelf',
            parentId: 'loc-living',
            sortOrder: 1,
            children: [],
          },
        ],
      },
      {
        id: 'loc-study',
        name: 'Study',
        parentId: 'loc-house',
        sortOrder: 1,
        children: [
          { id: 'loc-desk', name: 'Desk', parentId: 'loc-study', sortOrder: 0, children: [] },
          {
            id: 'loc-filing',
            name: 'Filing cabinet',
            parentId: 'loc-study',
            sortOrder: 1,
            children: [],
          },
        ],
      },
      {
        id: 'loc-kitchen',
        name: 'Kitchen',
        parentId: 'loc-house',
        sortOrder: 2,
        children: [
          { id: 'loc-pantry', name: 'Pantry', parentId: 'loc-kitchen', sortOrder: 0, children: [] },
        ],
      },
      {
        id: 'loc-bedroom',
        name: 'Main bedroom',
        parentId: 'loc-house',
        sortOrder: 3,
        children: [],
      },
    ],
  },
  {
    id: 'loc-garage',
    name: 'Garage',
    parentId: null,
    sortOrder: 1,
    children: [
      {
        id: 'loc-workbench',
        name: 'Workbench',
        parentId: 'loc-garage',
        sortOrder: 0,
        children: [
          {
            id: 'loc-toolbox',
            name: 'Red toolbox',
            parentId: 'loc-workbench',
            sortOrder: 0,
            children: [],
          },
        ],
      },
      { id: 'loc-shelving', name: 'Shelving', parentId: 'loc-garage', sortOrder: 1, children: [] },
    ],
  },
  {
    id: 'loc-storage',
    name: 'Offsite storage unit',
    parentId: null,
    sortOrder: 2,
    children: [],
  },
];

export const locationTreeEmpty: LocationNode[] = [];

/** A single root with nothing under it: the tree page's "no children" branch. */
export const locationTreeSingleRoot: LocationNode[] = [
  { id: 'loc-house', name: 'Wattle Street house', parentId: null, sortOrder: 0, children: [] },
];

/** Every node of {@link locationTree}, depth-first, parents before children. */
export function flattenLocationTree(nodes: LocationNode[] = locationTree): LocationNode[] {
  return nodes.flatMap((node) => [node, ...flattenLocationTree(node.children)]);
}

/** Root-first breadcrumb segments per location id, as the pages build them. */
export function locationPathMap(
  nodes: LocationNode[] = locationTree
): ReadonlyMap<string, LocationSegmentFixture[]> {
  const map = new Map<string, LocationSegmentFixture[]>();
  const walk = (items: LocationNode[], ancestors: LocationSegmentFixture[]): void => {
    for (const node of items) {
      const path = [...ancestors, { id: node.id, name: node.name }];
      map.set(node.id, path);
      walk(node.children, path);
    }
  };
  walk(nodes, []);
  return map;
}

/** `name` per location id, for the flat `location` label the item rows carry. */
export function locationNameById(
  nodes: LocationNode[] = locationTree
): ReadonlyMap<string, string> {
  return new Map(flattenLocationTree(nodes).map((node) => [node.id, node.name]));
}
