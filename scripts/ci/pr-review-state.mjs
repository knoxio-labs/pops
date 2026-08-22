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
 * @property {'open' | 'resolved'} status recomputed each run, never remembered
 * @property {string} first_seen sha this was first reported on
 * @property {string | null} resolved_in sha it was first seen fixed on
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
 * Recompute open/resolved for every finding against the reviewed commit.
 *
 * Status is derived from the code, not remembered, and not asked of the model.
 * A finding is open exactly when its snippet is still present. That makes the
 * pass idempotent, lets a genuinely reintroduced problem reopen itself, and
 * avoids trusting a model to remember what it said last time.
 *
 * Snippet-less findings cannot be checked this way and keep the status they
 * already had.
 *
 * @param {Finding[]} findings
 * @param {(path: string) => string | null} readFile
 * @param {string} headSha
 * @returns {Finding[]}
 */
export function verifyStatus(findings, readFile, headSha) {
  return findings.map((finding) => {
    if (finding.snippet === null) return { ...finding };
    const content = readFile(finding.file);
    const present = content !== null && normalize(content).includes(normalize(finding.snippet));
    if (present) return { ...finding, status: 'open', resolved_in: null };
    return {
      ...finding,
      status: 'resolved',
      resolved_in: finding.status === 'resolved' ? finding.resolved_in : headSha,
    };
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
