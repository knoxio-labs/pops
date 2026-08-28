#!/usr/bin/env node
/**
 * Required-check guard: blocks a merge while `pr-review.yml`'s own sticky
 * comment still carries an open finding for the PR's head commit.
 *
 * See POPS-2661. Before this guard, `pr-review.yml` found real defects and
 * wrote them into a comment nothing checked: `Review` was not a required
 * context, findings were comment prose rather than review threads, and
 * `mergeStateStatus` read CLEAN whether the reviewer found nothing, found ten
 * HIGH findings, or never ran. #4289 merged with 3 open findings, 2 of them
 * HIGH, all 62 checks green. The reviewer already publishes machine-readable
 * state in a trailing HTML comment (`<!-- pr-review-state: <base64 JSON> -->`,
 * see `pr-review-state.mjs`); this is the thing that actually reads it.
 *
 * A CHECK THAT PASSES WHEN IT CANNOT TELL is the bug this exists to fix, one
 * level up — so every way this can fail to see a clean, current review is a
 * FAIL, never a silent pass:
 *
 *   1. No sticky comment at all. `pr-review.yml` is `cancel-in-progress: true`
 *      and draft-skipped at job level, so "never ran" is a normal state, not
 *      an edge case.
 *   2. A sticky comment whose `last_reviewed_sha` is not the PR head. The
 *      reviewer debounces ~60s before it even starts, so this is the ORDINARY
 *      state for the first minute or so after every push.
 *   3. A state block that is missing, not valid base64, or valid base64 that
 *      is not the JSON shape expected. Never throws; always reported.
 *
 * Modes 1 and 2 are transient and expected to clear on their own once the
 * debounced reviewer catches up, so {@link pollForReviewState} POLLS for them,
 * bounded by a caller-supplied timeout — that is what keeps this required
 * check PENDING through the ordinary post-push window instead of flashing red
 * on every single push only to go green a minute later. Mode 3 is not
 * transient — a state block that does not parse will not start parsing
 * because we waited — so it fails immediately without spending the poll
 * budget.
 *
 * An open finding also fails immediately: there is nothing to wait for, the
 * review is current and it found something. "Open" here is fail-closed on the
 * status value — anything not the literal string `'resolved'` counts, the
 * same convention `pr-review-state.mjs`'s own writer uses, so a status this
 * guard does not yet recognise blocks rather than silently passing.
 *
 * Two sticky-looking comments should not happen — the reviewer edits one
 * rather than posting a new one — but if it does, the LAST one wins, matching
 * `pr-review.yml`'s own selection (`| last // empty`) so the two halves of
 * this mechanism never disagree about which comment is authoritative.
 *
 * THE ESCAPE HATCH. `pr-review-state.mjs` resolves a finding by checking
 * whether its snippet is still present in the file — POPS-2669 tracks a bug
 * where that check can never go true again: a one-line anchor that also
 * occurs, correctly, in an unrelated branch of the same function means the
 * finding never resolves no matter what the author does. Without a way out,
 * a check that blocks on ANY open finding would wedge a PR permanently on
 * this bug — a worse outcome than the one POPS-2661 exists to fix, because
 * it gets disabled within a day. So a finding can be dismissed by id: a plain
 * PR comment containing
 *
 *   <!-- review-findings-gate-dismiss: <finding-id> -->
 *
 * (plus, by convention, a reason underneath, for whoever reads the PR later)
 * removes that one finding — and only that one, since the id is content-
 * addressed from the finding's file and snippet — from the blocking set. It
 * is deliberately more effort than fixing a real finding: the id is not
 * printed in the reviewer's own comment, only in this guard's OWN failure
 * output (see `main`, below), so dismissing one means reading why it failed
 * first. This is not a general bypass — it dismisses exactly the id named,
 * nothing else, and every dismissal is a plain, timestamped, attributed PR
 * comment, not a silent override. See POPS-2669 for the underlying bug.
 *
 * ONLY A COMMENTER WITH ACTUAL PUSH ACCESS CAN DISMISS — reviewed twice on
 * this PR's own head. The first pass checked GitHub's `author_association`
 * (`OWNER`/`MEMBER`/`COLLABORATOR`) and was itself flagged as insufficient:
 * `MEMBER` means "belongs to the org", not "has access" (the org's default
 * repo permission can be none), and `COLLABORATOR` fires for a collaborator
 * granted Read or Triage, not only Write/Maintain/Admin. So this checks the
 * real thing — `GET /repos/{repo}/collaborators/{login}/permission` — for
 * every commenter who posted a dismiss marker, and trusts only
 * `admin`/`maintain`/`write` (see `hasPushAccess`, in `main`, below). Without
 * either check, ANY commenter on the PR could waive a genuine finding and
 * reopen the #4289 hole this gate exists to close, just via a self-service
 * mechanism instead of an oversight. `evaluateReviewState`/
 * `collectDismissedFindingIds` stay pure and never make that call themselves
 * — they trust the `push_access` boolean already resolved onto each comment
 * by the I/O layer, which is what keeps them fast to test without a real
 * GitHub token.
 *
 * Stdlib only, deliberately: see `pr-review-state.mjs` and the tier amendment
 * in docs/architecture/adr-045-guards-must-prove-they-report.md, enforced by
 * scripts/ci/__tests__/guard-job-tiers.test.ts. `STATE_MARKER` is imported
 * from that module so the two halves of this mechanism cannot drift apart on
 * the marker string; the decoding here is deliberately its own, stricter
 * implementation — `pr-review-state.mjs`'s own `parseState` degrades a
 * malformed block to empty state so the REVIEWER never crashes on its own
 * corrupted bookkeeping, but that would make mode 3 above indistinguishable
 * from "reviewed nothing yet" here, which is exactly the fail-open this guard
 * exists to refuse.
 *
 * Usage:
 *   node scripts/ci/check-review-findings.mjs --repo <owner/name> --pr <n> \
 *     --head <sha> [--max-wait-seconds <n>] [--poll-interval-seconds <n>]
 *   node scripts/ci/check-review-findings.mjs --self-test
 *
 * Exit 0 = clean and current. Exit 1 = open findings, stuck stale/absent past
 * the wait budget, malformed state, or self-test failure. Exit 2 = usage
 * error.
 */

