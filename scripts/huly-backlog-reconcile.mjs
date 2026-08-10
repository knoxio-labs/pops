#!/usr/bin/env node
/**
 * Reconcile an exported tracker backlog against the commits already merged on
 * a git ref, and name the tickets whose work has shipped.
 *
 * The tracker is the only place work exists
 * ([ADR-041](docs/architecture/adr-041-colocated-docs-and-external-tracking.md)),
 * so a backlog listing merged work as open is worse than useless — an agent
 * dispatched at such a ticket spends a full run proving the fix is already on
 * `main`. This tool finds those tickets.
 *
 * It is deliberately NOT a tracker client: it reads an exported JSON array of
 * issues and writes a verdict. Nothing here holds a credential, and nothing
 * here mutates the tracker — a human or an agent applies the verdicts, having
 * read them.
 *
 * ## What counts as evidence
 *
 * A bare identifier match anywhere in a commit message is not evidence. A
 * commit that merely *mentions* a ticket ("follow-ups filed: …", "deferred
 * from …", "related to …") is not a commit that fixes it, and closing on that
 * signal buries live work. Two positions — and only two — are read as the
 * commit claiming authorship of the ticket's fix:
 *
 *   - `subject-ref`   — the identifier sits in a trailing parenthesised group
 *                       of the subject, the conventional-commit convention
 *                       this repo writes: `fix(bfm): thing (POPS-1)`. A
 *                       trailing `(#1234)` squash-merge PR number is peeled
 *                       past; a group carrying anything else (`(POPS-237
 *                       slice 1)`) stops the peel, because a slice of a ticket
 *                       is not the ticket.
 *   - `body-trailer`  — the body's final block is nothing but bare identifier
 *                       lines, or a line is an explicit `Closes: POPS-1`
 *                       trailer. Prose that happens to name identifiers is not
 *                       a trailer, so `Follow-ups filed: POPS-2, POPS-3` on
 *                       the last line yields nothing.
 *
 * Everything else is reported, not acted on: an identifier elsewhere in the
 * subject, or anywhere in the body, lands in `review` or `mentioned` for a
 * human to read. So does an authorship match on a revert, or on a commit whose
 * subject marks it as one slice/phase/part of a larger ticket.
 *
 * ## Mirrors
 *
 * The GitHub sync mints a second issue per merged PR, titled with the commit
 * subject. Those are identified exactly — an issue title that equals a merged
 * commit subject (with any trailing squash-merge `(#1234)` removed) is a
 * mirror — and each orphan is matched to the mirrors that name it, so the
 * closing action can point at one.
 *
 * ## How much of the backlog it saw
 *
 * A sweep is only as true as its input is complete, and the tracker API caps
 * `list_issues` at 200 rows with no cursor and no total — so an export can be
 * a page of the newest issues wearing the shape of the whole backlog. Reported
 * over that, "no orphans" is indistinguishable from a clean bill of health.
 *
 * So an export may carry a `coverage` block naming the queries that produced
 * it and the rows each returned, and every report opens by saying which of
 * three things is true of it: coverage complete, coverage INCOMPLETE (with the
 * reason), or coverage UNKNOWN because none was declared. The partitioning
 * recipe that yields a complete one, and the check applied here, both live in
 * `huly-partition-plan.mjs`.
 *
 * Usage:
 *   node scripts/huly-backlog-reconcile.mjs --issues <path.json> [--ref origin/main]
 *   node scripts/huly-backlog-reconcile.mjs --issues <path.json> --json
 *   node scripts/huly-backlog-reconcile.mjs --self-test
 *
 * `--issues` takes either a bare JSON array of `{ identifier, title, status }`,
 * or the `{ "result": [...] }` envelope a tracker export arrives in, optionally
 * alongside a `"coverage"` block.
 *
 * Exit 0 = ran. Exit 1 = self-test failed. Exit 2 = usage error, or an export
 * this tool could not read. Exit 3 = the export declared coverage and that
 * coverage does not cover the backlog.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assessCoverage, formatCoverage, readCoverage } from './huly-partition-plan.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Only a ticket in this status may be reported as an orphan to close. */
export const ELIGIBLE_STATUS = 'Backlog';

