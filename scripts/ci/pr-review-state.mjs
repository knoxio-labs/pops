/**
 * Durable state for the compounding PR reviewer.
 *
 * The reviewer runs once per push. Without state it would re-report the same
 * findings every run, which is the failure mode that makes automated review
 * unreadable — and the one the reviewer this replaced had, posting a fresh
 * advisory comment per push with no memory of the previous one. This module
 * carries findings across runs, keyed by an identity that survives the things
 * that legitimately move code around.
 *
 * State lives inside the sticky PR comment, in an HTML comment the renderer
 * appends. That keeps it on the PR itself rather than in a branch, a gist, or
 * external storage: it cannot desync from the thing it describes, and deleting
 * the comment is a clean reset.
 *
 * The payload is base64 so that finding prose cannot break out of it. Review
 * text routinely contains `}` and can contain `-->`; embedded raw, either one
 * truncates the block and the state is silently lost on the next run.
 *
 * Finding identity is content-addressed, never positional. Line numbers shift
 * on every unrelated edit above them, so an id derived from a line number would
 * resurrect the whole backlog on any insertion. Whitespace is collapsed before
 * hashing so a reindent or an `oxfmt` pass does not do the same.
 *
 * Stdlib only, deliberately: the job that runs this is Tier A (no
 * `pnpm install`), so a third-party import here is a `MODULE_NOT_FOUND` inside
 * CI rather than a local test failure. See
 * [ADR-045](../../docs/architecture/adr-045-guards-must-prove-they-report.md).
 */

import { createHash } from 'node:crypto';

export const STATE_MARKER = 'pr-review-state';
export const STATE_VERSION = 1;
export const SEVERITIES = ['high', 'medium', 'low'];

const STATE_RE = new RegExp(`<!--\\s*${STATE_MARKER}:\\s*([A-Za-z0-9+/=]+)\\s*-->`, 'u');

/**
 * A single reported defect, as carried across runs.
 *
 * @typedef {object} Finding
 * @property {string} id content-addressed, see {@link findingId}
 * @property {string} file repo-relative path
 * @property {string} title one line
 * @property {string} body what is wrong and what the consequence is
 * @property {string} severity one of {@link SEVERITIES}
 * @property {string | null} snippet the offending code, verbatim, or null
 * @property {Remedy | null} remedy where the fix lands when it lands somewhere
 *   else, see {@link remedyFromModel}
 * @property {'open' | 'resolved'} status recomputed each run, never remembered
 * @property {string} first_seen sha this was first reported on
 * @property {string | null} resolved_in sha it was first seen fixed on
 */

/**
 * Where a finding's fix has to land, when that is not the file it is anchored
 * to.
 *
 * @typedef {object} Remedy
 * @property {string} file repo-relative path the fix must touch
 * @property {string} contains text whose presence in that file means fixed
 */

/**
 * State recovered from (or rendered into) the sticky comment.
 *
 * @typedef {object} ReviewState
 * @property {number} version
 * @property {string | null} last_reviewed_sha
 * @property {Finding[]} findings
 */

/** Collapse whitespace runs so reindentation does not change identity. */
export function normalize(text) {
  return text.replace(/\s+/gu, ' ').trim();
}

/**
 * Content-addressed id for a finding.
 *
 * Derived from the file path plus the offending code, never the line number. A
 * finding with no snippet (typically "X is missing") has no code to anchor to,
 * so it falls back to the path alone plus a marker no path can collide with;
 * such findings cannot be verified mechanically and are handled separately in
 * {@link verifyStatus}.
 *
 * @param {string} file
 * @param {string | null | undefined} snippet
 * @returns {string}
 */
export function findingId(file, snippet) {
  const anchor = snippet ? normalize(snippet) : '\u0000no-snippet';
  return createHash('sha256').update(`${file}\n${anchor}`).digest('hex').slice(0, 12);
}

/**
 * The state of a PR nothing has reviewed yet.
 *
 * @returns {ReviewState}
 */
export function emptyState() {
  return { version: STATE_VERSION, last_reviewed_sha: null, findings: [] };
}

/**
 * Read a finding's optional remedy out of the reviewer's raw JSON output.
 *
 * A finding is anchored to the file that shows the problem, but the fix does
 * not always belong there: "this compose file declares a secret the secrets
 * role must provide" is anchored to the compose file and fixed in the role.
 * {@link verifyStatus} checks the anchor's snippet, which stays correctly
 * present after such a fix, so without this the finding could never resolve —
 * it blocked a merge on a PR that had already fixed it (POPS-2705).
 *
 * Both fields must be non-empty strings; a half-specified remedy is dropped
 * rather than half-honoured, because a remedy with no `contains` would match
 * any file and resolve the finding on sight.
 *
 * @param {unknown} raw
 * @returns {Remedy | null}
 */
export function remedyFromModel(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  const file = typeof record.file === 'string' ? record.file.trim() : '';
  const contains = typeof record.contains === 'string' ? record.contains : '';
  if (file === '' || normalize(contains) === '') return null;
  return { file, contains };
}

