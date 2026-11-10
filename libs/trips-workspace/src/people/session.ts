import { ApiError } from '@pops/pillar-sdk/client';

import { currentSourceOwner, sourceOwner } from '../arrangements/source-owner';
import { applyMeetingOperation, peopleQueryKey } from './api';
import { PeopleEditor } from './editor';

import type { MeetingPlan, PeopleWorkspaceProps } from './types';

const sessions = new Map<string, PeopleEditor>();

/** Retain one source editor across route remounts so an uncertain create cannot become a second POST. */
export function peopleSession(
  props: Pick<PeopleWorkspaceProps, 'tripId' | 'client'>,
  initial: MeetingPlan[]
): PeopleEditor {
  const key = JSON.stringify(peopleQueryKey(props));
  const existing = sessions.get(key);
  if (existing) return existing;
  const owner = sourceOwner(props);
  const editor = new PeopleEditor(initial, (operation) => {
    if (!currentSourceOwner(owner, owner))
      throw new ApiError('The owning source changed', undefined, 'trips.people.source_changed');
    return applyMeetingOperation(owner, operation);
  });
  sessions.set(key, editor);
  return editor;
}
