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
}

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
}

/** A revision conflict requires new evidence and explicit user selections before retrying. */
export class StaleReviewError extends ContactError {
  override readonly name = 'StaleReviewError';
  constructor(diagnostic = 'contacts.review.stale') {
    super('stale', diagnostic);
  }
}
