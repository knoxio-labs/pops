/** Source-backed Trips workspace components; shell activation is owned by its host. */
export { StayWorkspace } from './stay/StayWorkspace';
export type { StayWorkspaceProps } from './stay/types';

/** Options-first decision source workspace with revision-guarded persistence and Undo. */
export { DecisionWorkspace } from './decision/DecisionWorkspace';
export type { DecisionWorkspaceProps } from './decision/types';
