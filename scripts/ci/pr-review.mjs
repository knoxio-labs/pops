#!/usr/bin/env node
/**
 * Driver for the compounding PR reviewer (advisory layer of the review gate).
 *
 * The deterministic guards in `agent-review.yml` are the blocking checks; this
 * only comments, so an unreachable model can never gate a PR. What changed
 * relative to the reviewer it replaces is not the authority, it is the memory:
 * the old one posted a fresh verdict comment on every push with no idea what it
 * had already said, so a ten-push PR collected ten overlapping opinions and no
 * record of which concerns had been dealt with. This one edits ONE comment,
 * reviews only the commits pushed since the last run, carries open findings
 * forward, and marks a finding resolved when the code it pointed at is gone —
 * or, when the fix belongs in a different file than the one the finding is
 * anchored to, when that file has it.
 *
 * Two subcommands, either side of the model call:
 *
 *   plan     decide what to review and write the reviewer's prompt
 *   publish  fold the reviewer's findings into state and render the comment
 *
 * Splitting it this way keeps every decision that must be reproducible — which
 * commits to look at, what a finding's identity is, whether it is still open —
 * in code that is tested, and leaves the workflow holding the model invocation
 * and two API calls.
 *
 * The credential is `CLAUDE_CODE_OAUTH_TOKEN` and the caller is the Claude Code
 * CLI, not the Messages API. That is not a stylistic choice: a subscription
 * token authenticates the CLI and is rejected by `api.anthropic.com` with an
 * `x-api-key` header, which is why this shells out rather than calling `fetch`
 * the way its predecessor did.
 *
 * Stdlib only — see the note in `pr-review-state.mjs`.
 *
 * Usage:
 *   node scripts/ci/pr-review.mjs plan --base <sha> --head <sha> --out-dir <d> \
 *     --findings-path <f> [--comment-file <f>] [--max-diff-bytes <n>]
 *   node scripts/ci/pr-review.mjs publish --head <sha> --mode <m> \
 *     --findings <f> --out <f> [--comment-file <f>] [--repo-root <d>]
 *   node scripts/ci/pr-review.mjs --self-test
 *
 * Exit 0 = done. Exit 1 = self-test failure. Exit 2 = usage error.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  applyRejudgement,
  computeDiffRange,
  findingFromModel,
  merge,
  parseState,
  rejudgeable,
  render,
  verifyStatus,
} from './pr-review-state.mjs';

/**
 * The rubric, unchanged in substance from the reviewer this replaces: these are
 * the hard rules in AGENTS.md, and they are the ones a deterministic guard
 * cannot decide. The guards already own contract isolation and the lib/pillar
 * direction mechanically; asking the model to re-derive them wastes the one
 * thing it is better at, which is judging intent.
 */
const RUBRIC = [
  'No `as any`, no `as unknown as T`, no `eslint-disable` / `oxlint-disable` / `ts-ignore` / `ts-expect-error` / `biome-ignore`, and no config-level equivalent (an ignore list, a per-file override, a relaxed rule in a nested config).',
  "No cross-contract reach-behind — importing another unit's `src/`, `dist/`, or internals rather than its published contract; and a lib never depends on a pillar.",
  'No orphan TODO. A TODO is only allowed alongside a filed ticket it references by id.',
  'No reference to Claude, AI, or any assistant in commit messages, the PR body, or source files.',
  'For any new or relocated unit, the extract-to-own-repo litmus is satisfied: it could build, deploy and self-register in its own repository, changing only where shared dependencies come from.',
  'New behaviour ships with tests in the same change, and a bug fix ships with a test that fails without the fix. A test that would pass against the broken implementation is a finding.',
  'No secret, token, key or connection string in source, config, fixtures, logs, or test output.',
];

