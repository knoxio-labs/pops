import { describe, expect, it } from 'vitest';

import { StaleReviewError, type ReviewSnapshot } from './contracts';
import { ReviewPageCache } from './pageCache';
import { noReadyRows } from './test-fixtures';

import type { ReviewCandidate } from './model';

function snapshot(id: string): ReviewSnapshot {
  const candidate: ReviewCandidate = {
    id,
    entityId: id,
    name: id,
    localName: id,
    sourceOptions: [],
    points: [],
    sources: [],
    reasons: [],
    keepSeparate: false,
  };
  return {
    batchId: 'batch',
    batchRevision: 1,
    directoryRevision: 2,
    proposalRevision: 'whole-proof',
    totalRows: 100,
    offset: 0,
    limit: 50,
    ready: noReadyRows,
    counts: { automatic: 0, review: 100, new: 0, invalid: 0 },
    items: [
      {
        id: 'row',
        proposalRevision: 'row-proof',
        name: 'Incoming',
        source: 'vCard',
        status: 'Ambiguous name',
        errors: [],
        processed: false,
        points: [],
        candidateTotal: 2,
        candidateOffset: id === 'a' ? 0 : 1,
        candidateLimit: 1,
        candidates: [candidate],
      },
    ],
  };
}

describe('stable review page cache', () => {
  it('uses fresh server readiness metadata from candidate pages even when the paging proof is unchanged', () => {
    const cache = new ReviewPageCache();
    cache.accept(snapshot('a'), false);
    const next = snapshot('b');
    next.ready = { ...next.ready, proposalRevision: 'new-ready-proof', eligibleRows: 2 };
    const result = cache.accept(next, true);
    expect(result.proposalRevision).toBe('whole-proof');
    expect(result.ready).toEqual(next.ready);
  });
  it('accumulates candidates while displaying only the requested evidence page', () => {
    const cache = new ReviewPageCache();
    cache.accept(snapshot('a'), false);
    const merged = cache.accept(snapshot('b'), true);
    expect(merged.items[0]?.candidates.map((candidate) => candidate.id)).toEqual(['a', 'b']);
    expect(merged.items[0]?.visibleCandidateIds).toEqual(['b']);
    expect(merged.totalRows).toBe(100);
    expect(merged.counts.review).toBe(100);
  });
  it('refuses a global or row proof change and permits fresh evidence after explicit clear', () => {
    const cache = new ReviewPageCache();
    cache.accept(snapshot('a'), false);
    expect(() =>
      cache.accept({ ...snapshot('b'), proposalRevision: 'changed-global' }, true)
    ).toThrow(StaleReviewError);
    const changed = snapshot('b');
    const row = changed.items[0];
    if (!row) throw new Error('Missing review fixture');
    row.proposalRevision = 'changed-row';
    expect(() => cache.accept(changed, true)).toThrow(StaleReviewError);
    cache.clear();
    expect(
      cache.accept(changed, false).items[0]?.candidates.map((candidate) => candidate.id)
    ).toEqual(['b']);
  });
});
