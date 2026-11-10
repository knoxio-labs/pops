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
export { ArrangementsWorkspace } from './arrangements/ArrangementsWorkspace';
export type { ArrangementsWorkspaceProps, ArrangementLabels } from './arrangements/types';
/** Locale-aware calendar source formatter; absent clocks never become viewer-local instants. */
export { dateLabel as formatTripDate } from './visit/periods';