export const DEFAULT_REF = 'origin/main';
export const DEFAULT_PREFIX = 'POPS';

const RECORD_SEPARATOR = '\u001e';
const FIELD_SEPARATOR = '\u001f';

/**
 * Subject markers that make an authorship reference untrustworthy on its own:
 * the commit is one instalment of the ticket, not the whole of it.
 */
const PARTIAL_WORK_RE = /\bwip\b|\b(?:slice|phase|part|stage|step)\s+\w{1,3}\b/iu;

const REVERT_RE = /^revert\b/iu;

/**
 * Trailer keywords that assert closure, and only those. `Refs:`, `Ref:` and
 * `Ticket:` conventionally mean "related to" — reading them as authorship
 * would manufacture exactly the false positive this tool exists to avoid.
 */
const TRAILER_KEYWORDS = 'closes|close|fixes|fix|resolves|resolve';

/**
 * @typedef {{ sha: string, subject: string, body: string }} Commit
 * @typedef {{ identifier: string, title?: string, status?: string }} Issue
 * @typedef {'subject-ref' | 'body-trailer'} Evidence
 * @typedef {{ sha: string, subject: string, evidence: Evidence }} FixCommit
 * @typedef {{ sha: string, subject: string, where: 'subject' | 'body', why: string }} Concern
 */

/**
 * Every distinct `<prefix>-<n>` identifier in a blob of text.
 *
 * Matching is exact and whole-token, so `POPS-145` never matches inside
 * `POPS-1452` — the caller compares extracted strings against a known set
 * rather than substring-searching for each one.
 *
 * @param {string} text
 * @param {string} prefix
 * @returns {string[]}
 */
