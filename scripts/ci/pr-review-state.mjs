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

/**
 * Whether a review severity blocks merge while its finding is open.
 *
 * Only the exact persisted value `low` is advisory. Missing, malformed and
 * future values remain blocking so old or corrupted state cannot bypass the
 * required findings gate.
 *
 * @param {unknown} severity
 * @returns {boolean}
 */
export function isBlockingSeverity(severity) {
  return severity !== 'low';
}

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
 * @property {string | null} judged_absent_in sha at which the reviewer was
 *   asked whether this finding still holds and said it does not, see
 *   {@link applyRejudgement}
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

/**
 * Collapse whitespace runs so reindentation does not change identity.
 *
 * @param {string} text
 * @returns {string}
 */
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
 * A second id for a finding whose content-addressed one is already taken.
 *
 * Derived from the base id and the title, so it is stable across runs however
 * the model happens to order its output — an ordinal suffix would swap two
 * findings' identities the moment the model reported them the other way
 * round.
 *
 * The title is admitted here and nowhere else on purpose. {@link findingId}
 * excludes it so a reworded finding keeps its id and merges as an update
 * ("its prose is refreshed from the newer run"); that property only has to
 * hold between findings that are otherwise identical, and two findings
 * sharing a file and a snippet are exactly the case where nothing else can
 * tell them apart.
 *
 * `ordinal` is the escape for the one case the title cannot separate: two
 * findings sharing a file, a snippet AND a title are indistinguishable by
 * every fact this module records, so the second onwards are numbered. That
 * numbering is only as stable as the order the model reported them in —
 * which is why it is reached for last rather than used as the scheme.
 *
 * @param {string} baseId
 * @param {string} title
 * @param {number} [ordinal]
 * @returns {string}
 */
function qualifiedFindingId(baseId, title, ordinal = 0) {
  const suffix = ordinal === 0 ? '' : `\n${ordinal}`;
  return createHash('sha256')
    .update(`${baseId}\n${normalize(title)}${suffix}`)
    .digest('hex')
    .slice(0, 12);
}

/**
 * Which member of a colliding group keeps the base id.
 *
 * Alphabetical order alone decides it only when nothing already has a claim.
 * A row at the base id in `prior` is a finding that has been tracked there
 * across runs, carrying its `first_seen` and its status history; handing that
 * row to whichever title happens to sort first this run would give a brand
 * new finding another one's age, and push the genuinely continuing finding
 * into a fresh row. So the prior occupant is matched by title first, and a
 * member already tracked at its own qualified id is passed over second —
 * moving it back to the base id would abandon the row it has.
 *
 * One case stays undecidable: the prior occupant reworded its title in the
 * same run a new finding started colliding with it. Nothing recorded here
 * separates them, so title order decides and one of the two rows changes age.
 * That is a wrong `first_seen`, not a dropped finding — the failure this
 * module refuses is the silent overwrite, and every member still gets a row.
 *
 * @param {string} baseId
 * @param {Finding[]} byTitle Group members, in title order.
 * @param {Map<string, Finding>} priorById
 * @returns {Finding}
 */
function baseIdKeeper(baseId, byTitle, priorById) {
  const occupant = priorById.get(baseId);
  const continuing =
    occupant === undefined
      ? undefined
      : byTitle.find((f) => normalize(f.title) === normalize(occupant.title));
  if (continuing !== undefined) return continuing;
  const unclaimed = byTitle.find((f) => !priorById.has(qualifiedFindingId(baseId, f.title)));
  return unclaimed ?? /** @type {Finding} */ (byTitle[0]);
}

/**
 * Title order, the last resort when no member of a group has a prior claim.
 *
 * @param {Finding} a @param {Finding} b @returns {number}
 */
function compareTitles(a, b) {
  return a.title.localeCompare(b.title);
}

