import {
  inboxTargetKinds,
  inboxIntentions,
  inboxArrangements,
  type InboxNewTargetDraft,
  type InboxState,
} from './types';

/** Creates a blank explicit item draft from current typed creation settings, without copying captured material. */
export function emptyInboxTargetDraft(state: InboxState): InboxNewTargetDraft {
  return { kind: '', title: '', placeId: '', visitId: '', notes: '', ...state.creationDefaults };
}

import type { TripRecord } from '../../fixtures/trip-overview-model';

function associationError(
  state: InboxState,
  sourceId: string,
  associationId: string
): string | null {
  if (!state.capture.items.some((source) => source.id === sourceId))
    return 'This captured source is unavailable.';
  if (!associationId.trim() || state.associations.some((entry) => entry.id === associationId))
    return 'Choose a distinct association identifier.';
  return null;
}

/** Associates an existing item without modifying captured material, target fields, purchase flags or route order. */
export function linkInboxSource(
  state: InboxState,
  sourceId: string,
  targetId: string,
  associationId: string
): { state: InboxState; error: string | null } {
  const error = associationError(state, sourceId, associationId);
  if (error) return { state, error };
  if (!state.targets.some((target) => target.id === targetId))
    return { state, error: 'Choose an available item.' };
  if (
    state.associations.some((entry) => entry.sourceId === sourceId && entry.targetId === targetId)
  )
    return { state, error: 'This source is already linked to that item.' };
  return {
    state: {
      ...state,
      associations: [...state.associations, { id: associationId, sourceId, targetId }],
    },
    error: null,
  };
}

function targetDraftError(
  state: InboxState,
  draft: InboxNewTargetDraft,
  targetId: string
): string | null {
  if (
    !targetId.trim() ||
    state.targets.some((target) => target.id === targetId) ||
    state.associations.some((entry) => entry.targetId === targetId)
  )
    return 'Choose a distinct item identifier.';
  if (!draft.title.trim()) return 'Enter an item title.';
  if (!inboxTargetKinds.some((kind) => kind.id === draft.kind)) return 'Choose an item kind.';
  if (!inboxIntentions.some((choice) => choice.id === draft.intention))
    return 'Choose a planning intention.';
  if (!inboxArrangements.some((choice) => choice.id === draft.arrangement))
    return 'Choose an arrangement state.';
  if (draft.placeId && !state.places.some((place) => place.id === draft.placeId))
    return 'Choose an available location or clear it.';
  if (
    draft.visitId &&
    !state.targets.some((target) => target.id === draft.visitId && target.kind === 'city')
  )
    return 'Choose an available visit or clear it.';
  return null;
}

/** Atomically creates an explicitly described local item and association, with no inferred fields or automatic route insertion. */
export function createInboxTarget(
  state: InboxState,
  sourceId: string,
  draft: InboxNewTargetDraft,
  ids: { targetId: string; associationId: string }
): { state: InboxState; error: string | null } {
  const { targetId, associationId } = ids;
  const error =
    associationError(state, sourceId, associationId) ?? targetDraftError(state, draft, targetId);
  if (error) return { state, error };
  const kind = inboxTargetKinds.find((choice) => choice.id === draft.kind)?.id;
  const intention = inboxIntentions.find((choice) => choice.id === draft.intention)?.id;
  const arrangement = inboxArrangements.find((choice) => choice.id === draft.arrangement)?.id;
  if (!kind || !intention || !arrangement) return { state, error: 'Choose valid item fields.' };
  const target: TripRecord = {
    id: targetId,
    kind,
    title: draft.title.trim(),
    placeId: draft.placeId,
    notes: draft.notes,
    intention,
    arrangement,
    ...(draft.visitId ? { visitId: draft.visitId } : {}),
  };
  return {
    state: {
      ...state,
      targets: [...state.targets, target],
      associations: [...state.associations, { id: associationId, sourceId, targetId }],
    },
    error: null,
  };
}

/** Removes one organisation association including stale references, preserving both captured originals and created targets for undo. */
export function unlinkInboxAssociation(state: InboxState, id: string): InboxState {
  return state.associations.some((entry) => entry.id === id)
    ? { ...state, associations: state.associations.filter((entry) => entry.id !== id) }
    : state;
}