import { execFileSync } from 'node:child_process';

import { STATE_MARKER } from './pr-review-state.mjs';

const STATE_RE = new RegExp(`<!--\\s*${STATE_MARKER}:\\s*([A-Za-z0-9+/=]+)\\s*-->`, 'u');

/** See the file header's "THE ESCAPE HATCH" section and POPS-2669. */
const DISMISS_MARKER = 'review-findings-gate-dismiss';
const DISMISS_RE = new RegExp(`<!--\\s*${DISMISS_MARKER}:\\s*([0-9a-f]{6,64})\\s*-->`, 'gu');

/**
 * The marker text to dismiss one finding, ready to paste into a PR comment.
 *
 * @param {string} findingId
 * @returns {string}
 */
export function dismissMarkerFor(findingId) {
  return `<!-- ${DISMISS_MARKER}: ${findingId} -->`;
}

/**
 * Every finding id anyone has dismissed anywhere in the PR's comments.
 *
 * Scans every comment, not just the sticky one — a dismissal is an ordinary,
 * separate PR comment, timestamped and attributed like any other, precisely
 * so it is an auditable human decision rather than bookkeeping this guard (or
 * the reviewer) owns. More than one dismissal comment, or more than one
 * marker in one comment, all accumulate; nothing here un-dismisses an id
 * once dismissed in this PR's history.
 *
 * @param {StickyComment[]} comments
 * @returns {Set<string>}
 */
export function collectDismissedFindingIds(comments) {
  /** @type {Set<string>} */
  const dismissed = new Set();
  for (const comment of comments) {
    if (typeof comment.body !== 'string') continue;
    // A dismiss marker from a commenter this hasn't been told has push
    // access is not read at all — not "read and logged as untrusted", not
    // "read and ignored later" — because the only thing that makes this
    // escape hatch safe rather than a public bypass is that this check never
    // even looks at what an untrusted commenter wrote here. Strict `=== true`
    // so an absent (never-checked) or explicitly-`false` value both count as
    // untrusted, never a default-trust fallback.
    if (comment.push_access !== true) continue;
    for (const match of comment.body.matchAll(DISMISS_RE)) {
      if (match[1]) dismissed.add(match[1]);
    }
  }
  return dismissed;
}

/**
 * @typedef {object} StickyComment
 * @property {string} body
 * @property {boolean} [push_access] Whether the commenter has actual
 *   admin/maintain/write permission on this repo, as resolved by `main`'s I/O
 *   layer via the GitHub collaborator-permission API — never derived in here
 *   from `author_association`, which does not reliably imply push access
 *   (see the file header). Absent (not merely `false`) for a comment nobody
 *   has checked, which {@link collectDismissedFindingIds} also treats as
 *   untrusted — the property only ever grants trust when explicitly `true`.
 * @property {{ login?: string }} [user]
 */

/**
 * Pick the sticky review comment out of a PR's issue comments.
 *
 * Matches the actual `<!-- pr-review-state: ... -->` HTML comment (via
 * `STATE_RE`), not a bare substring of the word "pr-review-state" — found
 * live on this PR's own head: a dismiss comment (see "THE ESCAPE HATCH"
 * above) that merely *talks about* `pr-review-state.mjs` in prose was picked
 * as the sticky comment by an earlier, looser version of this function
 * (`body.includes(STATE_MARKER)`, matching `pr-review.yml`'s own "fetch the
 * existing review comment" step), and decoding it then failed with "no
 * pr-review-state block" — a self-inflicted false failure, not a real one.
 * `pr-review.yml`'s bash step has the identical looseness; this function
 * does not, because a false match here is a spurious FAIL rather than a
 * spurious full re-review, which is the more expensive of the two mistakes
 * to make silently.
 *
 * The reviewer maintains exactly one comment carrying the real marker; if
 * more than one is somehow present, the last wins, matching that step's own
 * tie-break (`| last // empty`).
 *
 * @param {StickyComment[]} comments
 * @returns {StickyComment | undefined}
 */
