/** Source-backed Trips workspace components; shell activation is owned by its host. */
export { StayWorkspace } from './stay/StayWorkspace';
export type { StayWorkspaceProps } from './stay/types';
export { EventWorkspace } from './event/EventWorkspace';
export type { EventWorkspaceProps } from './event/types';

/** Options-first decision source workspace with revision-guarded persistence and Undo. */
export { DecisionWorkspace } from './decision/DecisionWorkspace';
export type { DecisionWorkspaceProps } from './decision/types';
export { JourneyWorkspace } from './journey/JourneyWorkspace';
export type { JourneyWorkspaceProps } from './journey/types';

/** Trip-owned meeting plans grouped by exact route Visit occurrences. */
export { PeopleWorkspace } from './people/PeopleWorkspace';
export type {
  PeopleWorkspaceProps,
  MeetingContact,
  PeopleText,
  PeopleTextKey,
} from './people/types';
