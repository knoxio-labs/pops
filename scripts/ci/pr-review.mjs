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
 * forward, and marks a finding resolved when the code it pointed at is gone.
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
  computeDiffRange,
  findingFromModel,
  merge,
  parseState,
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

{carried}

Write your findings as JSON to \`{out}\` in exactly this shape:

{"findings": [
  {"file": "path/relative/to/repo/root",
   "title": "one line, under 80 chars",
   "severity": "high" | "medium" | "low",
   "snippet": "the exact offending line(s), copied verbatim from the file",
   "body": "what is wrong and what the consequence is, 1-3 sentences"}
]}

The \`snippet\` field is load-bearing: it is how a finding is tracked across
pushes and how it is later detected as fixed. Copy it verbatim from the file —
do not paraphrase, do not add line numbers, do not include surrounding context.
If a finding is about something absent rather than something present, omit
\`snippet\` entirely.

Report an empty list if the diff is clean. An empty list is a normal outcome and
is strongly preferred to a padded one.

Here is the diff:

\`\`\`diff
{diff}
\`\`\`
`;

const CARRIED_NONE = 'This is the first review of this pull request.';

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
  return template.replace(pattern, (_match, key) => values[key]);
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

  const carried = prior.findings
    .filter((f) => f.status === 'open')
    .map((f) => `${f.file}: ${f.title}`);

  writeFileSync(
    join(outDir, 'prompt.txt'),
    fill(PROMPT_TEMPLATE, {
      scope: SCOPE[mode],
      rubric: RUBRIC.join('\n- '),
      carried: carriedBlock(carried),
      out: findingsPath,
      diff: diff || '(no textual changes)',
    })
  );
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
    merge(prior.findings, incoming),
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
  for (const key of ['{scope}', '{rubric}', '{carried}', '{out}', '{diff}']) {
    check(`prompt template keeps ${key}`, PROMPT_TEMPLATE.includes(key));
  }
  const filled = fill(PROMPT_TEMPLATE, {
    scope: SCOPE.full,
    rubric: RUBRIC.join('\n- '),
    carried: carriedBlock(['a.ts: t']),
    out: '/tmp/f.json',
    diff: 'DIFFBODY',
  });
  check('filled prompt carries the diff', filled.includes('DIFFBODY'));
  check('filled prompt carries the rubric', filled.includes(RUBRIC[0]));
  check('filled prompt keeps the JSON shape', filled.includes('"severity"'));
  check(
    'filled prompt has no placeholders left',
    !/\{(scope|rubric|carried|out|diff)\}/u.test(filled)
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
  console.log('self-test OK — state round-trips, status recomputes, prompt is complete.');
  return true;
}

/** @param {string} message */
function usage(message) {
  console.error(`pr-review: ${message}`);
  console.error(
    'Usage:\n' +
      '  node scripts/ci/pr-review.mjs plan --base <sha> --head <sha> --out-dir <d> --findings-path <f>\n' +
      '  node scripts/ci/pr-review.mjs publish --head <sha> --mode <m> --findings <f> --out <f>\n' +
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