export function findStateComment(comments) {
  const matches = comments.filter((c) => typeof c.body === 'string' && STATE_RE.test(c.body));
  return matches.length > 0 ? matches[matches.length - 1] : undefined;
}

/**
 * @typedef {object} DecodedFinding
 * @property {string} [id]
 * @property {string} [file]
 * @property {string} [title]
 * @property {string} [severity]
 * @property {string} status
 *
 * @typedef {object} DecodedState
 * @property {string | null} last_reviewed_sha
 * @property {DecodedFinding[]} findings
 */

/**
 * Decode and validate a sticky comment's trailing state block.
 *
 * Deliberately strict: a shape this cannot fully validate is `{ ok: false }`,
 * never a best-effort reading. Nothing here throws — every failure path
 * returns a value instead — because a crash and a silent pass are the same
 * mistake from the required-check's point of view: both leave the finding
 * unread.
 *
 * @param {string} body
 * @returns {{ ok: true, state: DecodedState } | { ok: false, error: string }}
 */
export function decodeState(body) {
  const match = STATE_RE.exec(body);
  if (!match?.[1]) {
    return { ok: false, error: `comment body has no \`${STATE_MARKER}\` block` };
  }

  // `Buffer.from(…, 'base64')` never throws — it decodes whatever bytes the
  // input yields, however short or non-canonical, so an invalid payload is
  // only made visible by `JSON.parse` just below, not by this call.
  const json = Buffer.from(match[1], 'base64').toString('utf8');

  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return { ok: false, error: `state block is not valid JSON: ${describeError(error)}` };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'state block is not a JSON object' };
  }
  const record = /** @type {Record<string, unknown>} */ (parsed);
  if (record.last_reviewed_sha !== null && typeof record.last_reviewed_sha !== 'string') {
    return { ok: false, error: 'state block has no string (or null) `last_reviewed_sha`' };
  }
  if (!Array.isArray(record.findings)) {
    return { ok: false, error: 'state block has no `findings` array' };
  }
  for (const [index, finding] of record.findings.entries()) {
    if (typeof finding !== 'object' || finding === null || Array.isArray(finding)) {
      return { ok: false, error: `findings[${index}] is not an object` };
    }
    if (typeof (/** @type {Record<string, unknown>} */ (finding).status) !== 'string') {
      return { ok: false, error: `findings[${index}] has no string \`status\`` };
    }
  }

  return {
    ok: true,
    state: {
      last_reviewed_sha: record.last_reviewed_sha,
      findings: /** @type {DecodedFinding[]} */ (record.findings),
    },
  };
}

/** @param {unknown} error */
function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @typedef {{ outcome: 'pass', dismissed?: DecodedFinding[] }} PassResult
 * @typedef {{ outcome: 'retry', reason: string }} RetryResult
 * @typedef {{ outcome: 'fail', reason: string, findings?: DecodedFinding[], dismissed?: DecodedFinding[] }} FailResult
 */

/**
 * The single decision this whole guard exists to make, given the comments
 * already fetched for one PR.
 *
 * `outcome: 'retry'` is reserved for the two ordinary post-push states
 * (POPS-2661 modes 1 and 2); everything else this cannot make sense of is
 * `'fail'`, never `'pass'` — see the file header. A finding whose id has been
 * dismissed (see "THE ESCAPE HATCH" above and POPS-2669) is excluded from
 * what blocks, but is always reported back on `dismissed` — on a pass too —
 * so a dismissal that is silently doing nothing (the id never matched) or
 * silently doing a lot (several findings waived) is visible either way.
 *
 * @param {{ comments: StickyComment[], headSha: string }} args
 * @returns {PassResult | RetryResult | FailResult}
 */
export function evaluateReviewState({ comments, headSha }) {
  const comment = findStateComment(comments);
  if (!comment) {
    return {
      outcome: 'retry',
      reason: 'no reviewer comment found yet (the reviewer has not run, or is still mid-run)',
    };
  }

  const decoded = decodeState(comment.body);
  if (!decoded.ok) {
    return {
      outcome: 'fail',
      reason: `the reviewer's comment carries a state block that could not be read: ${decoded.error}`,
    };
  }

  if (decoded.state.last_reviewed_sha !== headSha) {
    return {
      outcome: 'retry',
      reason:
        `the reviewer last reviewed \`${decoded.state.last_reviewed_sha ?? '(never)'}\`, ` +
        `which is not the PR head \`${headSha}\``,
    };
  }

  // Fail-closed on the status value itself, matching how `pr-review-state.mjs`
  // writes it: that module treats anything not exactly `'resolved'` as open
  // (`f.status === 'resolved' ? 'resolved' : 'open'`). Filtering here on the
  // literal `'open'` instead would silently pass a typo, a future status this
  // guard does not yet know about, or corrupted-but-still-string-valued data —
  // exactly the fail-open this guard exists to refuse (POPS-2661 review).
  const everOpen = decoded.state.findings.filter((f) => f.status !== 'resolved');

  const dismissedIds = collectDismissedFindingIds(comments);
  const dismissed = everOpen.filter((f) => f.id !== undefined && dismissedIds.has(f.id));
  const open = everOpen.filter((f) => !(f.id !== undefined && dismissedIds.has(f.id)));

  if (open.length > 0) {
    return {
      outcome: 'fail',
      reason: 'the reviewer has open findings against this head',
      findings: open,
      ...(dismissed.length > 0 ? { dismissed } : {}),
    };
  }

  return { outcome: 'pass', ...(dismissed.length > 0 ? { dismissed } : {}) };
}

