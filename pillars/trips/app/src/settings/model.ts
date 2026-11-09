import type { Trip, TripInput, Tag } from '../api/types';

/** Editable source fields; empty picker values mean an explicit clear, not an inferred selection. */
export interface TripDraft {
  name: string;
  destination: string;
  when: string;
  tagId: string;
  parentId: string;
  notes: string;
}
/** Independent optional metadata draft without copied route timing. */
export function tripDraft(trip?: Trip): TripDraft {
  if (!trip) return { name: '', destination: '', when: '', tagId: '', parentId: '', notes: '' };
  return {
    name: trip.name ?? '',
    destination: trip.destination,
    when: trip.when,
    tagId: trip.tagId ?? '',
    parentId: trip.parentId === null ? '' : String(trip.parentId),
    notes: trip.notes,
  };
}
/** Preserve nonblank source text; blank names and changed picker values clear nullable fields; unchanged references are omitted. */
export function draftInput(draft: TripDraft, previous?: TripDraft): TripInput {
  return {
    name: draft.name.trim() ? draft.name : null,
    destination: draft.destination,
    when: draft.when,
    ...(draft.tagId !== previous?.tagId && { tagId: draft.tagId || null }),
    ...(draft.parentId !== previous?.parentId && {
      parentId: draft.parentId ? Number(draft.parentId) : null,
    }),
    notes: draft.notes,
  };
}
/** Exclude the selected trip and all descendants without looping on a malformed source catalogue. */
export function availableParents(trips: Trip[], id?: number): Trip[] {
  if (id === undefined) return trips;
  const excluded = new Set([id]);
  const pending = [id];
  while (pending.length) {
    const parent = pending.pop();
    for (const trip of trips)
      if (trip.parentId === parent && !excluded.has(trip.id)) {
        excluded.add(trip.id);
        pending.push(trip.id);
      }
  }
  return trips.filter((trip) => !excluded.has(trip.id));
}
/** Validate only explicitly selected references; unavailable catalogues do not block empty or unchanged source references. */
export function draftIssues(
  draft: TripDraft,
  trips: Trip[] | undefined,
  tags: Tag[] | undefined,
  context: { id?: number; previous?: TripDraft } = {}
): ('parent' | 'tag')[] {
  const { id, previous } = context;
  const issues: ('parent' | 'tag')[] = [];
  if (
    draft.parentId &&
    draft.parentId !== previous?.parentId &&
    !availableParents(trips ?? [], id).some((trip) => String(trip.id) === draft.parentId)
  )
    issues.push('parent');
  if (
    draft.tagId &&
    draft.tagId !== previous?.tagId &&
    !tags?.some((tag) => tag.id === draft.tagId)
  )
    issues.push('tag');
  return issues;
}