/**
 * Give every finding in one run an id no other finding in it shares.
 *
 * `findingId` hashes the file and the snippet, so two genuinely different
 * findings in one file that both have no snippet — "X is missing" is the
 * common shape — or that point at the same offending line hash to the same
 * id. {@link merge}'s id-keyed map then read the second as an update of the
 * first: one real finding was silently overwritten and never appeared in any
 * comment, with no warning and a review that looked clean (POPS-2545).
 *
 * Within a colliding group one member keeps the base id and the rest are
 * qualified, rather than all of them being qualified. A run that reports only
 * one of the group must not change that one's id, or it would arrive as a new
 * finding beside the row it already had. Which one keeps it is
 * {@link baseIdKeeper}'s call, which is why `prior` is passed in.
 *
 * Every id handed out is checked against the ones already spoken for, and a
 * clash is numbered rather than allowed to stand: a duplicate id here IS the
 * silent overwrite this function exists to prevent, so it must not be
 * reachable through any group shape, however unlikely.
 *
 * @param {Finding[]} findings
 * @param {Finding[]} [prior] Findings already tracked, for id continuity.
 * @returns {Finding[]} Same order, ids made unique.
 */
export function disambiguateIds(findings, prior = []) {
  /** @type {Map<string, Finding[]>} */
  const groups = new Map();
  for (const finding of findings) {
    const group = groups.get(finding.id);
    if (group === undefined) groups.set(finding.id, [finding]);
    else group.push(finding);
  }
  const priorById = new Map(prior.map((f) => [f.id, f]));

  /** @type {Map<Finding, string>} */
  const rewritten = new Map();
  const taken = new Set(groups.keys());
  for (const [baseId, group] of groups) {
    if (group.length === 1) continue;
    const byTitle = group.toSorted(compareTitles);
    const keeper = baseIdKeeper(baseId, byTitle, priorById);
    for (const finding of byTitle) {
      if (finding === keeper) continue;
      let ordinal = 0;
      let id = qualifiedFindingId(baseId, finding.title);
      while (taken.has(id)) {
        ordinal += 1;
        id = qualifiedFindingId(baseId, finding.title, ordinal);
      }
      taken.add(id);
      rewritten.set(finding, id);
    }
  }

  if (rewritten.size === 0) return findings;
  return findings.map((finding) => {
    const id = rewritten.get(finding);
    return id === undefined ? finding : { ...finding, id };
  });
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
    judged_absent_in: null,
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
      judged_absent_in: typeof f.judged_absent_in === 'string' ? f.judged_absent_in : null,
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
 * A full object name: SHA-1 (40 hex) or SHA-256 (64 hex).
 *
 * The recorded sha is handed to `git` as a revision argument, so anything that
 * is not exactly an object name — an abbreviation, a ref name, a string
 * starting with `-` — is treated as no sha at all rather than passed through.
 */
const FULL_SHA_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/**
 * @param {unknown} value
 * @returns {value is string}
 */
export function isFullSha(value) {
  return typeof value === 'string' && FULL_SHA_RE.test(value);
}

/**
 * The git questions {@link computeDiffRange} needs answered, injected so the
 * decision is testable without a repository.
 *
 * @typedef {object} DiffGit
 * @property {(ancestor: string, descendant: string) => boolean} isAncestor
 * @property {(a: string, b: string) => string | null} mergeBase
 * @property {(ours: string, theirs: string) => string | null} mergeTree tree id
 *   of a conflict-free merge of the two commits, or null when it conflicts
 */

/**
 * @typedef {object} DiffPlan
 * @property {'full' | 'incremental' | 'empty'} mode
 * @property {string[]} revisions the revision arguments for `git diff`
 * @property {string} reason one line, for the run log
 */

/**
 * Decide what to review.
 *
 * Incremental review is the point of the design: re-reading the full PR diff
 * on every push hands a nondeterministic reviewer code it already reviewed,
 * and it reports something new there on every run, so the fix loop never
 * converges. An incremental run sees only what changed since the last reviewed
 * commit.
 *
 * "What changed" has to exclude the base branch. When main is merged into the
 * branch, `last..head` contains every commit main gained since — none of it PR
 * content. So when the PR's merge base has moved past the last reviewed
 * commit, the comparison point is a synthetic tree: the last reviewed commit
 * merged with the new merge base. Diffing that against head leaves exactly the
 * changes the base branch does not explain. If that synthetic merge conflicts,
 * the branch resolved the conflict itself, and the resolution is PR content
 * this cannot separate from main's; the run falls back to a full review.
 *
 * A full review also runs when there is no trusted reviewed sha, when that sha
 * is no longer in head's history (a rebase or force-push rewrote what was
 * reviewed), and whenever `forceFull` is set (the `full-review` label).
 *
 * @param {object} input
 * @param {string} input.baseSha
 * @param {string} input.headSha
 * @param {string | null} input.lastReviewedSha
 * @param {boolean} [input.forceFull]
 * @param {DiffGit} input.git
 * @returns {DiffPlan}
 */
export function computeDiffRange({ baseSha, headSha, lastReviewedSha, forceFull = false, git }) {
  /** @param {string} reason @returns {DiffPlan} */
  const full = (reason) => ({ mode: 'full', revisions: [`${baseSha}...${headSha}`], reason });

  if (forceFull) return full('the full-review label is set');
  if (!isFullSha(lastReviewedSha)) return full('no reviewed commit is recorded');
  if (!git.isAncestor(lastReviewedSha, headSha)) {
    return full('the last reviewed commit is no longer in the branch history');
  }
  if (lastReviewedSha === headSha) {
    return { mode: 'empty', revisions: [], reason: 'head has not moved since the last review' };
  }

  const mergeBase = git.mergeBase(baseSha, headSha);
  if (mergeBase === null) return full('the branch has no merge base with its base');
  if (git.isAncestor(mergeBase, lastReviewedSha)) {
    return {
      mode: 'incremental',
      revisions: [lastReviewedSha, headSha],
      reason: 'commits pushed since the last review',
    };
  }

  const replayed = git.mergeTree(lastReviewedSha, mergeBase);
  if (replayed === null) {
    return full('the base branch merged in since the last review conflicts with it');
  }
  return {
    mode: 'incremental',
    revisions: [replayed, headSha],
    reason: 'commits pushed since the last review, excluding the base branch merged in',
  };
}

/**
 * What an incremental run's diff actually changed, per file.
 *
 * @typedef {object} ReviewScope
 * @property {string[]} touched every path the diff names
 * @property {Record<string, string[]>} added normalized added lines per path
 */

/**
 * Collect the added lines of a `git diff --unified=0` per destination path.
 *
 * A line is only read as a file header between `diff --git` and the first
 * hunk, so added content that itself begins with `+++` is still content.
 *
 * @param {string} diffText
 * @returns {Record<string, string[]>}
 */
export function addedLinesByFile(diffText) {
  /** @type {Map<string, string[]>} */
  const added = new Map();
  /** @type {string | null} */
  let file = null;
  let inHeader = false;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inHeader = true;
      file = null;
      continue;
    }
    if (inHeader) {
      if (line.startsWith('+++ ')) {
        const target = line.slice(4);
        file = target.startsWith('b/') ? target.slice(2) : null;
      } else if (line.startsWith('@@')) {
        inHeader = false;
      }
      continue;
    }
    if (file === null || !line.startsWith('+')) continue;
    const content = normalize(line.slice(1));
    if (content === '') continue;
    const lines = added.get(file);
    if (lines === undefined) added.set(file, [content]);
    else lines.push(content);
  }
  return Object.fromEntries(added);
}