/**
 * Poll {@link evaluateReviewState} until it passes, fails for a durable
 * reason, or the wait budget runs out.
 *
 * The clock and the sleep are injected so this is testable without a real
 * timer — see `__tests__/check-review-findings.test.ts`.
 *
 * @param {{
 *   fetchComments: () => Promise<StickyComment[]>,
 *   headSha: string,
 *   maxWaitMs: number,
 *   pollIntervalMs: number,
 *   sleep: (ms: number) => Promise<void>,
 *   now?: () => number,
 *   onRetry?: (reason: string) => void,
 * }} args
 * @returns {Promise<PassResult | FailResult>}
 */
export async function pollForReviewState({
  fetchComments,
  headSha,
  maxWaitMs,
  pollIntervalMs,
  sleep,
  now = Date.now,
  onRetry = () => {},
}) {
  const deadline = now() + maxWaitMs;
  for (;;) {
    const comments = await fetchComments();
    const result = evaluateReviewState({ comments, headSha });
    if (result.outcome !== 'retry') return result;
    if (now() >= deadline) {
      return {
        outcome: 'fail',
        reason: `timed out after ${Math.round(maxWaitMs / 1000)}s waiting for a current, clean review: ${result.reason}`,
      };
    }
    onRetry(result.reason);
    await sleep(pollIntervalMs);
  }
}

/**
 * Every guard here ships a self-test that PROVES it reports, per ADR-045 —
 * not merely that it exists. Each case below plants a violating or degenerate
 * input and asserts the specific outcome it must produce; a self-test that
 * only exercises the clean-pass path would prove this guard is loud when it
 * can see, not that it can see.
 *
 * @returns {Promise<boolean>}
 */