const PROMPT_TEMPLATE = `You are reviewing a pull request in the POPS federation monorepo. Report only
defects you can point at in the diff below.

{scope}

These invariants are non-negotiable in this repository, and a violation of any
of them is a finding regardless of how small the change is:

- {rubric}

Beyond the invariants, review for, in priority order:
  1. Correctness — logic that does not do what it says, broken conditionals,
     unhandled error paths, contract/consumer mismatches, migrations that are
     not safe to run twice.
  2. Operational risk — anything that could lose data, break a restore path,
     leave a service unreachable, or make a required check unsatisfiable.
  3. Deviation from repository convention — read neighbouring files before
     claiming something is unconventional.

Do NOT report: style the formatter owns, missing comments, speculative
refactors, or anything you have not confirmed by reading the surrounding file.

Severity is not a feeling about how much you dislike the code. \`high\` is the
only severity that blocks a merge, so assign it only when one of these is true,
and say which in the body:

  - it violates one of the non-negotiable invariants listed above; or
  - it is a correctness or operational-risk defect for which you can state a
    concrete failure — the input, state or sequence that produces the wrong
    output, the data loss, or the unreachable service.

If you cannot name that failure, it is not \`high\`. Use \`medium\` for a real
defect whose consequence is contained, and \`low\` for anything a reasonable
reviewer could wave through. Severity inflation is itself a defect: it trains
the humans reading you to stop believing \`high\`, and a blocked merge has a
cost you do not see.

{carried}

{rejudge}

Write your findings as JSON to \`{out}\` in exactly this shape:

{"findings": [
  {"file": "path/relative/to/repo/root",
   "title": "one line, under 80 chars",
   "severity": "high" | "medium" | "low",
   "snippet": "the exact offending line(s), copied verbatim from the file",
   "body": "what is wrong and what the consequence is, 1-3 sentences",
   "remedy": {"file": "path where the fix has to land",
              "contains": "text whose presence there means this is fixed"}}
]}

The \`snippet\` field is load-bearing: it is how a finding is tracked across
pushes and how it is later detected as fixed. Copy it verbatim from the file —
do not paraphrase, do not add line numbers, do not include surrounding context.
If a finding is about something absent rather than something present, omit
\`snippet\` entirely.

\`remedy\` is optional and is what makes a CROSS-FILE fix visible. Set it
whenever the code you are pointing at is fine and the fix belongs in a
different file — "this file declares X and some other file must provide it" is
the common shape. \`file\` is where the fix has to land, and \`contains\` is
the exact text whose presence in that file means the problem is gone: a key
name, a declaration, an entry. Choose text specific enough that it cannot
already be there today, and check that it is not. Without \`remedy\`, a finding
anchored to A whose fix lands in B stays open forever — the snippet in A is
still present, and still correct. Omit it when the fix belongs in the file you
anchored to; that case is already handled by \`snippet\`.

Report an empty list if the diff is clean. An empty list is a normal outcome and
is strongly preferred to a padded one.

If you were given a RE-JUDGE list above, add a \`resolved\` key to the same JSON
object naming the ids whose defect no longer holds:

{"findings": [...], "resolved": ["<id>", "<id>"]}

Judge each one by reading the current file, not the quoted snippet: the snippet
is only an anchor, and it can still be present in code where it is correct.
Name an id only when you have read the file and the defect described is not
there any more. Omit \`resolved\` entirely if you clear none — an id you are
unsure about is an id you leave out.

Here is the diff:

\`\`\`diff
{diff}
\`\`\`
`;

const CARRIED_NONE = 'This is the first review of this pull request.';

const REJUDGE_NONE =
  'No carried finding is up for re-judgement this run: none of them is ' +
  'anchored to a file this diff touches, so none of them can have been fixed ' +
  'by it. Do not add a `resolved` key.';

