import { ContactError } from '../errors';

import type { ReviewChoices, ReviewItem } from './model';

/** One consistent server review snapshot; both revisions are required for a decision. */
export interface ReviewSnapshot {
  batchId: string;
  batchRevision: number;
  directoryRevision: number;
  items: ReviewItem[];
  proposalRevision: string;
  totalRows: number;
  offset: number;
  limit: number;
  counts: { automatic: number; review: number; new: number; invalid: number };
  ready: ReadySummary;
}

/** Server-authorized whole-batch eligibility, independent of visible row and candidate pages. */
export interface ReadySummary {
  proposalRevision: string;
  eligibleRows: number;
  automaticMerges: number;
  newPeople: number;
  sourceUpdates: number;
  sourceRemovals: number;
  deferred: number;
  reviewRequired: number;
  alreadyProcessed: number;
}

/** Exact ready-operation intent; its proof comes from ready metadata rather than the paging snapshot. */
export interface ReadyRequest {
  batchId: string;
  batchRevision: number;
  directoryRevision: number;
  proposalRevision: string;
  idempotencyKey: string;
}

/** Applied row count comes from the server receipt, never a client eligibility estimate. */
export interface ReadyReceipt {
  appliedRows: number;
}

/** One shared write latch retains the operation kind and exact body for safe retries. */
export type ReviewOperation =
  | { kind: 'row'; request: ReviewRequest }
  | { kind: 'ready'; request: ReadyRequest };

/** Exact user intent retained unchanged when a request needs a network retry. */
export interface ReviewRequest {
  batchId: string;
  batchRevision: number;
  directoryRevision: number;
  rowId: string;
  proposalRevision: string;
  idempotencyKey: string;
  choices: ReviewChoices;
  mergeEntityIds: string[];
  differentEntityIds: string[];
  laterEntityIds: string[];
}

/** Explicit server pages; the proof binds every page to the same complete classification. */
export interface ReviewPage {
  offset?: number;
  candidateRowId?: string;
  candidateOffset?: number;
  proposalRevision?: string;
}

/** Real HTTP boundary injected by tests; saving represents one atomic server operation. */
export interface ReviewGateway {
  load: (batchId: string, page?: ReviewPage) => Promise<ReviewSnapshot>;
  save: (request: ReviewRequest) => Promise<void>;
  applyReady: (request: ReadyRequest) => Promise<ReadyReceipt>;
}

/** A revision conflict requires new evidence and explicit user selections before retrying. */
export class StaleReviewError extends ContactError {
  override readonly name = 'StaleReviewError';
  constructor(diagnostic = 'contacts.review.stale') {
    super('stale', diagnostic);
  }
}