export async function selfTest() {
  /** @type {string[]} */
  const failures = [];
  /** @param {string} label @param {boolean} ok */
  const check = (label, ok) => {
    if (!ok) failures.push(label);
  };

  const HEAD = 'a'.repeat(40);

  const stateComment = (state) => ({
    body: `## Review\n\n<!-- ${STATE_MARKER}: ${Buffer.from(JSON.stringify(state)).toString('base64')} -->`,
  });

  // Ticket test 1: one open finding fails, and names the finding.
  const openResult = evaluateReviewState({
    comments: [
      stateComment({
        last_reviewed_sha: HEAD,
        findings: [{ id: 'f1', status: 'open', title: 'bad' }],
      }),
    ],
    headSha: HEAD,
  });
  check('an open finding fails', openResult.outcome === 'fail');
  check(
    'a failure names the finding',
    openResult.outcome === 'fail' && (openResult.findings ?? []).some((f) => f.id === 'f1')
  );

  // Ticket test 2: every finding resolved passes.
  const resolvedResult = evaluateReviewState({
    comments: [
      stateComment({
        last_reviewed_sha: HEAD,
        findings: [{ id: 'f1', status: 'resolved', title: 'was bad' }],
      }),
    ],
    headSha: HEAD,
  });
  check('all-resolved findings pass', resolvedResult.outcome === 'pass');

  // Fail-closed on the status value: a typo, a future status this guard does
  // not know about, or anything else that is not the literal `'resolved'`
  // blocks, exactly like `pr-review-state.mjs`'s own writer treats it as open.
  const unknownStatusResult = evaluateReviewState({
    comments: [
      stateComment({ last_reviewed_sha: HEAD, findings: [{ id: 'f1', status: 'flagged' }] }),
    ],
    headSha: HEAD,
  });
  check(
    'an unrecognised status value blocks rather than silently passing',
    unknownStatusResult.outcome === 'fail'
  );

  // Ticket test 3: empty findings passes.
  const emptyResult = evaluateReviewState({
    comments: [stateComment({ last_reviewed_sha: HEAD, findings: [] })],
    headSha: HEAD,
  });
  check('no findings passes', emptyResult.outcome === 'pass');

  // Ticket test 4: no comment present fails (as a retry, not a silent pass —
  // the CLI's poll loop turns an unresolved retry into a failure once the
  // wait budget is spent; a bare eval must never call this a pass).
  const noCommentResult = evaluateReviewState({ comments: [], headSha: HEAD });
  check('no sticky comment does not pass', noCommentResult.outcome !== 'pass');
  check('no sticky comment is a retry, not a hard fail', noCommentResult.outcome === 'retry');

  // Ticket test 5: comment present, last_reviewed_sha behind head fails (also
  // a retry — this is the ordinary state right after every push).
  const staleResult = evaluateReviewState({
    comments: [stateComment({ last_reviewed_sha: 'b'.repeat(40), findings: [] })],
    headSha: HEAD,
  });
  check('a stale last_reviewed_sha does not pass', staleResult.outcome !== 'pass');
  check('a stale last_reviewed_sha is a retry, not a hard fail', staleResult.outcome === 'retry');

  // Ticket test 6a: base64 that is not valid — out-of-charset garbage where
  // the payload should be — does not throw. `findStateComment` requires the
  // capture to look like base64 at all (see its docstring, and the live
  // POPS-2661-review incident it documents), so this is indistinguishable
  // from "no sticky comment posted yet" and correctly retries rather than
  // hard-failing: retrying cannot fix a genuinely absent comment, but it
  // also cannot be told apart from one that merely looks absent because its
  // payload is unrecognisable.
  const badBase64 = { body: `<!-- ${STATE_MARKER}: !!!not-base64!!! -->` };
  let badBase64Result;
  let threw = false;
  try {
    badBase64Result = evaluateReviewState({ comments: [badBase64], headSha: HEAD });
  } catch {
    threw = true;
  }
  check('out-of-charset garbage does not throw', !threw);
  check(
    'out-of-charset garbage is not distinguishable from no comment (retry, not pass)',
    badBase64Result?.outcome === 'retry'
  );

  // The narrower, realistic case: characters that are all individually valid
  // base64 alphabet (so the marker IS recognised, unlike `!!!not-base64!!!`
  // above) but decode to bytes that are not JSON at all — this is the shape
  // real corruption would actually take, since `encodeState` only ever
  // emits the base64 alphabet.
  const shortBase64 = { body: `<!-- ${STATE_MARKER}: QQQ -->` };
  check(
    'base64 that is charset-valid but decodes to non-JSON fails durably, not throws',
    evaluateReviewState({ comments: [shortBase64], headSha: HEAD }).outcome === 'fail'
  );

  // Ticket test 6b: valid base64 that is not the expected JSON shape fails,
  // and does not throw.
  const wrongShape = {
    body: `<!-- ${STATE_MARKER}: ${Buffer.from(JSON.stringify({ hello: 'world' })).toString('base64')} -->`,
  };
  let wrongShapeResult;
  threw = false;
  try {
    wrongShapeResult = evaluateReviewState({ comments: [wrongShape], headSha: HEAD });
  } catch {
    threw = true;
  }
  check('wrong-shape JSON does not throw', !threw);
  check('wrong-shape JSON fails (durably, not a retry)', wrongShapeResult?.outcome === 'fail');

  // Not JSON at all, still valid base64 — the other half of "valid base64,
  // wrong shape": this one is not even an object.
  const notJson = {
    body: `<!-- ${STATE_MARKER}: ${Buffer.from('"just a string"').toString('base64')} -->`,
  };
  check(
    'non-object JSON fails, not throws',
    evaluateReviewState({ comments: [notJson], headSha: HEAD }).outcome === 'fail'
  );

  // A finding missing its `status` field is exactly as unreadable as a
  // missing findings array — report, do not guess a default.
  const missingStatus = {
    body: `<!-- ${STATE_MARKER}: ${Buffer.from(JSON.stringify({ last_reviewed_sha: HEAD, findings: [{ id: 'f1' }] })).toString('base64')} -->`,
  };
  check(
    'a finding with no status fails rather than being assumed resolved',
    evaluateReviewState({ comments: [missingStatus], headSha: HEAD }).outcome === 'fail'
  );

  // Ticket test 7: two sticky-looking comments — the last one is
  // authoritative, matching pr-review.yml's own `| last // empty` selection.
  const twoComments = [
    stateComment({
      last_reviewed_sha: HEAD,
      findings: [{ id: 'stale', status: 'open', title: 'old' }],
    }),
    stateComment({ last_reviewed_sha: HEAD, findings: [] }),
  ];
  check(
    'the later of two sticky comments wins',
    evaluateReviewState({ comments: twoComments, headSha: HEAD }).outcome === 'pass'
  );

  // Live incident on POPS-2661's own PR: a LATER comment that merely talks
  // about `pr-review-state.mjs` in prose (a dismiss comment, in the real
  // case) must not be mistaken for the sticky comment just because it
  // contains that substring — the real sticky comment, however much
  // earlier, still wins.
  const realStickyComment = stateComment({ last_reviewed_sha: HEAD, findings: [] });
  const proseOnlyComment = {
    body: 'Dismissing per POPS-2669: see pr-review-state.mjs for the mechanism.',
  };
  check(
    'a later comment merely mentioning pr-review-state.mjs in prose is not mistaken for the sticky one',
    evaluateReviewState({
      comments: [realStickyComment, proseOnlyComment],
      headSha: HEAD,
    }).outcome === 'pass'
  );

  // THE ESCAPE HATCH (POPS-2669): dismissing a finding by id removes it from
  // what blocks, and only that id.
  const twoOpenFindings = stateComment({
    last_reviewed_sha: HEAD,
    findings: [
      { id: 'aaaaaa111111', status: 'open', title: 'a stale finding' },
      { id: 'bbbbbb222222', status: 'open', title: 'a real one' },
    ],
  });
  const dismissedOnly = evaluateReviewState({
    comments: [twoOpenFindings, { body: dismissMarkerFor('aaaaaa111111'), push_access: true }],
    headSha: HEAD,
  });
  check(
    'dismissing the only open finding passes',
    evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [{ id: 'aaaaaa111111', status: 'open', title: 'a stale finding' }],
        }),
        { body: dismissMarkerFor('aaaaaa111111'), push_access: true },
      ],
      headSha: HEAD,
    }).outcome === 'pass'
  );
  check(
    'dismissing one finding does not silently waive a different, still-open one',
    dismissedOnly.outcome === 'fail' &&
      (dismissedOnly.findings ?? []).length === 1 &&
      dismissedOnly.findings?.[0]?.id === 'bbbbbb222222'
  );
  check(
    'a dismissed finding is reported back, not just silently dropped',
    (dismissedOnly.dismissed ?? []).some((f) => f.id === 'aaaaaa111111')
  );
  check(
    'a dismiss marker for an id that never appears is a harmless no-op',
    evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [{ id: 'bbbbbb222222', status: 'open', title: 'a real one' }],
        }),
        { body: dismissMarkerFor('cccccc333333'), push_access: true },
      ],
      headSha: HEAD,
    }).outcome === 'fail'
  );
  check(
    'dismissMarkerFor output round-trips through collectDismissedFindingIds',
    collectDismissedFindingIds([{ body: dismissMarkerFor('abc123def456'), push_access: true }]).has(
      'abc123def456'
    )
  );
  check(
    'garbage where a dismiss id should be is ignored, not matched',
    !collectDismissedFindingIds([
      { body: '<!-- review-findings-gate-dismiss: not-hex! -->', push_access: true },
    ]).has('not-hex!')
  );

  // Reviewed twice HIGH/MEDIUM on this PR's own head: a commenter this
  // guard has not been told has real push access must never be able to
  // waive a finding, or the escape hatch is a public bypass. `push_access`
  // is what `main`'s I/O layer resolves via the real collaborator-permission
  // API — never `author_association`, which does not reliably imply it.
  check(
    'a dismiss marker with push_access explicitly false is not honoured',
    !collectDismissedFindingIds([
      { body: dismissMarkerFor('aaaaaa111111'), push_access: false },
    ]).has('aaaaaa111111')
  );
  check(
    'a dismiss marker with no push_access field at all is not honoured',
    !collectDismissedFindingIds([{ body: dismissMarkerFor('aaaaaa111111') }]).has('aaaaaa111111')
  );
  check(
    'a dismiss marker is only honoured when push_access is strictly true',
    collectDismissedFindingIds([{ body: dismissMarkerFor('aaaaaa111111'), push_access: true }]).has(
      'aaaaaa111111'
    )
  );
  check(
    'an untrusted dismissal does not block a trusted one for the same id',
    evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [{ id: 'aaaaaa111111', status: 'open', title: 'stale' }],
        }),
        { body: dismissMarkerFor('aaaaaa111111'), push_access: false },
        { body: dismissMarkerFor('aaaaaa111111'), push_access: true },
      ],
      headSha: HEAD,
    }).outcome === 'pass'
  );
  check(
    'an untrusted-only dismissal still blocks',
    evaluateReviewState({
      comments: [
        stateComment({
          last_reviewed_sha: HEAD,
          findings: [{ id: 'aaaaaa111111', status: 'open', title: 'stale' }],
        }),
        { body: dismissMarkerFor('aaaaaa111111'), push_access: false },
      ],
      headSha: HEAD,
    }).outcome === 'fail'
  );

  // The MEDIUM finding reviewed on this PR's own head: `author_association`
  // values like MEMBER/COLLABORATOR do not reliably mean push access, so the
  // classification must be against the real permission API's own vocabulary.
  check('admin permission is push access', isPushPermission('admin'));
  check('maintain permission is push access', isPushPermission('maintain'));
  check('write permission is push access', isPushPermission('write'));
  check('triage permission is not push access', !isPushPermission('triage'));
  check('read permission is not push access', !isPushPermission('read'));
  check('none permission is not push access', !isPushPermission('none'));
  check('a garbage permission string is not push access', !isPushPermission('sudo'));

  // annotateWithPushAccess: reviewed MEDIUM on this PR's own head — the
  // candidate-selection and merge-by-login logic had no test coverage at
  // all, despite deciding who is allowed to waive a finding.
  const resolverCalls = [];
  const fakeResolver = (login) => {
    resolverCalls.push(login);
    return login === 'trusted-dev';
  };
  const untouchedComment = { body: 'no marker here at all', user: { login: 'never-dismisses' } };
  const dismissFromTrusted = {
    body: dismissMarkerFor('aaaaaa111111'),
    user: { login: 'trusted-dev' },
  };
  const dismissFromUntrusted = {
    body: dismissMarkerFor('bbbbbb222222'),
    user: { login: 'random-passerby' },
  };
  const dismissFromTrustedAgain = {
    body: dismissMarkerFor('cccccc333333'),
    user: { login: 'trusted-dev' },
  };
  const annotated = annotateWithPushAccess(
    [untouchedComment, dismissFromTrusted, dismissFromUntrusted, dismissFromTrustedAgain],
    fakeResolver
  );
  check(
    'a comment with no dismiss marker is never sent to the resolver',
    !resolverCalls.includes('never-dismisses')
  );
  check(
    'the resolver is called once per unique candidate login, not once per comment',
    resolverCalls.filter((login) => login === 'trusted-dev').length === 1
  );
  check(
    'a trusted login is annotated push_access: true',
    annotated[1]?.push_access === true && annotated[3]?.push_access === true
  );
  check('an untrusted login is annotated push_access: false', annotated[2]?.push_access === false);
  check(
    'a comment with no dismiss marker is left otherwise unannotated',
    !('push_access' in annotated[0])
  );
  const noLoginComment = { body: dismissMarkerFor('dddddd444444') };
  const withMissingLogin = annotateWithPushAccess([noLoginComment], fakeResolver);
  check(
    'a comment with no user.login at all does not crash and is not trusted',
    withMissingLogin[0]?.push_access !== true
  );

  // pollForReviewState: a transient retry that clears within budget passes,
  // and is proven to have actually retried rather than passing on the first
  // look.
  let pollAttempts = 0;
  const clearsInTime = () => {
    pollAttempts += 1;
    return Promise.resolve(
      pollAttempts >= 3 ? [stateComment({ last_reviewed_sha: HEAD, findings: [] })] : []
    );
  };
  const eventualPass = await pollForReviewState({
    fetchComments: clearsInTime,
    headSha: HEAD,
    maxWaitMs: 10_000,
    pollIntervalMs: 1,
    sleep: () => Promise.resolve(),
  });
  check('a transient absence clears within the wait budget', eventualPass.outcome === 'pass');
  check('clearing within budget actually polled more than once', pollAttempts >= 3);

  // pollForReviewState: a retry that never clears fails once the budget is
  // spent — proving the guard does not wait forever and does not pass on
  // timeout, which is the fail-open this whole guard exists to refuse.
  let clock = 0;
  const neverClears = () => Promise.resolve([]);
  const timedOut = await pollForReviewState({
    fetchComments: neverClears,
    headSha: HEAD,
    maxWaitMs: 30,
    pollIntervalMs: 10,
    sleep: () => Promise.resolve(),
    now: () => {
      clock += 10;
      return clock;
    },
  });
  check(
    'a permanently absent comment fails once the wait budget is spent',
    timedOut.outcome === 'fail'
  );

  // A durable failure (malformed state) must not spend the poll budget —
  // proven by asserting fetchComments was called exactly once, not repeatedly
  // until timeout.
  let malformedCalls = 0;
  const malformedForever = () => {
    malformedCalls += 1;
    return Promise.resolve([shortBase64]);
  };
  const malformedTimedOut = await pollForReviewState({
    fetchComments: malformedForever,
    headSha: HEAD,
    maxWaitMs: 10_000,
    pollIntervalMs: 1,
    sleep: () => Promise.resolve(),
  });
  check('a malformed state block fails immediately', malformedTimedOut.outcome === 'fail');
  check('a malformed state block does not spend the poll budget', malformedCalls === 1);

  for (const failure of failures) console.error(`  FAIL ${failure}`);
  if (failures.length > 0) {
    console.error(`self-test: ${failures.length} of the guard's invariants no longer hold.`);
    return false;
  }
  console.log('self-test OK — open/resolved/empty/absent/stale/malformed all resolve correctly.');
  return true;
}

