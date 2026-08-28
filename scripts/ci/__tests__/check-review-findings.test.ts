/**
 * The required-check guard that reads `pr-review.yml`'s own sticky comment
 * and blocks a merge on an open finding (POPS-2661).
 *
 * Every case here is one of the ticket's explicit test bullets, plus the
 * poll/timeout behaviour that decides whether a normal post-push window
 * reads as PENDING (retry) rather than a hard failure. The self-test in the
 * guard module itself (`node scripts/ci/check-review-findings.mjs
 * --self-test`) covers the same ground for the ADR-045 preflight; this suite
 * is the detailed version.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { describe, expect, it, vi } from 'vitest';

import {
  collectDismissedFindingIds,
  decodeState,
  dismissMarkerFor,
  evaluateReviewState,
  findStateComment,
  pollForReviewState,
} from '../check-review-findings.mjs';
import { STATE_MARKER } from '../pr-review-state.mjs';

const HEAD = 'a'.repeat(40);

function stateComment(state: unknown): { body: string } {
  return {
    body: `## Review\n\n<!-- ${STATE_MARKER}: ${Buffer.from(JSON.stringify(state)).toString('base64')} -->`,
  };
}

describe('evaluateReviewState', () => {
  it('fails on one open finding, and names it', () => {
    const result = evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [
            { id: 'f1', file: 'a.ts', title: 'bad thing', severity: 'high', status: 'open' },
          ],
        }),
      ],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('fail');
    expect(result.outcome === 'fail' && result.findings?.map((f) => f.id)).toEqual(['f1']);
  });

  it('passes when every finding is resolved', () => {
    const result = evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [{ id: 'f1', file: 'a.ts', title: 'was bad', status: 'resolved' }],
        }),
      ],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('pass');
  });

  it('fails closed on a status value that is neither open nor resolved', () => {
    // pr-review-state.mjs's own writer treats anything not exactly 'resolved'
    // as open; this guard must agree, so a typo or a future status it does
    // not yet know about blocks rather than silently passing.
    const result = evaluateReviewState({
      comments: [
        stateComment({ last_reviewed_sha: HEAD, findings: [{ id: 'f1', status: 'flagged' }] }),
      ],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('fail');
  });

  it('passes on an empty findings array', () => {
    const result = evaluateReviewState({
      comments: [stateComment({ last_reviewed_sha: HEAD, findings: [] })],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('pass');
  });

  it('never passes when no comment is present', () => {
    const result = evaluateReviewState({ comments: [], headSha: HEAD });
    expect(result.outcome).not.toBe('pass');
    expect(result.outcome).toBe('retry');
  });

  it('never passes when the comment exists but is not the sticky review comment', () => {
    const result = evaluateReviewState({
      comments: [{ body: 'unrelated comment, no state block here' }],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('retry');
  });

  it('never passes when last_reviewed_sha is not the head', () => {
    const result = evaluateReviewState({
      comments: [stateComment({ last_reviewed_sha: 'b'.repeat(40), findings: [] })],
      headSha: HEAD,
    });
    expect(result.outcome).not.toBe('pass');
    expect(result.outcome).toBe('retry');
  });

  it('fails, without throwing, on base64 that does not decode to JSON', () => {
    const result = evaluateReviewState({
      comments: [{ body: `<!-- ${STATE_MARKER}: QQQ -->` }],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('fail');
  });

  it('fails, without throwing, on out-of-charset garbage where base64 should be', () => {
    const result = evaluateReviewState({
      comments: [{ body: `<!-- ${STATE_MARKER}: !!!not-base64!!! -->` }],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('fail');
  });

  it('fails, without throwing, on valid base64 whose JSON is not the expected shape', () => {
    const notAnObject = evaluateReviewState({
      comments: [
        { body: `<!-- ${STATE_MARKER}: ${Buffer.from('"just a string"').toString('base64')} -->` },
      ],
      headSha: HEAD,
    });
    expect(notAnObject.outcome).toBe('fail');

    const missingFindings = evaluateReviewState({
      comments: [
        {
          body: `<!-- ${STATE_MARKER}: ${Buffer.from(JSON.stringify({ hello: 'world' })).toString('base64')} -->`,
        },
      ],
      headSha: HEAD,
    });
    expect(missingFindings.outcome).toBe('fail');

    const findingMissingStatus = evaluateReviewState({
      comments: [stateComment({ last_reviewed_sha: HEAD, findings: [{ id: 'f1', file: 'a.ts' }] })],
      headSha: HEAD,
    });
    expect(findingMissingStatus.outcome).toBe('fail');
  });

  it('picks the last of two sticky-looking comments, deterministically', () => {
    const comments = [
      stateComment({ last_reviewed_sha: HEAD, findings: [{ id: 'stale-open', status: 'open' }] }),
      stateComment({ last_reviewed_sha: HEAD, findings: [] }),
    ];
    expect(evaluateReviewState({ comments, headSha: HEAD }).outcome).toBe('pass');

    const reversed = comments.toReversed();
    const result = evaluateReviewState({ comments: reversed, headSha: HEAD });
    expect(result.outcome).toBe('fail');
    expect(result.outcome === 'fail' && result.findings?.map((f) => f.id)).toEqual(['stale-open']);
  });
});

describe('the escape hatch (POPS-2669)', () => {
  it('dismissing the only open finding by id passes', () => {
    const result = evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [{ id: 'aaaaaa111111', status: 'open', title: 'stale' }],
        }),
        { body: dismissMarkerFor('aaaaaa111111'), author_association: 'OWNER' },
      ],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('pass');
  });

  it('reports a dismissed finding back even on a pass, for auditability', () => {
    const result = evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [{ id: 'aaaaaa111111', status: 'open', title: 'stale' }],
        }),
        { body: dismissMarkerFor('aaaaaa111111'), author_association: 'OWNER' },
      ],
      headSha: HEAD,
    });
    expect(result.outcome === 'pass' && result.dismissed?.map((f) => f.id)).toEqual([
      'aaaaaa111111',
    ]);
  });

  it('dismissing one finding does not waive a different, still-open one', () => {
    const result = evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [
            { id: 'aaaaaa111111', status: 'open', title: 'stale' },
            { id: 'bbbbbb222222', status: 'open', title: 'real bug' },
          ],
        }),
        { body: dismissMarkerFor('aaaaaa111111'), author_association: 'OWNER' },
      ],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('fail');
    expect(result.outcome === 'fail' && result.findings?.map((f) => f.id)).toEqual([
      'bbbbbb222222',
    ]);
    expect(result.outcome === 'fail' && result.dismissed?.map((f) => f.id)).toEqual([
      'aaaaaa111111',
    ]);
  });

  it('a dismiss marker for an id that never appears is a harmless no-op', () => {
    const result = evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [{ id: 'bbbbbb222222', status: 'open', title: 'real bug' }],
        }),
        { body: dismissMarkerFor('cccccc333333'), author_association: 'OWNER' },
      ],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('fail');
    expect(result.outcome === 'fail' && result.findings?.map((f) => f.id)).toEqual([
      'bbbbbb222222',
    ]);
  });

  it('accumulates dismissals from more than one comment', () => {
    const result = evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [
            { id: 'aaaaaa111111', status: 'open', title: 'a' },
            { id: 'bbbbbb222222', status: 'open', title: 'b' },
          ],
        }),
        { body: `${dismissMarkerFor('aaaaaa111111')}\nreason one`, author_association: 'MEMBER' },
        {
          body: `${dismissMarkerFor('bbbbbb222222')}\nreason two`,
          author_association: 'COLLABORATOR',
        },
      ],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('pass');
  });
});

describe('the escape hatch trusts only push-access commenters', () => {
  it('does not honour a dismissal with no author_association at all', () => {
    expect(collectDismissedFindingIds([{ body: dismissMarkerFor('aaaaaa111111') }])).toEqual(
      new Set()
    );
  });

  it('does not honour a dismissal from a commenter with no repo association', () => {
    expect(
      collectDismissedFindingIds([
        { body: dismissMarkerFor('aaaaaa111111'), author_association: 'NONE' },
      ])
    ).toEqual(new Set());
  });

  it('does not honour a dismissal from a past contributor who is not a current collaborator', () => {
    expect(
      collectDismissedFindingIds([
        { body: dismissMarkerFor('aaaaaa111111'), author_association: 'CONTRIBUTOR' },
      ])
    ).toEqual(new Set());
  });

  it.each(['OWNER', 'MEMBER', 'COLLABORATOR'])('honours a dismissal from a %s', (association) => {
    expect(
      collectDismissedFindingIds([
        { body: dismissMarkerFor('aaaaaa111111'), author_association: association },
      ])
    ).toEqual(new Set(['aaaaaa111111']));
  });

  it('an untrusted dismissal does not block a trusted one for the same id', () => {
    const result = evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [{ id: 'aaaaaa111111', status: 'open', title: 'stale' }],
        }),
        { body: dismissMarkerFor('aaaaaa111111'), author_association: 'NONE' },
        { body: dismissMarkerFor('aaaaaa111111'), author_association: 'OWNER' },
      ],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('pass');
  });

  it('an untrusted-only dismissal still blocks the finding', () => {
    const result = evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [{ id: 'aaaaaa111111', status: 'open', title: 'stale' }],
        }),
        { body: dismissMarkerFor('aaaaaa111111'), author_association: 'NONE' },
      ],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('fail');
  });
});

describe('collectDismissedFindingIds', () => {
  it('round-trips dismissMarkerFor', () => {
    expect(
      collectDismissedFindingIds([
        { body: dismissMarkerFor('abc123def456'), author_association: 'OWNER' },
      ])
    ).toEqual(new Set(['abc123def456']));
  });

  it('ignores a marker whose id is not hex', () => {
    expect(
      collectDismissedFindingIds([
        { body: '<!-- review-findings-gate-dismiss: not-hex! -->', author_association: 'OWNER' },
      ])
    ).toEqual(new Set());
  });

  it('ignores comments with no dismiss marker', () => {
    expect(collectDismissedFindingIds([{ body: 'just a normal comment' }])).toEqual(new Set());
  });
});

describe('findStateComment', () => {
  it('ignores comments with no state marker', () => {
    expect(findStateComment([{ body: 'hello' }, { body: 'world' }])).toBeUndefined();
  });
});

describe('decodeState', () => {
  it('reports a missing state block distinctly from a malformed one', () => {
    expect(decodeState('no marker here').ok).toBe(false);
    expect(decodeState(`<!-- ${STATE_MARKER}: QQQ -->`).ok).toBe(false);
  });

  it('round-trips a well-formed state block', () => {
    const body = stateComment({ last_reviewed_sha: HEAD, findings: [] }).body;
    const decoded = decodeState(body);
    expect(decoded).toEqual({ ok: true, state: { last_reviewed_sha: HEAD, findings: [] } });
  });

  it('accepts a null last_reviewed_sha (a PR the reviewer has never touched)', () => {
    const body = stateComment({ last_reviewed_sha: null, findings: [] }).body;
    expect(decodeState(body)).toEqual({
      ok: true,
      state: { last_reviewed_sha: null, findings: [] },
    });
  });
});

describe('pollForReviewState', () => {
  it('passes immediately when the first look is already clean', async () => {
    const fetchComments = vi
      .fn()
      .mockResolvedValue([stateComment({ last_reviewed_sha: HEAD, findings: [] })]);
    const result = await pollForReviewState({
      fetchComments,
      headSha: HEAD,
      maxWaitMs: 1000,
      pollIntervalMs: 1,
      sleep: () => Promise.resolve(),
    });
    expect(result.outcome).toBe('pass');
    expect(fetchComments).toHaveBeenCalledTimes(1);
  });

  it('retries a transient absence and passes once it clears, proving it actually polled', async () => {
    const fetchComments = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([stateComment({ last_reviewed_sha: HEAD, findings: [] })]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await pollForReviewState({
      fetchComments,
      headSha: HEAD,
      maxWaitMs: 10_000,
      pollIntervalMs: 5,
      sleep,
    });
    expect(result.outcome).toBe('pass');
    expect(fetchComments).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(5);
  });

  it('fails once the wait budget is spent on a permanently absent comment — never passes on timeout', async () => {
    let clock = 0;
    const result = await pollForReviewState({
      fetchComments: () => Promise.resolve([]),
      headSha: HEAD,
      maxWaitMs: 30,
      pollIntervalMs: 10,
      sleep: () => Promise.resolve(),
      now: () => {
        clock += 10;
        return clock;
      },
    });
    expect(result.outcome).toBe('fail');
  });

  it('fails once the wait budget is spent on a permanently stale sha', async () => {
    let clock = 0;
    const result = await pollForReviewState({
      fetchComments: () =>
        Promise.resolve([stateComment({ last_reviewed_sha: 'stale', findings: [] })]),
      headSha: HEAD,
      maxWaitMs: 30,
      pollIntervalMs: 10,
      sleep: () => Promise.resolve(),
      now: () => {
        clock += 10;
        return clock;
      },
    });
    expect(result.outcome).toBe('fail');
  });

  it('fails immediately on a malformed state block, without spending the poll budget', async () => {
    const fetchComments = vi.fn().mockResolvedValue([{ body: `<!-- ${STATE_MARKER}: QQQ -->` }]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await pollForReviewState({
      fetchComments,
      headSha: HEAD,
      maxWaitMs: 10_000,
      pollIntervalMs: 1,
      sleep,
    });
    expect(result.outcome).toBe('fail');
    expect(fetchComments).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('fails immediately on an open finding, without spending the poll budget', async () => {
    const fetchComments = vi
      .fn()
      .mockResolvedValue([
        stateComment({ last_reviewed_sha: HEAD, findings: [{ id: 'f1', status: 'open' }] }),
      ]);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await pollForReviewState({
      fetchComments,
      headSha: HEAD,
      maxWaitMs: 10_000,
      pollIntervalMs: 1,
      sleep,
    });
    expect(result.outcome).toBe('fail');
    expect(fetchComments).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
