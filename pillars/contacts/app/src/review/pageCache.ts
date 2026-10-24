import { ContactError } from '../errors';
import { StaleReviewError, type ReviewSnapshot } from './contracts';

import type { ReviewItem } from './model';

/** Accumulate evidence by stable IDs while refusing to combine different server snapshots. */
export class ReviewPageCache {
  private rows = new Map<string, ReviewItem>();
  private page: ReviewSnapshot | null = null;
  private pageIds: string[] = [];
  /** Proof supplied with all subsequent pages; cleared after writes or explicit reload. */
  proof: string | undefined;

  /** Discard evidence after a successful write or explicit reload. */
  clear(): void {
    this.rows.clear();
    this.page = null;
    this.pageIds = [];
    this.proof = undefined;
  }

  /** Row pages replace queue membership; candidate pages only extend evidence for an existing row. */
  accept(snapshot: ReviewSnapshot, candidates: boolean): ReviewSnapshot {
    this.validate(snapshot, candidates);
    this.proof = snapshot.proposalRevision;
    for (const row of snapshot.items) {
      const previous = this.rows.get(row.id);
      const merged = new Map(previous?.candidates.map((candidate) => [candidate.id, candidate]));
      for (const candidate of row.candidates) merged.set(candidate.id, candidate);
      this.rows.set(row.id, {
        ...row,
        candidates: [...merged.values()],
        visibleCandidateIds: row.candidates.map((candidate) => candidate.id),
        initialChoices: { ...previous?.initialChoices, ...row.initialChoices },
      });
    }
    if (!candidates) {
      this.pageIds = snapshot.items.map((row) => row.id);
      this.page = snapshot;
    }
    if (!this.page) throw new ContactError('missingQueue', 'contacts.review.missing_queue');
    return {
      ...this.page,
      ready: snapshot.ready,
      items: this.pageIds.flatMap((id) => {
        const row = this.rows.get(id);
        return row ? [row] : [];
      }),
    };
  }
  private validate(snapshot: ReviewSnapshot, candidates: boolean): void {
    if (this.proof && this.proof !== snapshot.proposalRevision)
      throw new StaleReviewError('contacts.review.stale_page');
    if (candidates && !this.page)
      throw new ContactError('missingQueue', 'contacts.review.missing_queue');
    for (const row of snapshot.items) {
      const previous = this.rows.get(row.id);
      if (previous && previous.proposalRevision !== row.proposalRevision)
        throw new StaleReviewError('contacts.review.stale_candidate_page');
    }
  }
}