/**
 * Ask about the carried findings this diff could plausibly have fixed.
 *
 * The snippet is quoted so the reviewer knows which line the finding was
 * anchored to, and told explicitly that the snippet is not the question —
 * POPS-2669 is a finding whose anchor is still present in a *different* branch
 * of the same file, where it is correct and required, so a reviewer that
 * answers "the line is still there" reproduces the bug this exists to fix.
 *
 * @param {import('./pr-review-state.mjs').Finding[]} findings
 * @returns {string}
 */
function rejudgeBlock(findings) {
  if (findings.length === 0) return REJUDGE_NONE;
  const entries = findings
    .map((f) =>
      [
        `- id: ${f.id}`,
        `  file: ${f.file}`,
        `  title: ${f.title}`,
        `  reported: ${f.body}`,
        `  anchored to: ${f.snippet === null ? '(nothing — this finding is about something absent)' : f.snippet}`,
      ].join('\n')
    )
    .join('\n');
  return (
    'RE-JUDGE list. Each finding below was reported on an earlier commit of ' +
    'this PR and is still recorded as open, and this diff touches the file it ' +
    'is anchored to — so it may have been fixed. Open each file and decide ' +
    'whether the defect described is still there. The `anchored to` snippet is ' +
    'a locator, NOT the question: it can still appear in the file in code where ' +
    'it is correct.\n\n' +
    entries
  );
}

const SCOPE = {
  full: 'Review the complete diff of this pull request against its base branch.',
  incremental:
    'Earlier commits on this branch were already reviewed. The diff below ' +
    'contains ONLY the commits pushed since. Review just these changes, though ' +
    'you may read any file in the repository for context.',
};

/**
 * @param {string[]} openFindings rendered `file: title` lines
 * @returns {string}
 */
function carriedBlock(openFindings) {
  if (openFindings.length === 0) return CARRIED_NONE;
  return (
    'These findings were already reported on earlier commits of this PR and are ' +
    'still open. Do NOT report them again — they are tracked automatically. ' +
    'Report only problems not in this list:\n\n' +
    openFindings.map((line) => `- ${line}`).join('\n')
  );
}

/**
 * Fill `{name}` placeholders in one pass.
 *
 * One pass rather than a loop of `replaceAll` calls, because a later
 * substitution must never see an earlier one's output: the diff and the carried
 * findings are attacker-adjacent text, and a diff that happens to contain the
 * literal `{diff}` would otherwise be re-expanded. The prompt's own JSON braces
 * are left alone because only the named keys match.
 *
 * @param {string} template
 * @param {Record<string, string>} values
 * @returns {string}
 */
function fill(template, values) {
  const keys = Object.keys(values);
  if (keys.length === 0) return template;
  const pattern = new RegExp(`\\{(${keys.join('|')})\\}`, 'gu');
  return template.replace(pattern, (match, key) => values[key] ?? match);
}

/**
 * @param {string[]} args
 * @param {string} repoRoot
 * @returns {string}
 */
function git(args, repoRoot) {
  return execFileSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * @param {string} repoRoot
 * @returns {(a: string, b: string) => boolean}
 */
function ancestorCheck(repoRoot) {
  return (a, b) =>
    spawnSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', a, b], {
      stdio: 'ignore',
    }).status === 0;
}

/**
 * Read a file as of the reviewed commit, not from the working tree.
 *
 * The reviewer runs with Write access in this same checkout. Reading the
 * worktree would let a stray write during its investigation decide that a real
 * finding is resolved, and that verdict is then persisted. Reading the commit
 * makes the verification independent of anything the reviewer did to the disk,
 * and is the more accurate question anyway: the finding is about the code being
 * reviewed.
 *
 * @param {string} repoRoot
 * @param {string} headSha
 * @returns {(path: string) => string | null}
 */
