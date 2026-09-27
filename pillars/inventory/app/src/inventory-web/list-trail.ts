/** The list an item page was opened from, carried in router state. */
export interface ListTrail {
  listName: string;
  href: string;
  ids: readonly string[];
}

/** The current item's 1-based position within a list trail. */
export interface TrailPosition {
  listName: string;
  href: string;
  index: number;
  total: number;
  previousId: string | null;
  nextId: string | null;
}

/** Wraps a list trail in the router-state shape used by item detail pages. */
export function listTrailState(trail: ListTrail): { listTrail: ListTrail } {
  return { listTrail: { ...trail, ids: [...trail.ids] } };
}

function isListTrail(value: unknown): value is ListTrail {
  if (typeof value !== 'object' || value === null) return false;
  if (!('listName' in value) || !('href' in value) || !('ids' in value)) return false;
  return (
    typeof value.listName === 'string' &&
    value.listName.length > 0 &&
    typeof value.href === 'string' &&
    value.href.length > 0 &&
    Array.isArray(value.ids) &&
    value.ids.every((id): id is string => typeof id === 'string' && id.length > 0)
  );
}

/** Reads a list trail from router state, returning null for malformed state. */
export function readListTrail(state: unknown): ListTrail | null {
  if (typeof state !== 'object' || state === null || !('listTrail' in state)) return null;
  const value: unknown = state.listTrail;
  return isListTrail(value) ? { ...value, ids: [...value.ids] } : null;
}

/** Returns the current item's position and neighbours, or null when it is absent. */
export function trailPosition(trail: ListTrail | null, id: string): TrailPosition | null {
  if (trail === null) return null;
  const index = trail.ids.indexOf(id);
  if (index < 0) return null;
  return {
    listName: trail.listName,
    href: trail.href,
    index: index + 1,
    total: trail.ids.length,
    previousId: trail.ids[index - 1] ?? null,
    nextId: trail.ids[index + 1] ?? null,
  };
}
