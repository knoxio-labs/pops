import { isNull } from 'drizzle-orm';

import { locations } from '../../db/index.js';

import type { CommandDb } from '../../domain/commands/index.js';

function compareLocations(
  left: { name: string; id: string; sortOrder: number },
  right: { name: string; id: string; sortOrder: number }
): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  );
}

/** Returns live locations in parent-before-child and sibling display order. */
export function readLocationOrder(db: CommandDb): string[] {
  const rows = db
    .select({
      id: locations.id,
      name: locations.name,
      parentId: locations.parentId,
      sortOrder: locations.sortOrder,
    })
    .from(locations)
    .where(isNull(locations.deletedAt))
    .all();
  const liveIds = new Set(rows.map((row) => row.id));
  const childrenByParent = new Map<string | null, typeof rows>();
  for (const row of rows) {
    const parentId = row.parentId !== null && liveIds.has(row.parentId) ? row.parentId : null;
    const children = childrenByParent.get(parentId);
    if (children === undefined) childrenByParent.set(parentId, [row]);
    else children.push(row);
  }

  for (const [parentId, children] of childrenByParent) {
    childrenByParent.set(parentId, children.toSorted(compareLocations));
  }

  const ordered: string[] = [];
  const visit = (parentId: string | null): void => {
    for (const row of childrenByParent.get(parentId) ?? []) {
      ordered.push(row.id);
      visit(row.id);
    }
  };
  visit(null);
  return ordered;
}
