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
  const editor = new PeopleEditor(initial, (operation) => applyMeetingOperation(props, operation));
  sessions.set(key, editor);
  return editor;
}
