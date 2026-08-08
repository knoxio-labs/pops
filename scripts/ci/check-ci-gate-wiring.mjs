#!/usr/bin/env node
/**
 * `CI Gate` wiring guard.
 *
 * `ci-gate.yml` collapses eight quality workflows into ONE static context so a
 * branch ruleset can require it. Three separate pieces of that wiring are
 * silently inert if they drift, and none of them fail anything when they do:
 *
 *   1. Each gated workflow name is written TWICE — once in the `workflow_run`
 *      trigger and once in the `gated` array the script reads. A name in the
 *      trigger only is observed but never demanded; a name in `gated` only is
 *      demanded but never fires the gate. Either way the gate keeps reporting
 *      green.
 *   2. GitHub attributes a `workflow_run` job's implicit check run to the
 *      default branch's tip, not to `github.event.workflow_run.head_sha`. The
 *      gate must therefore POST its own check run at the observed head SHA, or
 *      the verdict lands on `main` and appears on no pull request at all.
 *   3. The gate can only be a required context if it reports on EVERY pull
 *      request. It does because `Quality` is gated and `quality.yml` carries no
 *      path filter. Adding one would make docs-only PRs emit no `CI Gate` at
 *      all, and a required context that never reports blocks its PR forever.
 *
 * It also asserts the corollary of aggregating at WORKFLOW level: a
 * `continue-on-error: true` job is erased from its workflow's conclusion and so
 * becomes invisible to the gate. Nothing in `quality.yml` is advisory, and a
 * job that wants to be must leave the gated workflow rather than hide inside it.
 *
 * Parses YAML as text (no dependency), mirroring the other guards in this
 * directory.
 *
 * Usage:
 *   node scripts/ci/check-ci-gate-wiring.mjs
 *   node scripts/ci/check-ci-gate-wiring.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = a violation. Exit 2 = usage error.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Workflow whose unfiltered `pull_request` trigger makes the gate report on every PR. */
export const ALWAYS_RUNNING_GATED_WORKFLOW = 'Quality';

/**
 * Read the `on.workflow_run.workflows:` sequence from a workflow source.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function parseWorkflowRunTriggers(source) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => /^\s{4}workflows:\s*$/u.test(line));
  if (start === -1) return [];
  /** @type {string[]} */
  const names = [];
  for (const line of lines.slice(start + 1)) {
    const item = /^\s{6}-\s*(.+?)\s*$/u.exec(line);
    if (!item) break;
    names.push(unquote(item[1]));
  }
  return names;
}

/**
 * Read the `gated` array literal out of the embedded `github-script` body.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function parseGatedArray(source) {
  const block = /const\s+gated\s*=\s*\[([\s\S]*?)\]\s*;/u.exec(source);
  if (!block) return [];
  return block[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map(unquote);
}

/**
 * @param {string} raw
 * @returns {string}
 */
function unquote(raw) {
  const trimmed = raw.trim();
  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    const end = trimmed.lastIndexOf(quote);
    if (end > 0) return trimmed.slice(1, end);
  }
  return trimmed;
}

/**
 * Read a workflow's top-level `name:`.
 *
 * @param {string} source
 * @returns {string | undefined}
 */
export function parseWorkflowName(source) {
  const match = /^name:\s*(.+?)\s*$/mu.exec(source);
  return match ? unquote(match[1]) : undefined;
}

/**
 * True when the workflow's `pull_request:` trigger narrows to a path filter —
 * which would stop it running on docs-only PRs.
 *
 * @param {string} source
 * @returns {boolean}
 */
export function hasPullRequestPathFilter(source) {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => /^\s{2}pull_request:\s*$/u.test(line));
  if (start === -1) return false;
  for (const line of lines.slice(start + 1)) {
    if (/^\s{0,2}\S/u.test(line)) break;
    if (/^\s{4}paths(-ignore)?:\s*$/u.test(line)) return true;
  }
  return false;
}

/**
 * Job names in a workflow that carry `continue-on-error: true` at job level
 * (two-space indent for the job key, four for its properties).
 *
 * @param {string} source
 * @returns {string[]}
 */
export function findContinueOnErrorJobs(source) {
  const lines = source.split('\n');
  /** @type {string[]} */
  const found = [];
  let job;
  for (const line of lines) {
    const jobKey = /^ {2}([A-Za-z0-9_-]+):\s*$/u.exec(line);
    if (jobKey) {
      job = jobKey[1];
      continue;
    }
    if (job && /^ {4}continue-on-error:\s*true\s*$/u.test(line)) found.push(job);
  }
  return found;
}

/**
 * @param {string} root
 * @returns {Map<string, string>} workflow display name -> file name
 */
function readWorkflowNames(root) {
  const dir = join(root, '.github', 'workflows');
  /** @type {Map<string, string>} */
  const names = new Map();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
    const name = parseWorkflowName(readFileSync(join(dir, file), 'utf8'));
    if (name) names.set(name, file);
  }
  return names;
}

