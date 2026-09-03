/**
 * The folder tree a set of screen ids describes.
 *
 * A screen id is a path, so the grouping is already in the data — this turns
 * it into something a nav can render at any depth. The first segment is the
 * area and heads the tree; every segment but the last is a group; the last
 * names the screen itself. Groups and screens are siblings in one ordered
 * child list, so a screen sitting beside a group keeps its place in the order.
 *
 * Generic over the item because the sidebar places more than the catalog's
 * screens: an experiment whose screen exists only inside its own variants has
 * no `ScreenEntry` and still needs a home in the tree.
 */
export interface Placed {
  /** The screen id — `<area>/<group…>/<slug>`. */
  id: string;
  order: number;
}

export interface GroupNode<T extends Placed> {
  name: string;
  /** The group's own path, so a caller can key or address it. */
  path: string[];
  order: number;
  children: TreeNode<T>[];
}

export type TreeNode<T extends Placed> =
  | { kind: 'group'; group: GroupNode<T> }
  | { kind: 'item'; item: T };

interface Building<T extends Placed> {
  name: string;
  path: string[];
  groups: Map<string, Building<T>>;
  items: T[];
}

function emptyGroup<T extends Placed>(name: string, path: string[]): Building<T> {
  return { name, path, groups: new Map(), items: [] };
}

function childGroup<T extends Placed>(parent: Building<T>, name: string): Building<T> {
  const existing = parent.groups.get(name);
  if (existing) return existing;
  const created = emptyGroup<T>(name, [...parent.path, name]);
  parent.groups.set(name, created);
  return created;
}

function orderOf<T extends Placed>(node: TreeNode<T>): number {
  return node.kind === 'group' ? node.group.order : node.item.order;
}

/** A tie breaks on the last segment, so a group and a screen sort as siblings. */
function nameOf<T extends Placed>(node: TreeNode<T>): string {
  return node.kind === 'group' ? node.group.name : (node.item.id.split('/').at(-1) ?? '');
}

function finalise<T extends Placed>(building: Building<T>): GroupNode<T> {
  const children: TreeNode<T>[] = [
    ...[...building.groups.values()].map((g) => ({ kind: 'group' as const, group: finalise(g) })),
    ...building.items.map((item) => ({ kind: 'item' as const, item })),
  ].toSorted((a, b) => orderOf(a) - orderOf(b) || nameOf(a).localeCompare(nameOf(b)));
  const order = children.length > 0 ? Math.min(...children.map(orderOf)) : Number.MAX_SAFE_INTEGER;
  return { name: building.name, path: building.path, order, children };
}

/**
 * Group items into their areas and the folders below them. Items whose id has
 * fewer than two segments have no area to sit in and are dropped — discovery
 * has already reported them as contract errors.
 */
export function buildScreenTree<T extends Placed>(items: readonly T[]): GroupNode<T>[] {
  const areas = new Map<string, Building<T>>();
  for (const item of items) {
    const segments = item.id.split('/');
    if (segments.length < 2) continue;
    const [area = '', ...rest] = segments;
    const groups = rest.slice(0, -1);
    let node = areas.get(area) ?? emptyGroup<T>(area, [area]);
    areas.set(area, node);
    for (const name of groups) node = childGroup(node, name);
    node.items.push(item);
  }
  return [...areas.values()].map(finalise).toSorted((a, b) => a.order - b.order);
}