/**
 * Whether a snippet line carries enough to locate anything: a bare `}` or `);`
 * occurs on every other added line and would admit any finding at all.
 *
 * @param {string} line
 * @returns {boolean}
 */
function isLocatingLine(line) {
  return /[\p{L}\p{N}]/u.test(line);
}

/**
 * Keep only the new findings an incremental run was allowed to raise.
 *
 * An incremental run reviews only what changed since the last review, so a
 * NEW finding must point at that change: its snippet must overlap a line the
 * diff added, or — for a finding about something absent — its file must be
 * one the diff touched. A finding on code unchanged since the last review is
 * exactly the churn incremental review exists to stop: that code was already
 * reviewed, and a nondeterministic reviewer reading it again finds something
 * new every time.
 *
 * A re-report of a finding already carried is always kept; it is not new, and
 * {@link merge} needs it to refresh the prose or reopen the finding.
 *
 * @param {Finding[]} incoming
 * @param {Finding[]} prior
 * @param {ReviewScope} scope
 * @returns {{ admitted: Finding[], dropped: Finding[] }}
 */
export function admitToScope(incoming, prior, scope) {
  const known = new Set(prior.map((f) => f.id));
  const touched = new Set(scope.touched);
  /** @type {Finding[]} */
  const admitted = [];
  /** @type {Finding[]} */
  const dropped = [];
  for (const finding of incoming) {
    (known.has(finding.id) || touchesChange(finding, touched, scope.added)
      ? admitted
      : dropped
    ).push(finding);
  }
  return { admitted, dropped };
}

