import type { BulkColumn, BulkDraft } from '../../foundation/list-page/paste-parser.js';
import type { PlacementTarget } from '../../foundation/model/model.js';
import type { InventoryApiError } from '../../inventory-api-helpers.js';
import type { BatchProgress } from '../../inventory-web/batch-commit.js';
import type { BatchRowOutcome } from '../../inventory-web/useBatchCreate.js';
import type { DeleteCreatedResult } from '../../inventory-web/useDeleteCreated.js';

/** The visible phase of the bulk-entry workflow. */
export type BulkPhase =
  | 'editing'
  | 'pasted'
  | 'validating'
  | 'has-errors'
  | 'submitting'
  | 'partial-created'
  | 'created';

/** One server issue attached to an invalid bulk-entry row. */
export type BulkIssue = Extract<BatchRowOutcome, { status: 'invalid' }>['issues'][number];

/** The status shown beside one bulk-entry row. */
export type BulkRowStatus = 'blank' | 'unchecked' | 'ready' | 'refused';

/** A draft row together with the latest server answer for that row. */
export interface BulkRowState {
  draft: BulkDraft;
  status: BulkRowStatus;
  issues: readonly BulkIssue[];
}

/** Counts used by the bulk-entry banner and action bar. */
export interface BulkCounts {
  rows: number;
  ready: number;
  refused: number;
  created: number;
}

/** The state and actions required by the bulk-entry page. */
export interface BulkEntry {
  phase: BulkPhase;
  /** Typed rows followed by three blank rows. */
  rows: readonly BulkRowState[];
  counts: BulkCounts;
  /** The model destination used for the default placement. */
  destination: PlacementTarget;
  /** Changes the destination and immediately rechecks typed rows. */
  setDestination: (destination: PlacementTarget) => void;
  defaultTypeKey: string | null;
  /** Changes the default type and immediately rechecks typed rows. */
  setDefaultTypeKey: (key: string | null) => void;
  pasteNote: string;
  progress: BatchProgress | null;
  /** Item ids created by the most recent Create action. */
  createdIds: readonly string[];
  /** The latest check or create transport failure. */
  error: InventoryApiError | null;
  setCell: (row: number, column: BulkColumn, value: string) => void;
  /** Takes over a multi-cell paste and returns whether the browser default was prevented. */
  paste: (text: string, atRow: number) => boolean;
  clear: () => void;
  create: () => Promise<void>;
  undoCreated: () => Promise<DeleteCreatedResult>;
}