/** @param {string} message */
function usage(message) {
  console.error(`check-review-findings: ${message}`);
  console.error(
    'Usage:\n' +
      '  node scripts/ci/check-review-findings.mjs --repo <owner/name> --pr <n> --head <sha> ' +
      '[--max-wait-seconds <n>] [--poll-interval-seconds <n>]\n' +
      '  node scripts/ci/check-review-findings.mjs --self-test'
  );
  process.exit(2);
}

/**
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
function parseFlags(argv) {
  /** @type {Record<string, string>} */
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg?.startsWith('--')) usage(`unexpected argument \`${arg}\``);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) usage(`\`${arg}\` needs a value`);
    opts[arg.slice(2)] = value;
    i += 1;
  }
  return opts;
}

/**
 * Fetch every issue comment on a PR via the `gh` CLI, which every GitHub-
 * hosted runner already carries — the same tool `pr-review.yml`'s own
 * "fetch the existing review comment" step shells out to, for the same
 * reason: no third-party HTTP or auth handling to get subtly wrong in a
 * Tier A script. `--paginate --slurp` is `gh`'s own documented way to collect
 * every page into one array rather than filtering page-by-page, which
 * `pr-review.yml`'s header notes is required precisely because filtering per
 * page can miss the sticky comment on a PR with more than one page of
 * comments.
 *
 * @param {string} repo
 * @param {string} pr
 * @returns {Promise<StickyComment[]>}
 */