/**
 * @param {Finding} finding
 * @param {Set<string>} touched
 * @param {Record<string, string[]>} added
 * @returns {boolean}
 */
function touchesChange(finding, touched, added) {
  if (!touched.has(finding.file)) return false;
  if (finding.snippet === null) return true;
  const addedHere = Object.hasOwn(added, finding.file) ? added[finding.file] : undefined;
  return finding.snippet
    .split('\n')
    .map(normalize)
    .filter(isLocatingLine)
    .some((line) => (addedHere ?? []).some((addedLine) => addedLine.includes(line)));
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isStringValue(value) {
  return typeof value === 'string';
}

/**
 * Read a {@link ReviewScope} back from the file `plan` wrote.
 *
 * Unreadable yields null, and the caller then admits every finding: losing the
 * scope must never be able to hide a finding from the merge gate.
 *
 * @param {string | null} raw
 * @returns {ReviewScope | null}
 */
export function parseScope(raw) {
  if (raw === null) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = /** @type {Record<string, unknown>} */ (parsed);
  if (!Array.isArray(record.touched) || typeof record.added !== 'object' || record.added === null) {
    return null;
  }
  const added = Object.fromEntries(
    Object.entries(record.added)
      .filter(([, lines]) => Array.isArray(lines))
      .map(([path, lines]) => [path, lines.filter(isStringValue)])
  );
  return { touched: record.touched.filter(isStringValue), added };
}

/**
 * The spellings a remedy naming a property key may legitimately take.
 *
 * A remedy is written the way the reviewer says it — `aria-label?:` — and a
 * hyphenated key cannot be spelled that way in TypeScript. `aria-label` is
 * not an identifier, so the key must be quoted (`'aria-label'?: string`), and
 * a remedy asking for the bare form asks for a string no valid source file
 * can contain. The finding is then permanently unresolvable and
 * `review-findings-gate`, a required check, is permanently red with no
 * correct exit — which trains the exits that do work: reshaping correct code
 * until the matcher is happy, or `--admin`. Both are worse than the finding
 * (POPS-3391, seen on POPS-3298's PR).
 *
 * So a LEADING property key is offered quoted as well as bare, both ways
 * round: a remedy that quotes the key matches source that does not, and the
 * reverse. Nothing else in the string is touched. A loose match over the
 * whole needle would resolve findings on text that merely looks similar,
 * which is the failure this matcher exists to avoid.
 *
 * @param {string} needle
 * @returns {string[]} Candidate spellings, the original first.
 */
export function remedyNeedles(needle) {
  const trimmed = needle.trim();
  const match = /^(['"]?)([A-Za-z_$][\w$-]*)\1(\s*\??\s*:)/u.exec(trimmed);
  if (match === null) return [needle];
  const key = match[2] ?? '';
  const separator = match[3] ?? '';
  const rest = trimmed.slice(match[0].length);
  return [
    needle,
    `${key}${separator}${rest}`,
    `'${key}'${separator}${rest}`,
    `"${key}"${separator}${rest}`,
  ];
}

/**
 * Does `path`, as of the reviewed commit, contain `needle`?
 *
 * Whitespace-insensitive for the same reason finding identity is: a reindent
 * or a formatter pass must not change the answer. Quote-insensitive on a
 * leading property key, for the reason {@link remedyNeedles} sets out.
 *
 * @param {(path: string) => string | null} readFile
 * @param {string} path
 * @param {string} needle
 * @returns {boolean}
 */
function fileContains(readFile, path, needle) {
  const content = readFile(path);
  if (content === null) return false;
  const haystack = normalize(content);
  return remedyNeedles(needle).some((candidate) => haystack.includes(normalize(candidate)));
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
 *   2. Has the reviewer been asked, and said the defect no longer holds? Only
 *      a finding {@link applyRejudgement} stamped this run, which happens only
 *      for a finding whose own file the diff touched. This has to come before
 *      the snippet question for the same reason the remedy does: the snippet
 *      is the thing that is wrong. A one-line anchor that also occurs in
 *      legitimate code elsewhere in the same file is still present after the
 *      defect is fixed, so the snippet question answers "open" forever and the
 *      finding wedges the merge gate — POPS-2669, found on #4301 where the
 *      anchor `if (keptTags.length === 0) continue;` survived in the `add`
 *      branch, where it is correct and required.
 *   3. Otherwise, is the snippet still present? A finding is open exactly
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
    if (finding.judged_absent_in !== null) return resolved();
    if (finding.snippet === null) return { ...finding };
    if (fileContains(readFile, finding.file, finding.snippet)) {
      return { ...finding, status: 'open', resolved_in: null };
    }
    return resolved();
  });
}

/**
 * Which carried findings this run is allowed to ask the reviewer about.
 *
 * A finding can only have been fixed by a commit that touched the file it is
 * anchored to, so a finding whose file is untouched is never offered for
 * re-judgement. That is what bounds the blast radius of the whole mechanism:
 * the reviewer cannot resolve a finding by mistake in code it was not looking
 * at, and the pathological outcome POPS-2669 warns about — everything
 * resolves — needs the diff to have touched every anchored file.
 *
 * Anchoring is by exact path. A rename shows as a touched path under the new
 * name and an untouched one under the old, so a renamed file's findings simply
 * are not offered; they keep resolving the way they always did, on the snippet
 * disappearing from a path `readFile` can no longer read.
 *
 * @param {Finding[]} findings
 * @param {readonly string[]} touchedPaths repo-relative paths in this run's diff
 * @returns {Finding[]} the open ones worth asking about, in carried order
 */
export function rejudgeable(findings, touchedPaths) {
  const touched = new Set(touchedPaths);
  return findings.filter((f) => f.status === 'open' && touched.has(f.file));
}

/**
 * Record the reviewer's verdict on the findings it was asked to re-judge.
 *
 * Deliberately narrow in three ways, because the failure this can cause —
 * a real defect silently marked resolved — is worse than the one it fixes:
 *
 *   - only an id in `offeredIds` can be stamped, so a hallucinated or
 *     copy-pasted id from another PR does nothing;
 *   - only a finding that is currently open is stamped;
 *   - an empty or unreadable verdict stamps nothing, which leaves every
 *     finding exactly as it was. Every way this mechanism can fail leaves the
 *     gate closed.
 *
 * @param {Finding[]} findings
 * @param {Iterable<string>} offeredIds ids `rejudgeable` produced for this run
 * @param {Iterable<string>} resolvedIds ids the reviewer says no longer hold
 * @param {string} headSha
 * @returns {Finding[]}
 */
export function applyRejudgement(findings, offeredIds, resolvedIds, headSha) {
  const offered = new Set(offeredIds);
  const cleared = new Set(resolvedIds);
  return findings.map((finding) => {
    if (finding.status !== 'open') return { ...finding };
    if (!offered.has(finding.id) || !cleared.has(finding.id)) return { ...finding };
    return { ...finding, judged_absent_in: headSha };
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
  for (const finding of disambiguateIds(incoming, prior)) {
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
    // Reporting it again is the reviewer contradicting its own earlier
    // judgement that the defect was gone. The newer look wins, or a genuinely
    // reintroduced defect could never reopen.
    existing.judged_absent_in = null;
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
  const blockingCount = open.filter((finding) => isBlockingSeverity(finding.severity)).length;
  const advisoryCount = open.length - blockingCount;
  const resolved = state.findings.filter((f) => f.status === 'resolved');

  const lines = ['## Review', ''];

  if (open.length === 0) {
    lines.push('No open findings.', '');
  } else {
    lines.push(
      `${open.length} open ${open.length === 1 ? 'finding' : 'findings'}. ` +
        `${blockingCount} blocking, ${advisoryCount} advisory.`,
      ''
    );
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