/**
 * Build a finding from the reviewer's raw JSON output.
 *
 * The id is computed here rather than requested from the model: models do not
 * produce stable hashes, and identity drift is the one thing this design cannot
 * tolerate.
 *
 * @param {unknown} raw
 * @param {string} sha
 * @returns {Finding}
 * @throws {TypeError} when the shape is not a finding, so the caller can drop
 *   that one item rather than the whole run.
 */
export function findingFromModel(raw, sha) {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('finding is not an object');
  }
  const record = /** @type {Record<string, unknown>} */ (raw);
  if (typeof record.file !== 'string' || typeof record.title !== 'string') {
    throw new TypeError('finding is missing `file` or `title`');
  }
  const snippet =
    typeof record.snippet === 'string' && record.snippet !== '' ? record.snippet : null;
  const severity =
    typeof record.severity === 'string' && SEVERITIES.includes(record.severity.toLowerCase())
      ? record.severity.toLowerCase()
      : 'medium';
  return {
    id: findingId(record.file, snippet),
    file: record.file,
    title: record.title,
    body: typeof record.body === 'string' ? record.body : '',
    severity,
    snippet,
    remedy: remedyFromModel(record.remedy),
    status: 'open',
    first_seen: sha,
    resolved_in: null,
  };
}

/**
 * @param {ReviewState} state
 * @returns {string} base64 of the state JSON
 */
