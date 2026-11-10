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
export { TripOverview } from './overview/TripOverview';
export type { TripOverviewProps, OverviewLabels, OverviewKind } from './overview/types';
export { CalendarWorkspace } from './calendar/CalendarWorkspace';
export type { CalendarWorkspaceProps, CalendarSource } from './calendar/types';
