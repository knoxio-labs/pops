import { sourceOwner } from '../arrangements/source-owner';
import { applyMeetingOperation, peopleOwnerQueryKey } from './api';
import { PeopleEditor } from './editor';
import { assertPeopleOwner } from './source-owner';

import type { SourceOwner } from '../arrangements/source-owner';
import type { MeetingPlan, PeopleWorkspaceProps } from './types';

const sessions = new Map<string, PeopleEditor>();

/** Retain one source editor across route remounts so an uncertain create cannot become a second POST. */
export function peopleSession(
  props: Pick<PeopleWorkspaceProps, 'tripId' | 'client'>,
  initial: MeetingPlan[]
): PeopleEditor {
  return ownedPeopleSession(sourceOwner(props), initial);
}
/** Reuse only the editor belonging to a view's captured origin and trip, without recapturing a mutable client. */
export function ownedPeopleSession(owner: SourceOwner, initial: MeetingPlan[]): PeopleEditor {
  const key = JSON.stringify(peopleOwnerQueryKey(owner));
  const existing = sessions.get(key);
  if (existing) return existing;
  const editor = new PeopleEditor(initial, (operation) => {
    assertPeopleOwner(owner);
    return applyMeetingOperation(owner, operation);
  });
  sessions.set(key, editor);
  return editor;
}
