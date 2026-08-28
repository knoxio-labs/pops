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
  annotateWithPushAccess,
  collectDismissedFindingIds,
  decodeState,
  dismissMarkerFor,
  evaluateReviewState,
  findStateComment,
  isPushPermission,
  pollForReviewState,
  REVIEWER_LOGIN,
} from '../check-review-findings.mjs';
import { STATE_MARKER } from '../pr-review-state.mjs';

const HEAD = 'a'.repeat(40);

function stateComment(state: unknown): { body: string; user: { login: string } } {
  return {
    body: `## Review\n\n<!-- ${STATE_MARKER}: ${Buffer.from(JSON.stringify(state)).toString('base64')} -->`,
    user: { login: REVIEWER_LOGIN },
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
      comments: [{ body: `<!-- ${STATE_MARKER}: QQQ -->`, user: { login: REVIEWER_LOGIN } }],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('fail');
  });

  it('retries, without throwing, on out-of-charset garbage where base64 should be', () => {
    // The marker itself is unrecognisable here (STATE_RE requires the
    // payload to look like base64), so this is indistinguishable from no
    // sticky comment at all — a retry, same as mode 1, not a hard failure.
    const result = evaluateReviewState({
      comments: [
        { body: `<!-- ${STATE_MARKER}: !!!not-base64!!! -->`, user: { login: REVIEWER_LOGIN } },
      ],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('retry');
  });

  it('fails, without throwing, on valid base64 whose JSON is not the expected shape', () => {
    const notAnObject = evaluateReviewState({
      comments: [
        {
          body: `<!-- ${STATE_MARKER}: ${Buffer.from('"just a string"').toString('base64')} -->`,
          user: { login: REVIEWER_LOGIN },
        },
      ],
      headSha: HEAD,
    });
    expect(notAnObject.outcome).toBe('fail');

    const missingFindings = evaluateReviewState({
      comments: [
        {
          body: `<!-- ${STATE_MARKER}: ${Buffer.from(JSON.stringify({ hello: 'world' })).toString('base64')} -->`,
          user: { login: REVIEWER_LOGIN },
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

  it('is not fooled by a later comment that merely mentions pr-review-state.mjs in prose', () => {
    // Live incident on POPS-2661's own PR: a dismiss comment referencing
    // pr-review-state.mjs by name was picked as the sticky comment by an
    // earlier, substring-based version of findStateComment.
    const realStickyComment = stateComment({ last_reviewed_sha: HEAD, findings: [] });
    const proseOnlyComment = {
      body: 'Dismissing per POPS-2669: see pr-review-state.mjs for the mechanism.',
    };
    const result = evaluateReviewState({
      comments: [realStickyComment, proseOnlyComment],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('pass');
  });

  it('is not fooled by a forged, syntactically valid clean state from a non-reviewer', () => {
    // The more serious sibling of the prose-mention incident, found on the
    // same PR: a comment posted by someone other than the reviewer, but
    // carrying a real, current, well-formed state block claiming zero open
    // findings. This must read exactly like no sticky comment at all
    // (retry), never like a genuine clean pass.
    const forged = stateComment({ last_reviewed_sha: HEAD, findings: [] });
    forged.user = { login: 'not-the-reviewer' };
    const result = evaluateReviewState({ comments: [forged], headSha: HEAD });
    expect(result.outcome).toBe('retry');
  });

  it('does not let a forged clean state suppress the reviewer own open finding', () => {
    const forged = stateComment({ last_reviewed_sha: HEAD, findings: [] });
    forged.user = { login: 'not-the-reviewer' };
    const genuine = stateComment({
      last_reviewed_sha: HEAD,
      findings: [{ id: 'real', status: 'open' }],
    });

    expect(evaluateReviewState({ comments: [forged, genuine], headSha: HEAD }).outcome).toBe(
      'fail'
    );
    expect(evaluateReviewState({ comments: [genuine, forged], headSha: HEAD }).outcome).toBe(
      'fail'
    );
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
        { body: dismissMarkerFor('aaaaaa111111'), push_access: true },
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
        { body: dismissMarkerFor('aaaaaa111111'), push_access: true },
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
        { body: dismissMarkerFor('aaaaaa111111'), push_access: true },
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
        { body: dismissMarkerFor('cccccc333333'), push_access: true },
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
        { body: `${dismissMarkerFor('aaaaaa111111')}\nreason one`, push_access: true },
        {
          body: `${dismissMarkerFor('bbbbbb222222')}\nreason two`,
          push_access: true,
        },
      ],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('pass');
  });
});

describe('the escape hatch trusts only resolved push access, not author_association', () => {
  // author_association was the first version's check and was itself flagged
  // (MEMBER means "in the org", not "has access"; COLLABORATOR fires for
  // Read/Triage too) — push_access is what main's I/O layer resolves via the
  // real collaborator-permission API, and it is the only thing these pure
  // functions ever look at.
  it('does not honour a dismissal with no push_access field at all', () => {
    expect(collectDismissedFindingIds([{ body: dismissMarkerFor('aaaaaa111111') }])).toEqual(
      new Set()
    );
  });

  it('does not honour a dismissal with push_access explicitly false', () => {
    expect(
      collectDismissedFindingIds([{ body: dismissMarkerFor('aaaaaa111111'), push_access: false }])
    ).toEqual(new Set());
  });

  it('honours a dismissal with push_access true', () => {
    expect(
      collectDismissedFindingIds([{ body: dismissMarkerFor('aaaaaa111111'), push_access: true }])
    ).toEqual(new Set(['aaaaaa111111']));
  });

  it('an untrusted dismissal does not block a trusted one for the same id', () => {
    const result = evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [{ id: 'aaaaaa111111', status: 'open', title: 'stale' }],
        }),
        { body: dismissMarkerFor('aaaaaa111111'), push_access: false },
        { body: dismissMarkerFor('aaaaaa111111'), push_access: true },
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
        { body: dismissMarkerFor('aaaaaa111111'), push_access: false },
      ],
      headSha: HEAD,
    });
    expect(result.outcome).toBe('fail');
  });
});

describe('annotateWithPushAccess', () => {
  // Reviewed MEDIUM on this PR's own head: the candidate-selection and
  // merge-by-login logic decides who is allowed to waive a finding and had
  // no coverage of its own.
  it('annotates a candidate comment with what the resolver returns', () => {
    const resolver = vi.fn((login: string) => login === 'trusted-dev');
    const annotated = annotateWithPushAccess(
      [{ body: dismissMarkerFor('aaaaaa111111'), user: { login: 'trusted-dev' } }],
      resolver
    );
    expect(annotated[0]?.push_access).toBe(true);
  });

  it('does not call the resolver for a comment with no dismiss marker', () => {
    const resolver = vi.fn(() => true);
    annotateWithPushAccess(
      [{ body: 'just chatting, no marker here', user: { login: 'anyone' } }],
      resolver
    );
    expect(resolver).not.toHaveBeenCalled();
  });

  it('leaves a comment with no dismiss marker unannotated', () => {
    const annotated = annotateWithPushAccess(
      [{ body: 'just chatting, no marker here', user: { login: 'anyone' } }],
      () => true
    );
    expect(annotated[0]).not.toHaveProperty('push_access');
  });

  it('calls the resolver once per unique login, not once per comment', () => {
    const resolver = vi.fn(() => true);
    annotateWithPushAccess(
      [
        { body: dismissMarkerFor('aaaaaa111111'), user: { login: 'same-dev' } },
        { body: dismissMarkerFor('bbbbbb222222'), user: { login: 'same-dev' } },
      ],
      resolver
    );
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith('same-dev');
  });

  it('resolves different logins independently', () => {
    const annotated = annotateWithPushAccess(
      [
        { body: dismissMarkerFor('aaaaaa111111'), user: { login: 'trusted-dev' } },
        { body: dismissMarkerFor('bbbbbb222222'), user: { login: 'random-passerby' } },
      ],
      (login) => login === 'trusted-dev'
    );
    expect(annotated[0]?.push_access).toBe(true);
    expect(annotated[1]?.push_access).toBe(false);
  });

  it('does not crash and does not grant trust to a comment with no user.login', () => {
    const annotated = annotateWithPushAccess(
      [{ body: dismissMarkerFor('aaaaaa111111') }],
      () => true
    );
    expect(annotated[0]?.push_access).not.toBe(true);
  });
});

describe('isPushPermission', () => {
  // Reviewed MEDIUM on this PR's own head: the classification must be
  // against the real permission API's vocabulary, not author_association.
  it.each(['admin', 'maintain', 'write'])('%s is push access', (permission) => {
    expect(isPushPermission(permission)).toBe(true);
  });

  it.each(['triage', 'read', 'none', 'sudo', ''])('%s is not push access', (permission) => {
    expect(isPushPermission(permission)).toBe(false);
  });
});

describe('collectDismissedFindingIds', () => {
  it('round-trips dismissMarkerFor', () => {
    expect(
      collectDismissedFindingIds([{ body: dismissMarkerFor('abc123def456'), push_access: true }])
    ).toEqual(new Set(['abc123def456']));
  });

  it('ignores a marker whose id is not hex', () => {
    expect(
      collectDismissedFindingIds([
        { body: '<!-- review-findings-gate-dismiss: not-hex! -->', push_access: true },
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

  it('ignores a syntactically valid state block posted by anyone other than the reviewer', () => {
    // Live incident on POPS-2661's own PR, distinct from (but caused by the
    // same bug as) the prose-mention incident: pr-review.yml's own
    // comment-selection step mis-patched a human PR comment so it carried a
    // full, current, `STATE_RE`-matching state block. A regex match alone is
    // forgeable by anyone who can comment on the PR; only the reviewer's own
    // login may supply state.
    const forged = stateComment({ last_reviewed_sha: HEAD, findings: [] });
    forged.user = { login: 'not-the-reviewer' };
    expect(findStateComment([forged])).toBeUndefined();
  });

  it('picks the reviewer comment over a later forged one', () => {
    const real = stateComment({ last_reviewed_sha: HEAD, findings: [] });
    const forged = stateComment({ last_reviewed_sha: HEAD, findings: [{ id: 'x' }] });
    forged.user = { login: 'not-the-reviewer' };
    expect(findStateComment([real, forged])).toBe(real);
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
    const fetchComments = vi
      .fn()
      .mockResolvedValue([
        { body: `<!-- ${STATE_MARKER}: QQQ -->`, user: { login: REVIEWER_LOGIN } },
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