async function fetchIssueComments(repo, pr) {
  const raw = execFileSync(
    'gh',
    ['api', '--paginate', '--slurp', `repos/${repo}/issues/${pr}/comments`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  /** @type {unknown[][]} */
  const pages = JSON.parse(raw);
  return annotateWithPushAccess(/** @type {StickyComment[]} */ (pages.flat()), (login) =>
    hasPushAccess(repo, login)
  );
}

/** Permission levels the collaborator-permission API reports that mean push access. */
const PUSH_PERMISSIONS = new Set(['admin', 'maintain', 'write']);

/**
 * Ask GitHub whether `login` genuinely has push access to `repo`, via the
 * one API built to answer exactly that (`author_association` does not — see
 * the file header). Failure of any kind (rate limit, a login GitHub cannot
 * resolve, a transient network error) resolves to `false`: an unresolved
 * permission is not a resolved "yes" wearing a different name.
 *
 * @param {string} repo
 * @param {string} login
 * @returns {boolean}
 */
function hasPushAccess(repo, login) {
  try {
    const permission = execFileSync(
      'gh',
      ['api', `repos/${repo}/collaborators/${login}/permission`, '--jq', '.permission'],
      { encoding: 'utf8' }
    ).trim();
    return isPushPermission(permission);
  } catch {
    return false;
  }
}

/**
 * Does this permission level (as the collaborator-permission API reports it)
 * mean push access? Split out from {@link hasPushAccess} so the
 * admin/maintain/write-vs-triage/read/none decision is unit-testable without
 * a real GitHub call — the network round trip is the part worth trusting to
 * an integration environment, not this classification.
 *
 * @param {string} permission
 * @returns {boolean}
 */
export function isPushPermission(permission) {
  return PUSH_PERMISSIONS.has(permission);
}

/**
 * Resolve `push_access` on every comment that a candidate dismissal could
 * come from, so the pure functions above never have to make a network call
 * to answer "is this trusted".
 *
 * Only commenters who actually posted something that looks like a dismiss
 * marker are checked — one call to `resolvePushAccess` per unique such
 * login, not per comment and not for the (usually much larger) set of
 * commenters who never tried to dismiss anything, and never twice for the
 * same login even if they posted several dismiss comments.
 *
 * `resolvePushAccess` is injected — reviewed MEDIUM on this PR's own head:
 * this candidate-selection and merge-by-login logic is exactly what decides
 * who is allowed to waive a review finding, so it needs the same test
 * coverage as `isPushPermission` and `collectDismissedFindingIds`, and it
 * cannot get that while it also makes a real GitHub call. Only `main` wires
 * the real `hasPushAccess`; every test below supplies a fake.
 *
 * @param {StickyComment[]} comments
 * @param {(login: string) => boolean} resolvePushAccess
 * @returns {StickyComment[]}
 */
export function annotateWithPushAccess(comments, resolvePushAccess) {
  /** @type {Set<string>} */
  const candidateLogins = new Set();
  for (const comment of comments) {
    const login = comment.user?.login;
    if (login && typeof comment.body === 'string' && comment.body.includes(DISMISS_MARKER)) {
      candidateLogins.add(login);
    }
  }
  /** @type {Map<string, boolean>} */
  const pushAccessByLogin = new Map();
  for (const login of candidateLogins) {
    pushAccessByLogin.set(login, resolvePushAccess(login));
  }
  return comments.map((comment) => {
    const login = comment.user?.login;
    return login && pushAccessByLogin.has(login)
      ? { ...comment, push_access: pushAccessByLogin.get(login) }
      : comment;
  });
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) {
    const ok = await selfTest();
    process.exit(ok ? 0 : 1);
  }

  const opts = parseFlags(argv);
  const repo = opts.repo;
  const pr = opts.pr;
  const head = opts.head;
  if (!repo || !pr || !head) usage('`--repo`, `--pr` and `--head` are all required');
  const maxWaitMs = Number(opts['max-wait-seconds'] ?? 600) * 1000;
  const pollIntervalMs = Number(opts['poll-interval-seconds'] ?? 15) * 1000;
  if (!Number.isFinite(maxWaitMs) || maxWaitMs < 0)
    usage('`--max-wait-seconds` must be a number >= 0');
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
    usage('`--poll-interval-seconds` must be a number > 0');
  }

  const result = await pollForReviewState({
    fetchComments: () => fetchIssueComments(repo, pr),
    headSha: head,
    maxWaitMs,
    pollIntervalMs,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onRetry: (reason) => console.log(`Waiting for the reviewer: ${reason}`),
  });

  for (const finding of result.dismissed ?? []) {
    console.log(
      `Dismissed via ${dismissMarkerFor(finding.id ?? '?')}: ${finding.file ?? ''}: ${finding.title ?? ''}`
    );
  }

  if (result.outcome === 'pass') {
    console.log('No open findings; the reviewer is current with the PR head.');
    return;
  }

  console.error('::error::Open review findings block this merge.');
  console.error(result.reason);
  for (const finding of result.findings ?? []) {
    console.error(
      `- [${finding.severity ?? 'unknown'}] ${finding.id ?? '?'} ${finding.file ?? ''}: ${finding.title ?? ''}`
    );
    console.error(
      `  believed stale (POPS-2669)? dismiss with: ${dismissMarkerFor(finding.id ?? '?')}`
    );
  }
  process.exitCode = 1;
}

if (import.meta.main) {
  await main();
}

export { fetchIssueComments };
