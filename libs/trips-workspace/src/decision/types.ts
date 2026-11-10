import type { Client } from '../trips-api/client';
import type {
  DecisionsWorkspaceResponses,
  DecisionsUpdateData,
  DecisionOptionsUpdateData,
} from '../trips-api/types.gen';

/** Coherent Trips-owned decision and live-option snapshot. */
export type DecisionSource = DecisionsWorkspaceResponses[200];
/** Explicit decision source fields, without the aggregate write precondition. */
export type DecisionFields = Omit<NonNullable<DecisionsUpdateData['body']>, 'expectedRevision'>;
/** Explicit option source fields, without the aggregate write precondition. */
export type OptionFields = Omit<NonNullable<DecisionOptionsUpdateData['body']>, 'expectedRevision'>;
/** Persisted independent option facts. */
export type DecisionOption = DecisionSource['options'][number];
/** Explicit supported arrangement identity. */
export type AffectedSource = DecisionOption['affectedSources'][number];
/** Opaque provenance reference; resolution stays with its owner. */
export type SourceLink = DecisionOption['sourceLinks'][number];
/** Host-supplied source identity and optional generated-client transport. */
export interface DecisionWorkspaceProps {
  backHref?: string;
  tripId: number;
  decisionId: number;
  client?: Client;
}
/** Explicit user edits; removal is reversible without recreating an identity. */
export type DecisionCommand =
  | { kind: 'edit-decision'; fields: DecisionFields }
  | { kind: 'select-option'; optionId: number | null }
  | { kind: 'add-option'; fields: OptionFields }
  | { kind: 'edit-option'; id: number; fields: OptionFields }
  | { kind: 'remove-option'; id: number };
/** Successful source inverses; restore is only used to undo a removal, without a redo promise. */
export type UndoCommand = DecisionCommand | { kind: 'restore-option'; id: number; select: boolean };
/** Confirmed mutation result and its source inverse; restoration itself has no redo entry. */
export interface AppliedDecisionChange {
  source: DecisionSource;
  inverse: UndoCommand | null;
}