function commitReader(repoRoot, headSha) {
  return (path) => {
    const result = spawnSync('git', ['-C', repoRoot, 'show', `${headSha}:${path}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return result.status === 0 && typeof result.stdout === 'string' ? result.stdout : null;
  };
}

/**
 * @param {string | undefined} path
 * @returns {string | null}
 */
function readIfPresent(path) {
  if (!path || !existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

/** @param {Record<string, string>} opts */
function cmdPlan(opts) {
  const repoRoot = opts['repo-root'] ?? '.';
  const outDir = opts['out-dir'];
  const findingsPath = opts['findings-path'];
  if (!opts.base || !opts.head || !outDir || !findingsPath) {
    usage('plan needs --base, --head, --out-dir and --findings-path');
  }
  mkdirSync(outDir, { recursive: true });

  const prior = parseState(readIfPresent(opts['comment-file']));
  const { range, mode } = computeDiffRange(
    opts.base,
    opts.head,
    prior.last_reviewed_sha,
    ancestorCheck(repoRoot)
  );
  writeFileSync(join(outDir, 'mode'), mode);
  if (mode === 'empty') return;

  // Excluding lockfiles and generated trees here rather than in the workflow
  // keeps the exclusion visible next to the prompt that consumes the diff.
  let diff = git(
    [
      'diff',
      '--unified=8',
      range,
      '--',
      '.',
      ':(exclude)**/pnpm-lock.yaml',
      ':(exclude)**/node_modules/**',
      ':(exclude)**/dist/**',
    ],
    repoRoot
  );
  const maxBytes = Number(opts['max-diff-bytes'] ?? 180_000);
  if (diff.length > maxBytes) diff = `${diff.slice(0, maxBytes)}\n\n[diff truncated]\n`;

  const touched = git(['diff', '--name-only', range], repoRoot)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const upForRejudgement = rejudgeable(prior.findings, touched);
  const offered = new Set(upForRejudgement.map((f) => f.id));
  writeFileSync(join(outDir, 'rejudge.json'), JSON.stringify({ offered: [...offered] }));

  // A finding up for re-judgement is deliberately kept OUT of the do-not-report
  // list: the reviewer is being asked about it, and telling it not to mention
  // the thing it is being asked about is how a prompt talks itself in circles.
  const carried = prior.findings
    .filter((f) => f.status === 'open' && !offered.has(f.id))
    .map((f) => `${f.file}: ${f.title}`);

  writeFileSync(
    join(outDir, 'prompt.txt'),
    fill(PROMPT_TEMPLATE, {
      scope: SCOPE[mode],
      rubric: RUBRIC.join('\n- '),
      carried: carriedBlock(carried),
      rejudge: rejudgeBlock(upForRejudgement),
      out: findingsPath,
      diff: diff || '(no textual changes)',
    })
  );
}

/**
 * The ids `plan` offered the reviewer for re-judgement this run.
 *
 * Absent or unreadable yields an empty set, so nothing can be re-judged. Every
 * failure of this file leaves the gate exactly as closed as it was, which is
 * the direction POPS-2669 argues for: an unread finding merging is the worse
 * failure.
 *
 * @param {string | undefined} path
 * @returns {string[]}
 */
function offeredForRejudgement(path) {
  const raw = readIfPresent(path);
  if (raw === null) return [];
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(raw);
    const offered =
      typeof parsed === 'object' && parsed !== null
        ? /** @type {Record<string, unknown>} */ (parsed).offered
        : undefined;
    return Array.isArray(offered) ? offered.filter(isString) : [];
  } catch {
    console.error('::warning::unreadable rejudge list; no carried finding will be re-judged');
    return [];
  }
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isString(value) {
  return typeof value === 'string';
}

/**
 * The finding ids the reviewer says no longer hold.
 *
 * Read from the same file as the findings so a reviewer that wrote no file, or
 * wrote an unparseable one, clears nothing.
 *
 * @param {string | null} rawFindings
 * @returns {string[]}
 */
function modelResolvedIds(rawFindings) {
  if (rawFindings === null) return [];
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(rawFindings);
    const resolved =
      typeof parsed === 'object' && parsed !== null
        ? /** @type {Record<string, unknown>} */ (parsed).resolved
        : undefined;
    return Array.isArray(resolved) ? resolved.filter(isString) : [];
  } catch {
    return [];
  }
}

/** @param {Record<string, string>} opts */
function cmdPublish(opts) {
  const repoRoot = opts['repo-root'] ?? '.';
  if (!opts.head || !opts.mode || !opts.findings || !opts.out) {
    usage('publish needs --head, --mode, --findings and --out');
  }
  const prior = parseState(readIfPresent(opts['comment-file']));

  /** @type {import('./pr-review-state.mjs').Finding[]} */
  const incoming = [];
  const rawFindings = readIfPresent(opts.findings);
  if (rawFindings !== null) {
    let parsed;
    try {
      parsed = JSON.parse(rawFindings);
    } catch {
      // Keeping prior state is survivable; doing it silently is not — that
      // looks exactly like a clean review.
      console.error('::warning::reviewer produced unparseable JSON; keeping prior state');
      parsed = null;
    }
    const list =
      typeof parsed === 'object' && parsed !== null && Array.isArray(parsed.findings)
        ? parsed.findings
        : [];
    for (const item of list) {
      try {
        incoming.push(findingFromModel(item, opts.head));
      } catch {
        // One malformed finding must not discard the rest of the run, nor the
        // carried state.
        console.error('::warning::dropped one malformed finding from the reviewer output');
      }
    }
  }

  const verified = verifyStatus(
    applyRejudgement(
      merge(prior.findings, incoming),
      offeredForRejudgement(opts.rejudge),
      modelResolvedIds(rawFindings),
      opts.head
    ),
    commitReader(repoRoot, opts.head),
    opts.head
  );
  const state = {
    version: prior.version,
    last_reviewed_sha: opts.head,
    findings: verified,
  };
  writeFileSync(opts.out, render(state, opts.head, opts.mode));

  const open = verified.filter((f) => f.status === 'open').length;
  console.log(`${open} open, ${verified.length - open} resolved`);
}

/**
 * Prove the bookkeeping still works, including the cases that broke it before.
 *
 * ADR-045's rule applies here even though this is not a guard over the source
 * tree: the failure mode of every part of this file is silence — a state block
 * that stopped parsing, a snippet match that stopped matching, a prompt with an
 * empty rubric — and silence renders as a clean review. Each case below is
 * watched failing against a broken version before it is trusted; the detailed
 * cases live in `__tests__/pr-review-state.test.ts` and
 * `__tests__/pr-review.test.ts`.
 *
 * @returns {boolean}
 */
function selfTest() {
  /** @type {string[]} */
  const failures = [];
  /** @param {string} label @param {boolean} ok */
  const check = (label, ok) => {
    if (!ok) failures.push(label);
  };

  /** @param {Partial<import('./pr-review-state.mjs').Finding>} over */
  const finding = (over) => ({
    ...findingFromModel({ file: 'a.ts', title: 't', snippet: 'const x = 1;' }, 'sha1'),
    ...over,
  });

  // The degenerate case that is not degenerate at all: review prose routinely
  // contains `}` and can contain `-->`. Embedded raw in the HTML comment,
  // either truncates the state block and every finding is silently forgotten.
  const hostile = finding({ body: 'closes with --> and a } brace', title: 'hostile { prose }' });
  const rendered = render(
    { version: 1, last_reviewed_sha: 'sha1', findings: [hostile] },
    'sha1',
    'full'
  );
  const round = parseState(rendered);
  check('state survives a round trip', round.findings.length === 1);
  check('state survives hostile prose', round.findings[0]?.body === hostile.body);
  check('last reviewed sha survives', round.last_reviewed_sha === 'sha1');

  // Discovery floor: a reviewer prompt with no rubric and no diff placeholder
  // still renders as a perfectly plausible prompt and reviews nothing.
  check('rubric is not empty', RUBRIC.length >= 5);
  for (const key of ['{scope}', '{rubric}', '{carried}', '{rejudge}', '{out}', '{diff}']) {
    check(`prompt template keeps ${key}`, PROMPT_TEMPLATE.includes(key));
  }
  const filled = fill(PROMPT_TEMPLATE, {
    scope: SCOPE.full,
    rubric: RUBRIC.join('\n- '),
    carried: carriedBlock(['a.ts: t']),
    rejudge: rejudgeBlock([finding({ id: 'abc123abc123' })]),
    out: '/tmp/f.json',
    diff: 'DIFFBODY',
  });
  check('filled prompt carries the diff', filled.includes('DIFFBODY'));
  check('filled prompt carries the rubric', filled.includes(RUBRIC[0] ?? ''));
  check('filled prompt keeps the JSON shape', filled.includes('"severity"'));
  check(
    'filled prompt still asks for a cross-file remedy',
    filled.includes('"remedy"') && filled.includes('CROSS-FILE')
  );
  check(
    'filled prompt defines what earns the blocking severity',
    filled.includes('only severity that blocks a merge') && filled.includes('concrete failure')
  );
  check(
    'filled prompt has no placeholders left',
    !/\{(scope|rubric|carried|rejudge|out|diff)\}/u.test(filled)
  );

  // The re-judge block is the whole POPS-2669 fix, and a prompt that quietly
  // stopped carrying it renders as a perfectly ordinary review that never
  // resolves anything.
  check('filled prompt names the finding up for re-judgement', filled.includes('abc123abc123'));
  check('filled prompt asks for the resolved key', filled.includes('"resolved"'));
  check(
    'filled prompt says the snippet is not the question',
    filled.includes('is a locator, NOT the question')
  );
  check(
    'an empty re-judge list tells the reviewer not to answer',
    rejudgeBlock([]).includes('Do not add a `resolved` key')
  );

  // Only an offered id can clear a finding, and only for a file the diff
  // touched. Both halves are what keeps a hallucinated id from resolving a
  // real defect.
  const carriedOpen = finding({ id: 'offered-id', file: 'a.ts' });
  check(
    'a finding on an untouched file is never offered',
    rejudgeable([carriedOpen], ['b.ts']).length === 0
  );
  check(
    'a finding on a touched file is offered',
    rejudgeable([carriedOpen], ['a.ts']).length === 1
  );
  check(
    'a resolved finding is never offered',
    rejudgeable([finding({ id: 'x', status: 'resolved' })], ['a.ts']).length === 0
  );
  check(
    'an unoffered id cannot clear a finding',
    applyRejudgement([carriedOpen], [], ['offered-id'], 'sha2')[0]?.judged_absent_in === null
  );
  check(
    'an offered id the reviewer named clears the finding',
    applyRejudgement([carriedOpen], ['offered-id'], ['offered-id'], 'sha2')[0]?.judged_absent_in ===
      'sha2'
  );
  check(
    'a cleared finding resolves even while its snippet is still present',
    verifyStatus(
      applyRejudgement([carriedOpen], ['offered-id'], ['offered-id'], 'sha2'),
      () => 'const x = 1;',
      'sha2'
    )[0]?.status === 'resolved'
  );
  check(
    'a finding nobody cleared still resolves only on its snippet going away',
    verifyStatus([carriedOpen], () => 'const x = 1;', 'sha2')[0]?.status === 'open'
  );
  check(
    'reporting a cleared finding again reopens it',
    verifyStatus(
      merge(applyRejudgement([carriedOpen], ['offered-id'], ['offered-id'], 'sha2'), [
        finding({ id: 'offered-id' }),
      ]),
      () => 'const x = 1;',
      'sha3'
    )[0]?.status === 'open'
  );

  // Status is recomputed from the tree, both directions.
  const gone = verifyStatus([finding({})], () => 'unrelated content', 'sha2');
  check('a vanished snippet resolves', gone[0]?.status === 'resolved');
  check('resolution records the sha', gone[0]?.resolved_in === 'sha2');
  const still = verifyStatus([finding({})], () => 'const   x  =  1;', 'sha2');
  check('a reindented snippet stays open', still[0]?.status === 'open');
  const back = verifyStatus(
    [finding({ status: 'resolved', resolved_in: 'sha2' })],
    () => 'const x = 1;',
    'sha3'
  );
  check('reintroduced code reopens', back[0]?.status === 'open' && back[0]?.resolved_in === null);

  // POPS-2705: the anchor is still there, and still correct — the fix landed
  // in another file. Checking the anchor alone answers "open" forever, and on
  // a repo that gates on findings that blocks a merge nothing can clear.
  const crossFile = finding({ remedy: { file: 'b.yml', contains: 'the_missing_key:' } });
  const landed = verifyStatus(
    [crossFile],
    (path) => (path === 'b.yml' ? 'the_missing_key: value' : 'const x = 1;'),
    'sha2'
  );
  check(
    'a fix in another file resolves the finding',
    landed[0]?.status === 'resolved' && landed[0]?.resolved_in === 'sha2'
  );
  const notLanded = verifyStatus(
    [crossFile],
    (path) => (path === 'b.yml' ? 'something else entirely' : 'const x = 1;'),
    'sha2'
  );
  check('an unlanded remedy leaves the finding open', notLanded[0]?.status === 'open');

  // A dangling last-reviewed sha (rebase, force-push) must fall back to full.
  check(
    'a dangling sha falls back to a full review',
    computeDiffRange('base', 'head', 'dangling', () => false).mode === 'full'
  );
  check(
    'an unchanged head is empty',
    computeDiffRange('base', 'head', 'head', () => true).mode === 'empty'
  );

  // Corrupt bookkeeping degrades, never throws.
  check(
    'a corrupt state block degrades',
    parseState('<!-- pr-review-state: !!! -->').findings.length === 0
  );
  check(
    'a foreign version degrades',
    parseState(`<!-- pr-review-state: ${Buffer.from('{"version":99}').toString('base64')} -->`)
      .findings.length === 0
  );

  for (const failure of failures) console.error(`  FAIL ${failure}`);
  if (failures.length > 0) {
    console.error(`self-test: ${failures.length} of the reviewer's invariants no longer hold.`);
    return false;
  }
  console.log(
    'self-test OK — state round-trips, status recomputes, re-judgement is bounded, prompt is complete.'
  );
  return true;
}

/**
 * @param {string} message
 * @returns {never}
 */
function usage(message) {
  console.error(`pr-review: ${message}`);
  console.error(
    'Usage:\n' +
      '  node scripts/ci/pr-review.mjs plan --base <sha> --head <sha> --out-dir <d> --findings-path <f>\n' +
      '  node scripts/ci/pr-review.mjs publish --head <sha> --mode <m> --findings <f> --out <f>\n' +
      '    [--rejudge <f>] ids `plan` offered for re-judgement; without it nothing is re-judged\n' +
      '  node scripts/ci/pr-review.mjs --self-test'
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
    if (arg === undefined) break;
    if (!arg.startsWith('--')) usage(`unexpected argument \`${arg}\``);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) usage(`\`${arg}\` needs a value`);
    opts[arg.slice(2)] = value;
    i += 1;
  }
  return opts;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }
  const [command, ...rest] = argv;
  const opts = parseFlags(rest);
  if (command === 'plan') cmdPlan(opts);
  else if (command === 'publish') cmdPublish(opts);
  else usage(`unknown command \`${command ?? '(none)'}\``);
}

if (import.meta.main) {
  main();
}

export { carriedBlock, fill, selfTest, PROMPT_TEMPLATE, RUBRIC, SCOPE };