/**
 * @param {string} root
 * @returns {string[]} Human-readable violations; empty means the wiring holds.
 */
export function checkCiGateWiring(root) {
  const workflowsDir = join(root, '.github', 'workflows');
  const gateSource = readFileSync(join(workflowsDir, 'ci-gate.yml'), 'utf8');

  /** @type {string[]} */
  const violations = [];

  const triggers = parseWorkflowRunTriggers(gateSource);
  const gated = parseGatedArray(gateSource);

  if (triggers.length === 0) violations.push('ci-gate.yml declares no workflow_run trigger list.');
  if (gated.length === 0) violations.push('ci-gate.yml declares no `gated` array.');

  for (const name of triggers) {
    if (!gated.includes(name)) {
      violations.push(
        `"${name}" fires ci-gate.yml but is missing from its \`gated\` array — the gate ` +
          'runs on its completion and then ignores its conclusion.'
      );
    }
  }
  for (const name of gated) {
    if (!triggers.includes(name)) {
      violations.push(
        `"${name}" is in ci-gate.yml's \`gated\` array but not its workflow_run trigger list — ` +
          'its completion never fires the gate, so a late failure is never re-evaluated.'
      );
    }
  }

  const known = readWorkflowNames(root);
  for (const name of new Set([...triggers, ...gated])) {
    if (!known.has(name)) {
      violations.push(
        `ci-gate.yml references workflow "${name}", which matches no \`name:\` under ` +
          '.github/workflows — a renamed workflow silently drops out of the gate.'
      );
    }
  }

  if (!/checks\.create\(/u.test(gateSource) || !/head_sha:\s*headSha/u.test(gateSource)) {
    violations.push(
      'ci-gate.yml must POST its own check run at the observed head SHA ' +
        '(`checks.create({ …, head_sha: headSha })`). GitHub attributes the implicit ' +
        "check run of a workflow_run job to the default branch's tip, so without this the " +
        'verdict never appears on the pull request it judges.'
    );
  }
  if (!/^\s{2}checks:\s*write\s*$/mu.test(gateSource)) {
    violations.push('ci-gate.yml needs `permissions: checks: write` to publish its check run.');
  }

  if (!gated.includes(ALWAYS_RUNNING_GATED_WORKFLOW)) {
    violations.push(
      `"${ALWAYS_RUNNING_GATED_WORKFLOW}" must stay gated: it is the only gated workflow that ` +
        'runs on every pull request, and so the only reason `CI Gate` always reports.'
    );
  } else {
    const file = known.get(ALWAYS_RUNNING_GATED_WORKFLOW);
    const source = readFileSync(join(workflowsDir, /** @type {string} */ (file)), 'utf8');
    if (hasPullRequestPathFilter(source)) {
      violations.push(
        `${file} added a path filter to its \`pull_request\` trigger. It is the workflow that ` +
          'guarantees `CI Gate` reports on every pull request; filtered, a docs-only PR emits ' +
          'no gate verdict, and a required context that never reports blocks its PR forever.'
      );
    }
    for (const job of findContinueOnErrorJobs(source)) {
      violations.push(
        `${file} job "${job}" sets \`continue-on-error: true\`. \`CI Gate\` aggregates the ` +
          'WORKFLOW-level conclusion, so that job can never affect the gate. Make a job ' +
          'advisory by moving it out of a gated workflow, not by hiding it inside one.'
      );
    }
  }

  return violations;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-ci-gate-wiring.mjs [--self-test]\n' +
        "Fails when ci-gate.yml's trigger list and `gated` array disagree, when it references " +
        'an unknown workflow, when it stops publishing its verdict at the observed head SHA, ' +
        'or when the always-running gated workflow gains a path filter or an advisory job.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) process.exit(selfTest() ? 0 : 1);

  const violations = checkCiGateWiring(repoRoot);
  if (violations.length === 0) {
    console.log('OK — CI Gate wiring is intact.');
    process.exit(0);
  }
  for (const violation of violations) console.error(`FAIL — ${violation}`);
  process.exit(1);
}

/** @returns {boolean} */
function selfTest() {
  const triggers = parseWorkflowRunTriggers(
    [
      'on:',
      '  workflow_run:',
      '    workflows:',
      '      - "A"',
      '      - "B"',
      '    types: [x]',
    ].join('\n')
  );
  const gated = parseGatedArray('const gated = [\n  "A",\n  "B",\n];\n');
  const advisory = findContinueOnErrorJobs('jobs:\n  lint:\n    continue-on-error: true\n');
  const filtered = hasPullRequestPathFilter('on:\n  pull_request:\n    paths:\n      - "a/**"\n');
  const unfiltered = hasPullRequestPathFilter(
    'on:\n  pull_request:\n  push:\n    paths:\n      - "a"\n'
  );

  const ok =
    triggers.join() === 'A,B' &&
    gated.join() === 'A,B' &&
    advisory.join() === 'lint' &&
    filtered &&
    !unfiltered;
  if (!ok) console.error('self-test FAILED');
  return ok;
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '')) {
  main();
}