export function extractIdentifiers(text, prefix) {
  const pattern = new RegExp(`\\b${escapeRegExp(prefix)}-\\d+\\b`, 'gu');
  return [...new Set(text.match(pattern) ?? [])];
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/**
 * Index of the `(` matching the `)` that ends `text`, or -1 when the text does
 * not end in a balanced group.
 *
 * @param {string} text
 * @returns {number}
 */
export function indexOfMatchingOpenParen(text) {
  if (!text.endsWith(')')) return -1;
  let depth = 0;
  for (let i = text.length - 1; i >= 0; i -= 1) {
    const char = text[i];
    if (char === ')') depth += 1;
    else if (char === '(') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * The contents of the parenthesised groups at the very end of a subject, in
 * the order they were peeled (right to left).
 *
 * @param {string} subject
 * @returns {string[]}
 */
export function peelTrailingGroups(subject) {
  /** @type {string[]} */
  const groups = [];
  let rest = subject.trimEnd();
  while (rest.endsWith(')')) {
    const open = indexOfMatchingOpenParen(rest);
    if (open === -1) break;
    groups.push(rest.slice(open + 1, rest.length - 1));
    rest = rest.slice(0, open).trimEnd();
  }
  return groups;
}

/**
 * Read a peeled group as a list of ticket identifiers, or `undefined` when it
 * is anything else.
 *
 * A group is a ref list only when EVERY token in it is an identifier —
 * `(POPS-1599, POPS-1592)` qualifies, `(POPS-237 slice 1)` does not. That
 * asymmetry is the whole point: a slice of a ticket does not close it.
 *
 * @param {string} group
 * @param {string} prefix
 * @returns {string[] | undefined}
 */
export function readRefGroup(group, prefix) {
  const tokens = group
    .split(/[,;/+&]|\s+/u)
    .map((token) => token.trim())
    .filter((token) => token !== '');
  if (tokens.length === 0) return undefined;
  const identifier = new RegExp(`^${escapeRegExp(prefix)}-\\d+$`, 'u');
  if (!tokens.every((token) => identifier.test(token))) return undefined;
  return tokens;
}

/**
 * @param {string} group
 * @returns {boolean}
 */
function isPrNumberGroup(group) {
  return /^#\d+$/u.test(group.trim());
}

/**
 * Identifiers the subject claims authorship of: those in its trailing
 * parenthesised ref groups, peeling past a squash-merge `(#1234)`.
 *
 * @param {string} subject
 * @param {string} prefix
 * @returns {string[]}
 */
export function subjectAuthorshipRefs(subject, prefix) {
  /** @type {string[]} */
  const refs = [];
  for (const group of peelTrailingGroups(subject)) {
    if (isPrNumberGroup(group)) continue;
    const parsed = readRefGroup(group, prefix);
    if (parsed === undefined) break;
    refs.push(...parsed);
  }
  return [...new Set(refs)];
}

/**
 * A line that is nothing but identifiers, e.g. `POPS-1452` or `POPS-1, POPS-2`.
 *
 * @param {string} line
 * @param {string} prefix
 * @returns {string[] | undefined}
 */
function readBareRefLine(line, prefix) {
  const stripped = line.trim().replace(/\.$/u, '');
  if (stripped === '') return undefined;
  return readRefGroup(stripped, prefix);
}

/**
 * A `Closes: POPS-1` / `Fixes POPS-1, POPS-2` trailer line.
 *
 * @param {string} line
 * @param {string} prefix
 * @returns {string[] | undefined}
 */
function readKeywordTrailerLine(line, prefix) {
  const match = new RegExp(`^(?:${TRAILER_KEYWORDS})\\s*:?\\s+(.+?)\\.?$`, 'iu').exec(line.trim());
  if (match === null) return undefined;
  return readRefGroup(match[1] ?? '', prefix);
}

/**
 * Identifiers the body claims authorship of.
 *
 * Two shapes qualify, and prose naming identifiers qualifies as neither:
 *   - the body's final block consists solely of bare identifier lines;
 *   - any line is an explicit `Closes:`-style trailer.
 *
 * The final-block restriction is what separates `…\n\nPOPS-1452` (a trailer)
 * from a mid-body list under a `Follow-ups filed:` heading.
 *
 * @param {string} body
 * @param {string} prefix
 * @returns {string[]}
 */
export function bodyAuthorshipRefs(body, prefix) {
  /** @type {string[]} */
  const refs = [];

  for (const line of body.split('\n')) {
    const keyword = readKeywordTrailerLine(line, prefix);
    if (keyword !== undefined) refs.push(...keyword);
  }

  const blocks = body
    .split(/\n[ \t]*\n/u)
    .map((block) => block.trim())
    .filter((block) => block !== '');
  const lastBlock = blocks.at(-1);
  if (lastBlock !== undefined) {
    const lines = lastBlock.split('\n').filter((line) => line.trim() !== '');
    /** @type {string[]} */
    const blockRefs = [];
    const allBare = lines.every((line) => {
      const bare = readBareRefLine(line, prefix);
      if (bare === undefined) return false;
      blockRefs.push(...bare);
      return true;
    });
    if (allBare) refs.push(...blockRefs);
  }

  return [...new Set(refs)];
}

/**
 * @param {string} subject
 * @returns {boolean}
 */
export function isRevertSubject(subject) {
  return REVERT_RE.test(subject.trim());
}

/**
 * The partial-work marker in a subject, if any — `slice 4`, `phase 2`, `WIP`.
 *
 * @param {string} subject
 * @returns {string | undefined}
 */
export function partialWorkMarker(subject) {
  return PARTIAL_WORK_RE.exec(subject)?.[0];
}

/**
 * How one commit relates to one identifier.
 *
 * @param {Commit} commit
 * @param {string} identifier
 * @param {string} prefix
 * @returns {'fixes-subject' | 'fixes-body' | 'subject-mention' | 'body-mention' | 'none'}
 */
export function relateCommit(commit, identifier, prefix) {
  if (subjectAuthorshipRefs(commit.subject, prefix).includes(identifier)) return 'fixes-subject';
  if (bodyAuthorshipRefs(commit.body, prefix).includes(identifier)) return 'fixes-body';
  if (extractIdentifiers(commit.subject, prefix).includes(identifier)) return 'subject-mention';
  if (extractIdentifiers(commit.body, prefix).includes(identifier)) return 'body-mention';
  return 'none';
}

/**
 * @typedef {{
 *   identifier: string,
 *   title: string,
 *   status: string,
 *   verdict: 'orphan' | 'review' | 'mentioned' | 'no-match',
 *   fixes: FixCommit[],
 *   concerns: Concern[],
 *   mirrors: string[],
 * }} Verdict
 */

/**
 * Classify one issue against the full commit list.
 *
 * An authorship match promotes the issue to `orphan` only when nothing about
 * the matching commits undercuts it. A revert, or a subject marking the commit
 * as one instalment, demotes it to `review` — the tool never resolves that
 * judgement itself.
 *
 * @param {Issue} issue
 * @param {Commit[]} commits
 * @param {string} prefix
 * @returns {Verdict}
 */
export function classifyIssue(issue, commits, prefix) {
  /** @type {FixCommit[]} */
  const fixes = [];
  /** @type {Concern[]} */
  const concerns = [];

  for (const commit of commits) {
    const relation = relateCommit(commit, issue.identifier, prefix);
    if (relation === 'none') continue;
    const { sha, subject } = commit;

    if (relation === 'fixes-subject' || relation === 'fixes-body') {
      const evidence = relation === 'fixes-subject' ? 'subject-ref' : 'body-trailer';
      if (isRevertSubject(subject)) {
        concerns.push({ sha, subject, where: 'subject', why: 'named by a revert commit' });
        continue;
      }
      const marker = partialWorkMarker(subject);
      if (marker !== undefined) {
        concerns.push({
          sha,
          subject,
          where: 'subject',
          why: `subject marks this as one instalment ("${marker}")`,
        });
        continue;
      }
      fixes.push({ sha, subject, evidence });
      continue;
    }

    if (relation === 'subject-mention') {
      concerns.push({
        sha,
        subject,
        where: 'subject',
        why: 'named in the subject but not in an authorship position',
      });
      continue;
    }

    concerns.push({ sha, subject, where: 'body', why: 'named in the body as prose' });
  }

  return {
    identifier: issue.identifier,
    title: issue.title ?? '',
    status: issue.status ?? '',
    verdict: decideVerdict(fixes, concerns),
    fixes,
    concerns,
    mirrors: [],
  };
}

/**
 * Fold the per-commit evidence into one verdict.
 *
 * A subject-level concern outranks an authorship match: a ticket named both by
 * a commit that claims it and by one that only alludes to it is exactly the
 * case a sweep must not resolve on its own.
 *
 * @param {FixCommit[]} fixes
 * @param {Concern[]} concerns
 * @returns {'orphan' | 'review' | 'mentioned' | 'no-match'}
 */
function decideVerdict(fixes, concerns) {
  if (concerns.some((concern) => concern.where === 'subject')) return 'review';
  if (fixes.length > 0) return 'orphan';
  if (concerns.length > 0) return 'mentioned';
  return 'no-match';
}

/**
 * A commit subject with any trailing squash-merge PR number removed — the form
 * the GitHub sync gives a mirror issue its title.
 *
 * @param {string} subject
 * @returns {string}
 */
export function normaliseSubject(subject) {
  return subject
    .trimEnd()
    .replace(/\s*\(#\d+\)$/u, '')
    .trim();
}

/**
 * Issues whose title is exactly a merged commit subject: the PR mirrors the
 * GitHub sync minted.
 *
 * Equality is the whole test, deliberately — status is NOT consulted. Reading
 * `Merged` as the mirror signal would be circular, because that status is not
 * clean: human-filed tickets sit there too, and a mirror someone re-statused
 * would vanish from detection. Equality can in principle collide with a
 * human-filed ticket that reads exactly like a commit subject; nothing here
 * rules that out, and this result never closes anything — it feeds the report
 * and links an orphan to its mirror.
 *
 * @param {Issue[]} issues
 * @param {Commit[]} commits
 * @returns {{ identifier: string, title: string, status: string, sha: string }[]}
 */
export function findMirrors(issues, commits) {
  /** @type {Map<string, string>} */
  const bySubject = new Map();
  for (const commit of commits) {
    const key = normaliseSubject(commit.subject);
    if (!bySubject.has(key)) bySubject.set(key, commit.sha);
  }
  /** @type {{ identifier: string, title: string, status: string, sha: string }[]} */
  const mirrors = [];
  for (const issue of issues) {
    const title = (issue.title ?? '').trim();
    const sha = bySubject.get(title);
    if (sha === undefined) continue;
    mirrors.push({ identifier: issue.identifier, title, status: issue.status ?? '', sha });
  }
  return mirrors;
}

/**
 * @typedef {import('./huly-partition-plan.mjs').Coverage} Coverage
 * @typedef {import('./huly-partition-plan.mjs').CoverageVerdict} CoverageVerdict
 * @typedef {{
 *   eligible: Verdict[],
 *   skipped: Issue[],
 *   mirrors: { identifier: string, title: string, status: string, sha: string }[],
 *   commitCount: number,
 *   titledIssueCount: number,
 *   coverage: CoverageVerdict,
 * }} Report
 */

/**
 * Classify every issue, and match each verdict to the mirror issues whose
 * title claims authorship of it.
 *
 * Only issues in `ELIGIBLE_STATUS` are classified — a ticket already moving
 * through the workflow is not something a sweep should be reasoning about.
 *
 * `coverage` is what the export claims about its own completeness. Omitting it
 * does not default to complete — it produces an explicitly unknown verdict,
 * because an export that says nothing about how it was gathered has earned no
 * presumption either way.
 *
 * @param {Issue[]} issues
 * @param {Commit[]} commits
 * @param {string} prefix
 * @param {Coverage} [coverage]
 * @returns {Report}
 */
export function reconcile(issues, commits, prefix, coverage) {
  const mirrors = findMirrors(issues, commits);

  /** @type {Map<string, string[]>} */
  const mirrorsByTicket = new Map();
  for (const mirror of mirrors) {
    for (const ref of subjectAuthorshipRefs(mirror.title, prefix)) {
      mirrorsByTicket.set(ref, [...(mirrorsByTicket.get(ref) ?? []), mirror.identifier]);
    }
  }

  /** @type {Verdict[]} */
  const eligible = [];
  /** @type {Issue[]} */
  const skipped = [];
  for (const issue of issues) {
    if ((issue.status ?? '') !== ELIGIBLE_STATUS) {
      skipped.push(issue);
      continue;
    }
    const verdict = classifyIssue(issue, commits, prefix);
    verdict.mirrors = mirrorsByTicket.get(issue.identifier) ?? [];
    eligible.push(verdict);
  }

  return {
    eligible,
    skipped,
    mirrors,
    commitCount: commits.length,
    titledIssueCount: issues.filter((issue) => (issue.title ?? '').trim() !== '').length,
    coverage: assessCoverage(coverage, issues),
  };
}

/**
 * Read every commit reachable from `ref` as `{ sha, subject, body }`.
 *
 * Anchored at this repo's root unless a caller says otherwise. Inheriting the
 * process cwd would let the sweep read a different repository's history —
 * which finds no authorship anywhere and reports a clean backlog, the same
 * false negative in yet another disguise.
 *
 * @param {string} ref
 * @param {string} [cwd] Defaults to this repo's root.
 * @returns {Commit[]}
 */
export function readCommits(ref, cwd = repoRoot) {
  const format = `${RECORD_SEPARATOR}%H${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%b`;
  const raw = execFileSync('git', ['log', ref, `--format=${format}`], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  return parseGitLog(raw);
}

/**
 * @param {string} raw
 * @returns {Commit[]}
 */
export function parseGitLog(raw) {
  /** @type {Commit[]} */
  const commits = [];
  for (const record of raw.split(RECORD_SEPARATOR)) {
    if (record.trim() === '') continue;
    const [sha = '', subject = '', body = ''] = record.split(FIELD_SEPARATOR);
    commits.push({ sha: sha.trim(), subject: subject.trim(), body });
  }
  return commits;
}

/**
 * @param {unknown} parsed
 * @returns {unknown}
 */
function unwrapIssueList(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'object' && parsed !== null && 'result' in parsed) {
    return /** @type {{ result: unknown }} */ (parsed).result;
  }
  return undefined;
}

/**
 * Read an exported issue list, accepting either a bare array or the
 * `{ result: [...] }` envelope a tracker export arrives in.
 *
 * Every row must carry `identifier`, `title` and `status` as strings, and a
 * row that does not is a hard error rather than a skip. Defaulting any of
 * them would convert an export this tool cannot read into an export that
 * looks clean: a missing `status` reads as "not Backlog" and skips the row, a
 * missing `identifier` drops it, and a whole file of either reports zero
 * orphans over zero issues actually examined. That is the same false negative
 * the tool exists to prevent, arriving through the front door.
 *
 * @param {unknown} parsed
 * @returns {Issue[]}
 * @throws {Error} on a shape this tool cannot faithfully read.
 */
export function readIssues(parsed) {
  const list = unwrapIssueList(parsed);
  if (!Array.isArray(list)) {
    throw new Error('expected a JSON array of issues, or an object with a "result" array');
  }
  return list.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`issue at index ${index} is not an object`);
    }
    const record = /** @type {Record<string, unknown>} */ (entry);
    const rawIdentifier = record['identifier'];
    if (typeof rawIdentifier !== 'string' || rawIdentifier.trim() === '') {
      throw new Error(`issue at index ${index} has no string "identifier"`);
    }
    // Every field is trimmed on the way in, not merely validated trimmed. A
    // status of `"Backlog "` would otherwise pass the check and then fail the
    // `=== ELIGIBLE_STATUS` comparison, skipping the row — the same silent
    // false negative as omitting the field, wearing a valid-looking value.
    const identifier = rawIdentifier.trim();
    const where = `${identifier} (index ${index})`;
    const status = record['status'];
    if (typeof status !== 'string') {
      throw new Error(
        `${where} has no string "status" — every row needs one, or it would be silently ` +
          `skipped as not-${ELIGIBLE_STATUS} and the sweep would report a clean backlog`
      );
    }
    const title = record['title'];
    if (typeof title !== 'string') {
      throw new Error(`${where} has no string "title" — mirror detection reads it`);
    }
    return { identifier, title: title.trim(), status: status.trim() };
  });
}

/**
 * State the mirror count together with how much of the export it could
 * actually be derived from.
 *
 * Mirror detection reads titles, so a count stated over an export where only
 * some rows carry one describes a sweep narrower than it sounds. The line
 * says which of the three cases it is rather than letting a bare number
 * imply the whole export was examined.
 *
 * @param {Report} report
 * @returns {string}
 */
function mirrorCoverageLine(report) {
  const total = report.eligible.length + report.skipped.length;
  if (report.titledIssueCount === 0) {
    return 'PR mirrors: NOT CHECKED — no issue in the export carried a title to match against.';
  }
  if (report.titledIssueCount < total) {
    return (
      `PR mirrors found: ${report.mirrors.length} — but only ${report.titledIssueCount} of ` +
      `${total} rows carried a title, so the rest were not checked.`
    );
  }
  return `PR mirrors found across the whole export: ${report.mirrors.length}.`;
}

/**
 * @param {Report} report
 * @returns {string}
 */
export function formatReport(report) {
  const orphans = report.eligible.filter((verdict) => verdict.verdict === 'orphan');
  const review = report.eligible.filter((verdict) => verdict.verdict === 'review');
  const mentioned = report.eligible.filter((verdict) => verdict.verdict === 'mentioned');
  const lines = [];

  lines.push(
    ...formatCoverage(report.coverage),
    `Scanned ${report.commitCount} commits against ${report.eligible.length} ${ELIGIBLE_STATUS} ` +
      `issues (${report.skipped.length} skipped: not ${ELIGIBLE_STATUS}).`,
    mirrorCoverageLine(report),
    ''
  );

  lines.push(`ORPHANS — merged work still in ${ELIGIBLE_STATUS} (${orphans.length}):`);
  for (const verdict of orphans) {
    lines.push(`  ${verdict.identifier}  ${verdict.title}`);
    for (const fix of verdict.fixes) {
      lines.push(`      ${fix.evidence}  ${fix.sha.slice(0, 9)}  ${fix.subject}`);
    }
    if (verdict.mirrors.length > 0) lines.push(`      mirror: ${verdict.mirrors.join(', ')}`);
  }
  if (orphans.length === 0) lines.push('  (none)');
  lines.push('');

  lines.push(`NEEDS A HUMAN — ambiguous evidence (${review.length}):`);
  for (const verdict of review) {
    lines.push(`  ${verdict.identifier}  ${verdict.title}`);
    for (const fix of verdict.fixes) {
      lines.push(`      claims  ${fix.evidence}  ${fix.sha.slice(0, 9)}  ${fix.subject}`);
    }
    for (const concern of verdict.concerns) {
      lines.push(`      ${concern.why}  ${concern.sha.slice(0, 9)}  ${concern.subject}`);
    }
  }
  if (review.length === 0) lines.push('  (none)');
  lines.push('');

  lines.push(`MENTIONED IN A BODY ONLY — no action (${mentioned.length}):`);
  for (const verdict of mentioned) {
    lines.push(
      `  ${verdict.identifier}  ${verdict.title}` +
        `  [${verdict.concerns.map((concern) => concern.sha.slice(0, 9)).join(', ')}]`
    );
  }
  if (mentioned.length === 0) lines.push('  (none)');

  return lines.join('\n');
}

/**
 * The value following `flag`, or `undefined` when the flag is absent or was
 * given nothing to take.
 *
 * A following token that is itself a flag is not a value: `--issues --json`
 * would otherwise read `--json` as the path and die on ENOENT several steps
 * later, instead of saying which argument was missing.
 *
 * @param {string[]} args
 * @param {string} flag
 * @returns {string | undefined}
 */
export function readFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('-')) return undefined;
  return value;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/huly-backlog-reconcile.mjs --issues <path.json> ' +
        `[--ref ${DEFAULT_REF}] [--prefix ${DEFAULT_PREFIX}] [--json]\n` +
        '       node scripts/huly-backlog-reconcile.mjs --self-test\n\n' +
        `Cross-references every ${ELIGIBLE_STATUS} issue in the export against commit ` +
        'messages on the ref, and reports which ones already shipped. Reads only; ' +
        'applying a verdict to the tracker is a separate, deliberate act.\n\n' +
        'The export may carry a "coverage" block stating which queries produced it ' +
        'and how many rows each returned; every report opens by saying whether that ' +
        'covers the whole backlog, and exits 3 when it demonstrably does not. See ' +
        'huly-partition-plan.mjs --help for how to gather one.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const issuesPath = readFlag(args, '--issues');
  if (issuesPath === undefined) {
    console.error('FAIL — --issues <path.json> is required. See --help.');
    process.exit(2);
  }
  const ref = readFlag(args, '--ref') ?? DEFAULT_REF;
  const prefix = readFlag(args, '--prefix') ?? DEFAULT_PREFIX;

  /** @type {Issue[]} */
  let issues;
  /** @type {Coverage | undefined} */
  let coverage;
  try {
    const parsed = JSON.parse(readFileSync(issuesPath, 'utf8'));
    issues = readIssues(parsed);
    coverage = readCoverage(parsed);
  } catch (error) {
    // Exit 2, not a stack trace. Every refusal in `readIssues` and
    // `readCoverage` names the row it choked on, and that message is the whole
    // value — burying it under a trace, on the exit code that means "the sweep
    // found something", loses both halves.
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`FAIL — could not read ${issuesPath}: ${detail}`);
    process.exit(2);
  }
  const report = reconcile(issues, readCommits(ref), prefix, coverage);

  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
  // An export that declares its own coverage and fails it must not exit 0: a
  // caller reading only the status code would otherwise treat a partial sweep
  // as a clean one. An export declaring nothing keeps exit 0 — unknown is not
  // the same as known-bad, and the report says which it is.
  process.exit(report.coverage.declared && !report.coverage.complete ? 3 : 0);
}

