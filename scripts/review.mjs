#!/usr/bin/env node
/**
 * `mise review`: the PR Review bot's review, run locally before the first push.
 *
 * Builds the reviewer's prompt with the same code the CI `plan` step uses
 * (`buildReviewInput` in `scripts/ci/pr-review.mjs`) over
 * `git diff <base>...HEAD`, runs it through the Claude Code CLI with the same
 * tools the workflow grants, and prints the findings with the severities the
 * findings gate applies. It is a full review: nothing has been reviewed
 * locally before, so there is no state to be incremental against.
 *
 * Only committed changes are reviewed, matching what a push would send.
 *
 * Authentication is whatever the local `claude` CLI is already logged in
 * with; this script never reads, prints or forwards a credential.
 *
 * Usage:
 *   node scripts/review.mjs [--base <ref>] [--model <name>]
 *
 * Exit 0 = no blocking finding. Exit 1 = at least one HIGH or MEDIUM finding.
 * Exit 2 = the review could not run or produced nothing readable.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { findingFromModel, isBlockingSeverity, SEVERITIES } from './ci/pr-review-state.mjs';
import { buildReviewInput } from './ci/pr-review.mjs';
import { readFlag } from './cli-flags.mjs';

/**
 * Runs the reviewer over a prompt; the reviewer writes its JSON to the path
 * named inside the prompt.
 *
 * @callback ModelRunner
 * @param {{ prompt: string, model: string, cwd: string, logPath: string }} request
 * @returns {{ status: number | null, error?: string }}
 */

/** @type {ModelRunner} */
function runClaude({ prompt, model, cwd, logPath }) {
  const log = openSync(logPath, 'w');
  try {
    const result = spawnSync(
      'claude',
      [
        '-p',
        prompt,
        '--model',
        model,
        '--max-turns',
        '40',
        '--allowedTools',
        'Read,Grep,Glob,Write',
      ],
      { cwd, stdio: ['ignore', log, log] }
    );
    if (result.error !== undefined) {
      const missing = 'code' in result.error && result.error.code === 'ENOENT';
      return {
        status: null,
        error: missing
          ? 'the `claude` CLI is not on PATH; install @anthropic-ai/claude-code and log in'
          : result.error.message,
      };
    }
    return { status: result.status };
  } finally {
    closeSync(log);
  }
}

/**
 * @param {string} repoRoot
 * @param {string[]} args
 * @returns {{ ok: boolean, stdout: string }}
 */
function tryGit(repoRoot, args) {
  const result = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
  };
}

/**
 * @param {string} raw
 * @param {(line: string) => void} err
 * @returns {import('./ci/pr-review-state.mjs').Finding[] | null}
 */
function parseFindings(raw, err) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray(parsed.findings)) return null;
  /** @type {import('./ci/pr-review-state.mjs').Finding[]} */
  const findings = [];
  for (const item of parsed.findings) {
    try {
      findings.push(findingFromModel(item, 'local'));
    } catch {
      err('warning: dropped one malformed finding from the reviewer output');
    }
  }
  return findings;
}

/**
 * @param {import('./ci/pr-review-state.mjs').Finding} finding
 * @returns {number}
 */
function severityRank(finding) {
  const index = SEVERITIES.indexOf(finding.severity);
  return index === -1 ? SEVERITIES.length : index;
}

/**
 * @param {import('./ci/pr-review-state.mjs').Finding[]} findings
 * @param {(line: string) => void} out
 */
function printFindings(findings, out) {
  for (const finding of findings.toSorted((a, b) => severityRank(a) - severityRank(b))) {
    out(`${finding.severity.toUpperCase()} — ${finding.title}`);
    out(`  ${finding.file}`);
    if (finding.body !== '') out(`  ${finding.body}`);
    if (finding.snippet !== null) {
      for (const line of finding.snippet.split('\n')) out(`  > ${line}`);
    }
    out('');
  }
}

/**
 * Review `<base>...HEAD` the way the PR Review bot would, and report.
 *
 * @param {object} input
 * @param {string} input.repoRoot
 * @param {string} input.base ref the PR will target, e.g. `origin/main`
 * @param {string} input.model model name passed to the CLI
 * @param {ModelRunner} [input.runModel] the reviewer; the Claude Code CLI by default
 * @param {(line: string) => void} [input.out]
 * @param {(line: string) => void} [input.err]
 * @returns {number} the process exit code, see the file header
 */
export function runLocalReview({
  repoRoot,
  base,
  model,
  runModel = runClaude,
  out = console.log,
  err = console.error,
}) {
  if (!tryGit(repoRoot, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]).ok) {
    err(`review: \`${base}\` is not a commit here; fetch it or pass --base <ref>`);
    return 2;
  }
  const range = `${base}...HEAD`;
  if (tryGit(repoRoot, ['diff', '--quiet', range]).ok) {
    out(`Nothing to review: ${range} is empty.`);
    return 0;
  }
  if (tryGit(repoRoot, ['status', '--porcelain']).stdout.trim() !== '') {
    out('Note: uncommitted changes are not reviewed; only committed history is.');
  }

  const findingsPath = join(repoRoot, 'tmp', 'review', 'findings.json');
  const logPath = join(dirname(findingsPath), 'model.log');
  mkdirSync(dirname(findingsPath), { recursive: true });
  rmSync(findingsPath, { force: true });

  const { prompt } = buildReviewInput({
    repoRoot,
    revisions: [range],
    mode: 'full',
    priorFindings: [],
    findingsPath,
  });
  out(`Reviewing ${range} with ${model}…`);
  const run = runModel({ prompt, model, cwd: repoRoot, logPath });
  if (run.error !== undefined) {
    err(`review: ${run.error}`);
    return 2;
  }
  if (run.status !== 0) err(`warning: the reviewer exited ${run.status}; see ${logPath}`);

  if (!existsSync(findingsPath)) {
    err(`review: the reviewer wrote no findings file; see ${logPath}`);
    return 2;
  }
  const findings = parseFindings(readFileSync(findingsPath, 'utf8'), err);
  if (findings === null) {
    err(`review: ${findingsPath} is not a findings object; see ${logPath}`);
    return 2;
  }

  const blocking = findings.filter((f) => isBlockingSeverity(f.severity)).length;
  if (findings.length === 0) {
    out('No findings.');
    return 0;
  }
  printFindings(findings, out);
  out(`${findings.length} findings: ${blocking} blocking, ${findings.length - blocking} advisory.`);
  return blocking > 0 ? 1 : 0;
}

function main() {
  const args = process.argv.slice(2);
  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  }).trim();
  process.exitCode = runLocalReview({
    repoRoot,
    base: readFlag(args, '--base') ?? 'origin/main',
    model: readFlag(args, '--model') ?? process.env.PR_REVIEW_MODEL ?? 'sonnet',
  });
}

if (import.meta.main) {
  main();
}
