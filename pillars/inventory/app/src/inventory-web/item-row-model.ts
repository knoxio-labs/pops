import type {
  ItemRowModel,
  Lifecycle,
  LocationKind,
  LocationModel,
  Placement,
  PreviousPlacement,
  SyncState,
} from '../foundation/model/model';
import type {
  LocationTreeNode,
  LocationsCreateResponses,
  WebListResponses,
} from '../inventory-api/types.gen.js';

/** The generated web item shape accepted by the shared row-model mapper. */
export type WebItem = WebListResponses['200']['items'][number];

/** The generated location payload returned after creating a location. */
export type CreatedLocation = LocationsCreateResponses[201]['data'];

/** Lookups and request state that are not carried by the web item response. */
export interface ItemRowModelContext {
  readonly typeNames?: ReadonlyMap<string, string>;
  readonly deletedPreviousPlaces?: ReadonlyMap<string, string>;
  readonly sync?: SyncState;
}

function isLifecycle(value: string): value is Lifecycle {
  return (
    value === 'active' ||
    value === 'retired' ||
    value === 'discarded' ||
    value === 'lost' ||
    value === 'destroyed'
  );
}

function toLifecycle(value: string): Lifecycle {
  return isLifecycle(value) ? value : 'active';
}

function toPlacement(item: WebItem): Placement {
  if (item.placement.kind === 'hand') {
    return { kind: 'in-hand' };
  }

  if (item.placement.kind === 'container') {
    return { kind: 'container', containerId: item.placement.itemId };
  }

  return { kind: 'location', locationId: item.placement.locationId };
}

function toPreviousPlacement(
  item: WebItem,
  context: ItemRowModelContext
): PreviousPlacement | null {
  if (item.previousPlacement === null) {
    return null;
  }

  if (item.previousPlacement.kind === 'container') {
    return {
      kind: 'container',
      containerId: item.previousPlacement.itemId,
    };
  }

  const deletedName = context.deletedPreviousPlaces?.get(item.previousPlacement.locationId);
  if (deletedName !== undefined) {
    return { kind: 'deleted', name: deletedName };
  }

  return {
    kind: 'location',
    locationId: item.previousPlacement.locationId,
  };
}

function toTypeName(item: WebItem, context: ItemRowModelContext): string | null {
  if (item.typeId === null) {
    return null;
  }

  return context.typeNames?.get(item.typeId) ?? item.typeKey ?? item.legacyType ?? null;
}

/** Maps one generated web item into the foundation row model used by pickers and rows. */
export function toItemRowModel(item: WebItem, context: ItemRowModelContext = {}): ItemRowModel {
  return {
    id: item.id,
    name: item.name,
    typeId: item.typeId,
    typeName: toTypeName(item, context),
    code: item.code,
    quantity: item.quantity,
    container: item.isContainer
      ? {
          access: item.access ?? 'closed',
          full: item.isFull ?? false,
        }
      : null,
    lifecycle: toLifecycle(item.lifecycle),
    placement: toPlacement(item),
    previous: toPreviousPlacement(item, context),
    sync: context.sync ?? 'synced',
    photoUrl: null,
    note: item.note,
    updatedAt: item.updatedAt,
  };
}

function kindForChild(parentKind: LocationKind | null): LocationKind {
  if (parentKind === null) {
    return 'property';
  }

  if (parentKind === 'property') {
    return 'room';
  }

  if (parentKind === 'room') {
    return 'furniture';
  }

  return 'storage';
}

function flattenNodes(
  nodes: readonly LocationTreeNode[],
  parentKind: LocationKind | null
): LocationModel[] {
  const flattened: LocationModel[] = [];

  for (const node of nodes) {
    const kind = kindForChild(parentKind);
    flattened.push({
      id: node.id,
      name: node.name,
      parentId: node.parentId,
      kind,
    });
    flattened.push(...flattenNodes(node.children, kind));
  }

  return flattened;
}

/** Flattens the generated location tree in display order with inferred foundation kinds. */
export function flattenLocationTree(nodes: readonly LocationTreeNode[]): LocationModel[] {
  return flattenNodes(nodes, null);
}

/** Appends a created location to a cached tree without changing an unrelated tree. */
export function appendLocationTree(
  nodes: LocationTreeNode[],
  location: CreatedLocation
): LocationTreeNode[] {
  if (nodes.some((node) => node.id === location.id)) {
    return nodes;
  }

  const child = { ...location, children: [] };
  if (location.parentId === null) {
    return [...nodes, child];
  }

  let changed = false;
  const next = nodes.map((node) => {
    if (node.id === location.parentId) {
      changed = true;
      return { ...node, children: [...node.children, child] };
    }

    const children = appendLocationTree(node.children, location);
    if (children === node.children) {
      return node;
    }

    changed = true;
    return { ...node, children };
  });

  return changed ? next : nodes;
}
