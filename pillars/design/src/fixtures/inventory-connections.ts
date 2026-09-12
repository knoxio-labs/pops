/**
 * Fixtures for the inventory item-connection controls: ConnectionsList,
 * ConnectDialog, ConnectionGraph and ConnectionTracePanel.
 *
 * An item connection in the source is a plain, undirected pairing between
 * two items — `item_connections` is only `itemAId`/`itemBId`, with no
 * connection "kind" or relation label. The one classifying dimension the
 * controls actually render is the *connected item's own* `type`
 * (Electronics, Tool, …), shown through `TypeBadge` and, on the graph, the
 * node colour and legend. Every set below draws its connections from
 * `inventory-items` so the graph is about the same items the other
 * inventory screens show, and covers every item type that pool has,
 * including the untyped items the source also has to handle.
 */
import { inventoryItem, inventoryItemMinimal, inventoryItems } from './inventory-items';

import type { ConnectedItem } from '@/kit/inventory/connections/connections-list';
import type { ConnectCandidateItem, GraphData, TraceNode } from '@/kit/inventory/connections/types';

function itemById(id: string) {
  const item = inventoryItems.find((i) => i.id === id);
  if (!item) throw new Error(`inventory-connections fixture: unknown item id "${id}"`);
  return item;
}

function connectedItem(id: string): ConnectedItem {
  const item = itemById(id);
  return { id: item.id, itemName: item.itemName, assetId: item.assetId, type: item.type };
}

function graphNode(id: string): GraphData['nodes'][number] {
  const item = itemById(id);
  return { id: item.id, itemName: item.itemName, assetId: item.assetId, type: item.type };
}

function traceNode(id: string, children: TraceNode[] = []): TraceNode {
  const item = itemById(id);
  return {
    id: item.id,
    itemName: item.itemName,
    assetId: item.assetId,
    type: item.type,
    children,
  };
}

/**
 * `inventoryItem` (the TV) connected to two of each item type the fixture
 * pool has, plus both untyped items — one connection per type where the
 * pool only has one.
 */
export const itemConnections: ConnectedItem[] = [
  connectedItem('itm-laptop'),
  connectedItem('itm-printer'),
  connectedItem('itm-espresso'),
  connectedItem('itm-vacuum'),
  connectedItem('itm-drill'),
  connectedItem('itm-mower'),
  connectedItem('itm-sofa'),
  connectedItem('itm-kettle'),
  connectedItem('itm-bike'),
  connectedItem('itm-guitar'),
  connectedItem('itm-books'),
  {
    id: inventoryItemMinimal.id,
    itemName: inventoryItemMinimal.itemName,
    assetId: null,
    type: null,
  },
];

/** An item with no connections at all: `ConnectionsList`'s empty state. */
export const itemConnectionsEmpty: ConnectedItem[] = [];

/**
 * A small graph with a branch and a leaf: the TV connects to the laptop
 * and the drill, and the laptop's own connection to the sofa hangs off it
 * as a leaf.
 */
export const graphBranchAndLeaf: GraphData = {
  nodes: [
    graphNode('itm-tv'),
    graphNode('itm-laptop'),
    graphNode('itm-drill'),
    graphNode('itm-sofa'),
  ],
  edges: [
    { source: 'itm-tv', target: 'itm-laptop' },
    { source: 'itm-tv', target: 'itm-drill' },
    { source: 'itm-laptop', target: 'itm-sofa' },
  ],
};

/** A graph with enough nodes and cross-links to be crowded on the canvas. */
export const graphCrowded: GraphData = {
  nodes: [
    graphNode('itm-tv'),
    graphNode('itm-laptop'),
    graphNode('itm-espresso'),
    graphNode('itm-drill'),
    graphNode('itm-bike'),
    graphNode('itm-vacuum'),
    graphNode('itm-sofa'),
    graphNode('itm-printer'),
    graphNode('itm-kettle'),
    graphNode('itm-guitar'),
    graphNode('itm-camera'),
  ],
  edges: [
    { source: 'itm-tv', target: 'itm-laptop' },
    { source: 'itm-tv', target: 'itm-drill' },
    { source: 'itm-tv', target: 'itm-vacuum' },
    { source: 'itm-tv', target: 'itm-sofa' },
    { source: 'itm-tv', target: 'itm-kettle' },
    { source: 'itm-laptop', target: 'itm-printer' },
    { source: 'itm-laptop', target: 'itm-camera' },
    { source: 'itm-laptop', target: 'itm-guitar' },
    { source: 'itm-drill', target: 'itm-bike' },
    { source: 'itm-espresso', target: 'itm-kettle' },
    { source: 'itm-espresso', target: 'itm-vacuum' },
    { source: 'itm-sofa', target: 'itm-guitar' },
    { source: 'itm-printer', target: 'itm-camera' },
    { source: 'itm-bike', target: 'itm-guitar' },
    { source: 'itm-vacuum', target: 'itm-drill' },
    { source: 'itm-kettle', target: 'itm-camera' },
  ],
};

/**
 * A trace tree four levels deep: the TV branches into the laptop and the
 * drill, the laptop branches again into the printer and the camera, and
 * the printer has its own single child.
 */
export const traceDeep: TraceNode = traceNode('itm-tv', [
  traceNode('itm-laptop', [
    traceNode('itm-printer', [traceNode('itm-espresso')]),
    traceNode('itm-camera'),
  ]),
  traceNode('itm-drill', [traceNode('itm-bike')]),
]);

/** A trace whose root has no children: the connection chain is one item. */
export const traceSingleNode: TraceNode = traceNode('itm-guitar');

/** `ConnectDialog`'s search results for a query that matches several items. */
export const connectCandidateItems: ConnectCandidateItem[] = [
  {
    id: 'itm-laptop',
    itemName: 'MacBook Pro 16" M4 Max',
    brand: 'Apple',
    model: 'MRW73X/A',
    assetId: 'HI-0002',
    type: 'Electronics',
  },
  {
    id: 'itm-camera',
    itemName: 'Fujifilm X-T5 body',
    brand: 'Fujifilm',
    model: 'X-T5',
    assetId: 'HI-0011',
    type: 'Electronics',
  },
  {
    id: 'itm-kettle',
    itemName: 'Stovetop kettle',
    brand: null,
    model: null,
    assetId: 'HI-0009',
    type: 'Kitchenware',
  },
  {
    id: 'itm-books',
    itemName: 'Reference books, two shelves',
    brand: null,
    model: null,
    assetId: null,
    type: null,
  },
];

/** `ConnectDialog`'s search results for a query that matches nothing. */
export const connectCandidateItemsEmpty: ConnectCandidateItem[] = [];

/** The item id `ConnectDialog`'s candidates above are searched from. */
export const connectDialogCurrentItemId = inventoryItem.id;