/**
 * The two shapes that decide whether this tool is safe to run against a live
 * backlog, both taken from real commits on this repo's `main`:
 *
 *   - a body whose last line is a bare identifier IS the commit's ticket;
 *   - a body listing follow-ups filed by the work is NOT, and a grep would
 *     have closed all four of them.
 *
 * @returns {boolean}
 */
function selfTest() {
  /**
   * @param {() => unknown} fn
   * @returns {boolean}
   */
  const throws = (fn) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };

  const fixesBodyTrailer = {
    sha: 'e0b471ae1',
    subject:
      'fix(bfm,food,cerebrum): drop redundant 503 check in isUnavailableError copies (#3919)',
    body: 'Both files now use the same two-clause form as the other six\nper-pillar copies.\n\nPOPS-1452\n',
  };
  const mentionsFollowUps = {
    sha: '048d73682',
    subject: 'feat(ios): authenticating middleware with single-flight refresh (POPS-1382)',
    body: 'The seam is a ClientMiddleware rather than the ClientTransport.\n\nFollow-ups filed: POPS-1647, POPS-1648, POPS-1653, POPS-1654.\n',
  };
  const commits = [fixesBodyTrailer, mentionsFollowUps];
  const asBacklog = (/** @type {string} */ identifier) => ({
    identifier,
    title: identifier,
    status: ELIGIBLE_STATUS,
  });

  const followUps = ['POPS-1647', 'POPS-1648', 'POPS-1653', 'POPS-1654'];

  const checks = {
    'a trailing (POPS-n) subject group is authorship':
      subjectAuthorshipRefs('fix(x): thing (POPS-1)', 'POPS').join() === 'POPS-1',
    'a squash-merge PR number is peeled past':
      subjectAuthorshipRefs('fix(x): thing (POPS-1) (#3945)', 'POPS').join() === 'POPS-1',
    'a comma-separated group yields both refs':
      subjectAuthorshipRefs('feat(x): thing (POPS-1599, POPS-1592)', 'POPS').join() ===
      'POPS-1599,POPS-1592',
    'a slice group is not authorship':
      subjectAuthorshipRefs('feat(x): thing (POPS-237 slice 1)', 'POPS').length === 0,
    'a prefix is not matched inside a longer identifier': !extractIdentifiers(
      'POPS-1452',
      'POPS'
    ).includes('POPS-145'),
    'a bare trailing identifier line is authorship':
      bodyAuthorshipRefs(fixesBodyTrailer.body, 'POPS').join() === 'POPS-1452',
    'a follow-ups prose line is NOT authorship':
      bodyAuthorshipRefs(mentionsFollowUps.body, 'POPS').length === 0,
    'the worked example is an orphan':
      classifyIssue(asBacklog('POPS-1452'), commits, 'POPS').verdict === 'orphan',
    'every follow-up the same batch merely mentions stays open': followUps.every(
      (identifier) => classifyIssue(asBacklog(identifier), commits, 'POPS').verdict === 'mentioned'
    ),
    'a non-Backlog issue is never classified':
      reconcile([{ identifier: 'POPS-1452', title: '', status: 'Done' }], commits, 'POPS').eligible
        .length === 0,
    'an export row with no status is refused, not skipped as not-Backlog': throws(() =>
      readIssues([{ identifier: 'POPS-1', title: 't' }])
    ),
    'an export with no titles reports mirrors as unchecked, not as zero': formatReport(
      reconcile([{ identifier: 'POPS-1', title: '', status: ELIGIBLE_STATUS }], commits, 'POPS')
    ).includes('NOT CHECKED'),
    'an export that declares no coverage says UNKNOWN rather than reading as a whole sweep':
      formatReport(reconcile([], commits, 'POPS')).includes('COVERAGE: UNKNOWN'),
    'an export whose query sat on the cap says INCOMPLETE': formatReport(
      reconcile([asBacklog('POPS-1')], commits, 'POPS', {
        limit: 1,
        statuses: [ELIGIBLE_STATUS],
        cells: [{ filter: { status: ELIGIBLE_STATUS }, count: 1 }],
      })
    ).includes('COVERAGE: INCOMPLETE'),
    'a tiling export is reported complete': reconcile([asBacklog('POPS-1')], commits, 'POPS', {
      limit: 200,
      statuses: [ELIGIBLE_STATUS],
      cells: [{ filter: { status: ELIGIBLE_STATUS }, count: 1 }],
    }).coverage.complete,
    'a mirror is matched on the subject minus its PR number':
      findMirrors(
        [
          {
            identifier: 'POPS-1575',
            title: 'fix(bfm,food,cerebrum): drop redundant 503 check in isUnavailableError copies',
            status: 'Merged',
          },
        ],
        commits
      ).length === 1,
  };

  const failed = Object.entries(checks).filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.error(`self-test FAILED: ${failed.map(([name]) => name).join('; ')}`);
    return false;
  }
  console.log(`self-test OK — ${Object.keys(checks).length} assertions passed.`);
  return true;
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