export function encodeState(state) {
  const payload = {
    version: state.version,
    last_reviewed_sha: state.last_reviewed_sha,
    findings: state.findings,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

/**
 * Recover state from a sticky comment body.
 *
 * Anything unreadable — no marker, malformed JSON, a version this code does not
 * know — yields empty state, which degrades to a full review rather than to a
 * crash. A reviewer that hard-fails on its own corrupted bookkeeping is worse
 * than one that occasionally re-reviews from scratch.
 *
 * @param {string | null | undefined} commentBody
 * @returns {ReviewState}
 */
export function parseState(commentBody) {
  if (!commentBody) return emptyState();
  const match = STATE_RE.exec(commentBody);
  if (match?.[1] === undefined) return emptyState();

  let payload;
  try {
    payload = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
  } catch {
    return emptyState();
  }
  if (typeof payload !== 'object' || payload === null) return emptyState();
  const record = /** @type {Record<string, unknown>} */ (payload);
  if (record.version !== STATE_VERSION) return emptyState();

  /** @type {Finding[]} */
  const findings = [];
  for (const raw of Array.isArray(record.findings) ? record.findings : []) {
    if (typeof raw !== 'object' || raw === null) continue;
    const f = /** @type {Record<string, unknown>} */ (raw);
    if (typeof f.id !== 'string' || typeof f.file !== 'string' || typeof f.title !== 'string') {
      continue;
    }
    findings.push({
      id: f.id,
      file: f.file,
      title: f.title,
      body: typeof f.body === 'string' ? f.body : '',
      severity: typeof f.severity === 'string' ? f.severity : 'medium',
      snippet: typeof f.snippet === 'string' ? f.snippet : null,
      remedy: remedyFromModel(f.remedy),
      status: f.status === 'resolved' ? 'resolved' : 'open',
      first_seen: typeof f.first_seen === 'string' ? f.first_seen : '',
      resolved_in: typeof f.resolved_in === 'string' ? f.resolved_in : null,
    });
  }
  return {
    version: STATE_VERSION,
    last_reviewed_sha:
      typeof record.last_reviewed_sha === 'string' ? record.last_reviewed_sha : null,
    findings,
  };
}

/**
 * Decide what range to review.
 *
 * The incremental range is the point of the whole design — re-reading the full
 * PR diff on every push is where both the cost and the repetition come from.
 *
 * It is only valid while the last reviewed commit is still reachable from head.
 * A rebase or force-push rewrites history and leaves the recorded sha dangling,
 * at which point `last..head` is either meaningless or enormous, so this falls
 * back to the full diff.
 *
 * @param {string} baseSha
 * @param {string} headSha
 * @param {string | null} lastReviewedSha
 * @param {(a: string, b: string) => boolean} isAncestor
 * @returns {{ range: string, mode: 'full' | 'incremental' | 'empty' }}
 */
export function computeDiffRange(baseSha, headSha, lastReviewedSha, isAncestor) {
  if (lastReviewedSha && isAncestor(lastReviewedSha, headSha)) {
    return {
      range: `${lastReviewedSha}..${headSha}`,
      mode: lastReviewedSha === headSha ? 'empty' : 'incremental',
    };
  }
  return { range: `${baseSha}...${headSha}`, mode: 'full' };
}

/**
 * Does `path`, as of the reviewed commit, contain `needle`?
 *
 * Whitespace-insensitive for the same reason finding identity is: a reindent
 * or a formatter pass must not change the answer.
 *
 * @param {(path: string) => string | null} readFile
 * @param {string} path
 * @param {string} needle
 * @returns {boolean}
 */
function fileContains(readFile, path, needle) {
  const content = readFile(path);
  return content !== null && normalize(content).includes(normalize(needle));
}

/**
 * Recompute open/resolved for every finding against the reviewed commit.
 *
 * Status is derived from the code, not remembered, and not asked of the model.
 * That makes the pass idempotent, lets a genuinely reintroduced problem reopen
 * itself, and avoids trusting a model to remember what it said last time.
 *
 * Two questions, in this order:
 *
 *   1. Has the remedy landed? Only for a finding that declared one — the fix
 *      lives in a different file than the anchor. This has to come first: the
 *      anchor's snippet is still present after such a fix, and still correct,
 *      so asking about the snippet alone answers "open" forever. That is
 *      POPS-2705, found on a PR where the fix was two commits old and the
 *      finding still blocked the merge.
 *   2. Otherwise, is the snippet still present? A finding is open exactly
 *      while the code it pointed at is there.
 *
 * A finding with neither a landed remedy nor a snippet cannot be checked
 * against the tree at all and keeps the status it already had.
 *
 * @param {Finding[]} findings
 * @param {(path: string) => string | null} readFile
 * @param {string} headSha
 * @returns {Finding[]}
 */
export function verifyStatus(findings, readFile, headSha) {
  return findings.map((finding) => {
    /** @returns {Finding} */
    const resolved = () => ({
      ...finding,
      status: 'resolved',
      resolved_in: finding.status === 'resolved' ? finding.resolved_in : headSha,
    });
    if (
      finding.remedy !== null &&
      fileContains(readFile, finding.remedy.file, finding.remedy.contains)
    ) {
      return resolved();
    }
    if (finding.snippet === null) return { ...finding };
    if (fileContains(readFile, finding.file, finding.snippet)) {
      return { ...finding, status: 'open', resolved_in: null };
    }
    return resolved();
  });
}

/**
 * Fold this run's findings into the carried set.
 *
 * A finding already known keeps its original `first_seen` so the comment can
 * show how long something has been outstanding; its prose is refreshed from the
 * newer run. Order is preserved oldest-first so the comment does not reshuffle
 * on every push.
 *
 * @param {Finding[]} prior
 * @param {Finding[]} incoming
 * @returns {Finding[]}
 */
export function merge(prior, incoming) {
  /** @type {Map<string, Finding>} */
  const byId = new Map(prior.map((f) => [f.id, { ...f }]));
  const order = prior.map((f) => f.id);
  for (const finding of incoming) {
    const existing = byId.get(finding.id);
    if (existing === undefined) {
      byId.set(finding.id, { ...finding });
      order.push(finding.id);
      continue;
    }
    existing.title = finding.title;
    existing.body = finding.body;
    existing.severity = finding.severity;
    // A re-report that omits the remedy keeps the one already recorded rather
    // than clearing it: losing it would make the finding unresolvable again,
    // which is the bug this field exists to fix.
    existing.remedy = finding.remedy ?? existing.remedy;
    existing.status = 'open';
    existing.resolved_in = null;
  }
  return order.map((id) => /** @type {Finding} */ (byId.get(id)));
}

/** @param {Finding} finding */
function severityRank(finding) {
  const index = SEVERITIES.indexOf(finding.severity);
  return index === -1 ? SEVERITIES.length : index;
}

/**
 * Render the sticky comment, state block included.
 *
 * @param {ReviewState} state
 * @param {string} headSha
 * @param {string} mode
 * @returns {string}
 */
export function render(state, headSha, mode) {
  const open = state.findings
    .filter((f) => f.status === 'open')
    .toSorted((a, b) => severityRank(a) - severityRank(b));
  const resolved = state.findings.filter((f) => f.status === 'resolved');

  const lines = ['## Review', ''];

  if (open.length === 0) {
    lines.push('No open findings.', '');
  } else {
    lines.push(`${open.length} open ${open.length === 1 ? 'finding' : 'findings'}.`, '');
    for (const finding of open) {
      const age =
        finding.first_seen && finding.first_seen !== headSha
          ? ` (since \`${finding.first_seen.slice(0, 7)}\`)`
          : '';
      lines.push(
        `### ${finding.severity.toUpperCase()} — ${finding.title}`,
        `\`${finding.file}\`${age}`,
        '',
        finding.body,
        ''
      );
      if (finding.snippet) lines.push('```', finding.snippet, '```', '');
      if (finding.remedy) {
        lines.push(
          `Resolves when \`${finding.remedy.file}\` contains:`,
          '```',
          finding.remedy.contains,
          '```',
          ''
        );
      }
    }
  }

  if (resolved.length > 0) {
    const noun = resolved.length === 1 ? 'finding' : 'findings';
    lines.push('<details>', `<summary>${resolved.length} resolved ${noun}</summary>`, '');
    for (const finding of resolved) lines.push(`- ~~${finding.title}~~ (\`${finding.file}\`)`);
    lines.push('', '</details>', '');
  }

  lines.push(
    '---',
    `<sub>${mode} review at \`${headSha.slice(0, 7)}\`</sub>`,
    '',
    `<!-- ${STATE_MARKER}: ${encodeState(state)} -->`
  );
  return lines.join('\n');
}
