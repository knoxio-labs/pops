#!/usr/bin/env node
/**
 * `CI Gate` wiring guard.
 *
 * `ci-gate.yml` collapses eight quality workflows into ONE static context so a
 * branch ruleset can require it. Four separate pieces of that wiring report
 * green when they drift, and nothing else notices:
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
 *   4. The verdict must stay `in_progress` while any gated workflow is still
 *      running. Concluding `success` on the first sibling to pass reports green
 *      minutes before the slowest one has an opinion, so a PR can merge and
 *      take the failure afterwards.
 *
 * It also asserts the corollary of aggregating at WORKFLOW level: a
 * `continue-on-error: true` job is erased from its workflow's conclusion and so
 * becomes invisible to the gate. Nothing in `quality.yml` is advisory, and a
 * job that wants to be must leave the gated workflow rather than hide inside it.
 *
 * **Tier B guard**: the workflows go through a real YAML parser, so the job
 * that runs it installs the workspace first. See the tier amendment in
 * [ADR-045](../../docs/architecture/adr-045-guards-must-prove-they-report.md).
 * The four rules above are structural claims about a document, and the
 * line-anchored matcher this replaced was blind to a legal spelling of each of
 * them at least once. What is still matched textually is the `gated` array and
 * the two `checks.create` invariants — those live in the embedded
 * `github-script` body, which is JavaScript inside a YAML scalar, so the parser
 * hands over the exact script and the matching happens on that rather than on
 * the whole file.
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

import { isMapping, parseYaml, scalarText, walkMappings } from './config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** Workflow whose unfiltered `pull_request` trigger makes the gate report on every PR. */
export const ALWAYS_RUNNING_GATED_WORKFLOW = 'Quality';

/**
 * @param {string} source
 * @param {string} [label]
 * @returns {unknown}
 * @throws {import('./config-parse.mjs').ConfigParseError}
 */
function workflowDoc(source, label = 'workflow') {
  return parseYaml(source, label);
}

/**
 * The `on:` mapping of a parsed workflow.
 *
 * `js-yaml`'s core schema keeps `on` a string key. A YAML 1.1 parser resolves
 * it to the boolean `true`, and every check below would then read `undefined`
 * and report nothing — so the schema is load-bearing, not incidental.
 *
 * @param {unknown} doc
 * @returns {Record<string, unknown>}
 */
function triggers(doc) {
  if (!isMapping(doc)) return {};
  const on = doc.on;
  return isMapping(on) ? on : {};
}

/**
 * Read the `on.workflow_run.workflows` sequence from a workflow source.
 *
 * @param {string} source
 * @returns {string[]}
 * @throws {import('./config-parse.mjs').ConfigParseError}
 */
export function parseWorkflowRunTriggers(source) {
  const workflowRun = triggers(workflowDoc(source)).workflow_run;
  if (!isMapping(workflowRun)) return [];
  const names = workflowRun.workflows;
  if (Array.isArray(names)) {
    return names.map(scalarText).filter((name) => name !== undefined);
  }
  const single = scalarText(names);
  return single === undefined ? [] : [single];
}

/**
 * The body of the workflow's embedded `github-script` step, or `''` when it has
 * none.
 *
 * @param {string} source
 * @returns {string}
 * @throws {import('./config-parse.mjs').ConfigParseError}
 */
export function embeddedScript(source) {
  for (const entry of walkMappings(workflowDoc(source))) {
    if (entry.key !== 'script') continue;
    const body = scalarText(entry.value);
    if (body !== undefined) return body;
  }
  return '';
}

/**
 * Read the `gated` array literal out of the embedded `github-script` body.
 *
 * Accepts a bare script body too, so a caller (and the self-test) can exercise
 * the array reader without wrapping it in a workflow.
 *
 * @param {string} source  A workflow document, or the script body alone.
 * @returns {string[]}
 */
export function parseGatedArray(source) {
  let body = source;
  try {
    const fromWorkflow = embeddedScript(source);
    if (fromWorkflow !== '') body = fromWorkflow;
  } catch {
    // Not a workflow document — treat the input as the script body itself. A
    // workflow that does not parse is reported by the caller, which reads it
    // through `workflowDoc` directly.
  }
  const block = /const\s+gated\s*=\s*\[([\s\S]*?)\]\s*;/u.exec(body);
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
 * Read a workflow's top-level `name`.
 *
 * @param {string} source
 * @returns {string | undefined}
 * @throws {import('./config-parse.mjs').ConfigParseError}
 */
export function parseWorkflowName(source) {
  const doc = workflowDoc(source);
  return isMapping(doc) ? scalarText(doc.name) : undefined;
}

/**
 * True when the workflow's `pull_request:` trigger narrows to a path filter —
 * which would stop it running on docs-only PRs.
 *
 * @param {string} source
 * @returns {boolean}
 * @throws {import('./config-parse.mjs').ConfigParseError}
 */
export function hasPullRequestPathFilter(source) {
  const pullRequest = triggers(workflowDoc(source)).pull_request;
  if (!isMapping(pullRequest)) return false;
  return pullRequest.paths !== undefined || pullRequest['paths-ignore'] !== undefined;
}

/**
 * Job names in a workflow that carry a job-level `continue-on-error` opt-out.
 *
 * Anything other than a literal `false` counts. `continue-on-error` accepts an
 * expression, and an expression that evaluates true at run time erases the job
 * from the workflow conclusion exactly as `true` does — so a shape this guard
 * cannot evaluate is reported rather than waved through.
 *
 * @param {string} source
 * @returns {string[]}
 * @throws {import('./config-parse.mjs').ConfigParseError}
 */
export function findContinueOnErrorJobs(source) {
  const doc = workflowDoc(source);
  if (!isMapping(doc) || !isMapping(doc.jobs)) return [];
  /** @type {string[]} */
  const found = [];
  for (const [name, job] of Object.entries(doc.jobs)) {
    if (!isMapping(job)) continue;
    const flag = job['continue-on-error'];
    if (flag === undefined || flag === false || flag === 'false') continue;
    found.push(name);
  }
  return found;
}

/**
 * True when the workflow grants `permissions: checks: write`.
 *
 * @param {string} source
 * @returns {boolean}
 * @throws {import('./config-parse.mjs').ConfigParseError}
 */
export function grantsChecksWrite(source) {
  const doc = workflowDoc(source);
  if (!isMapping(doc) || !isMapping(doc.permissions)) return false;
  return doc.permissions.checks === 'write';
}

/**
 * @typedef {object} WorkflowIndex
 * @property {Map<string, string>} names   display name -> file name
 * @property {string[]} problems           workflows that could not be read
 */

/**
 * @param {string} root
 * @returns {WorkflowIndex}
 */
function readWorkflowNames(root) {
  const dir = join(root, '.github', 'workflows');
  /** @type {Map<string, string>} */
  const names = new Map();
  /** @type {string[]} */
  const problems = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
    try {
      // A workflow that does not parse has no readable `name:`, which is
      // indistinguishable from one that was renamed out of the gate — the exact
      // drift this guard exists to catch. It is reported, never skipped.
      const name = parseWorkflowName(readFileSync(join(dir, file), 'utf8'));
      if (name) names.set(name, file);
    } catch (error) {
      problems.push(
        `.github/workflows/${file} could not be read as YAML, so its \`name:\` is unknown and ` +
          `it cannot be matched against ci-gate.yml's gated list: ` +
          `${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return { names, problems };
}

/**
 * @param {string} root
 * @returns {string[]} Human-readable violations; empty means the wiring holds.
 */
export function checkCiGateWiring(root) {
  const workflowsDir = join(root, '.github', 'workflows');
  const gatePath = join(workflowsDir, 'ci-gate.yml');
  const gateSource = readFileSync(gatePath, 'utf8');

  /** @type {string[]} */
  const violations = [];

  /** @type {string[]} */
  let triggerNames;
  /** @type {string} */
  let script;
  /** @type {boolean} */
  let checksWrite;
  try {
    triggerNames = parseWorkflowRunTriggers(gateSource);
    script = embeddedScript(gateSource);
    checksWrite = grantsChecksWrite(gateSource);
  } catch (error) {
    return [
      `.github/workflows/ci-gate.yml could not be read as YAML, so none of the gate wiring ` +
        `could be checked: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
  const gated = parseGatedArray(script);

  if (triggerNames.length === 0) {
    violations.push('ci-gate.yml declares no workflow_run trigger list.');
  }
  if (gated.length === 0) violations.push('ci-gate.yml declares no `gated` array.');

  for (const name of triggerNames) {
    if (!gated.includes(name)) {
      violations.push(
        `"${name}" fires ci-gate.yml but is missing from its \`gated\` array — the gate ` +
          'runs on its completion and then ignores its conclusion.'
      );
    }
  }
  for (const name of gated) {
    if (!triggerNames.includes(name)) {
      violations.push(
        `"${name}" is in ci-gate.yml's \`gated\` array but not its workflow_run trigger list — ` +
          'its completion never fires the gate, so a late failure is never re-evaluated.'
      );
    }
  }

  const { names: known, problems } = readWorkflowNames(root);
  violations.push(...problems);
  for (const name of new Set([...triggerNames, ...gated])) {
    if (!known.has(name)) {
      violations.push(
        `ci-gate.yml references workflow "${name}", which matches no \`name:\` under ` +
          '.github/workflows — a renamed workflow silently drops out of the gate.'
      );
    }
  }

  if (!/checks\.create\(/u.test(script) || !/head_sha:\s*headSha/u.test(script)) {
    violations.push(
      'ci-gate.yml must POST its own check run at the observed head SHA ' +
        '(`checks.create({ …, head_sha: headSha })`). GitHub attributes the implicit ' +
        "check run of a workflow_run job to the default branch's tip, so without this the " +
        'verdict never appears on the pull request it judges.'
    );
  }
  if (!checksWrite) {
    violations.push('ci-gate.yml needs `permissions: checks: write` to publish its check run.');
  }
  if (/status:\s*"completed"\s*,/u.test(script) || !/status:\s*settled\s*\?/u.test(script)) {
    violations.push(
      'ci-gate.yml must publish `in_progress` while a gated workflow is still running ' +
        '(`status: settled ? "completed" : "in_progress"`), and attach a `conclusion` only ' +
        'when settled. An unconditional `completed` reports green the moment the FIRST ' +
        'sibling passes, so a PR can merge minutes before the slowest gated workflow has an ' +
        'opinion and take its failure afterwards.'
    );
  }

  if (!gated.includes(ALWAYS_RUNNING_GATED_WORKFLOW)) {
    violations.push(
      `"${ALWAYS_RUNNING_GATED_WORKFLOW}" must stay gated: it is the only gated workflow that ` +
        'runs on every pull request, and so the only reason `CI Gate` always reports.'
    );
    return violations;
  }

  // Renaming this workflow is one of the drifts the guard exists to catch, so
  // it must report it rather than dereference the file it just proved absent.
  const file = known.get(ALWAYS_RUNNING_GATED_WORKFLOW);
  if (file === undefined) {
    violations.push(
      `No workflow under .github/workflows is named "${ALWAYS_RUNNING_GATED_WORKFLOW}", so the ` +
        'gate has no workflow guaranteed to run on every pull request. Whichever workflow now ' +
        'plays that role must be gated, and ALWAYS_RUNNING_GATED_WORKFLOW updated to match it.'
    );
    return violations;
  }

  const source = readFileSync(join(workflowsDir, file), 'utf8');
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

/**
 * Every case here carries a trailing comment, an inline value, or a flow
 * collection — the three spellings the line-anchored matcher this file used to
 * carry was blind to, one at a time, over three separate fixes.
 *
 * @returns {boolean}
 */
function selfTest() {
  const triggerList = parseWorkflowRunTriggers(
    [
      'on:',
      '  workflow_run:',
      '    workflows: # the gated eight',
      '      - "A"',
      '      - "B" # slowest',
      '    types: [x]',
    ].join('\n')
  );
  const inlineTriggerList = parseWorkflowRunTriggers(
    'on: { workflow_run: { workflows: ["A", "B"], types: [completed] } }\n'
  );
  const gated = parseGatedArray('const gated = [\n  "A",\n  "B",\n];\n');
  const gatedFromWorkflow = parseGatedArray(
    'jobs:\n  gate:\n    steps:\n      - with:\n          script: |\n            const gated = ["A", "B"];\n'
  );
  const advisory = findContinueOnErrorJobs(
    'jobs:\n  lint: # tidy\n    continue-on-error: true # flaky\n'
  );
  const advisoryExpression = findContinueOnErrorJobs(
    'jobs:\n  lint:\n    continue-on-error: ${{ github.event_name == \'push\' }}\n'
  );
  const notAdvisory = findContinueOnErrorJobs('jobs:\n  lint:\n    continue-on-error: false\n');
  const filtered = hasPullRequestPathFilter(
    'on:\n  pull_request: # every PR\n    paths: ["**"] # inline\n'
  );
  const unfiltered = hasPullRequestPathFilter(
    'on:\n  pull_request:\n  push:\n    paths:\n      - "a"\n'
  );
  const named = parseWorkflowName('name: Quality # the big one\n');
  const writes = grantsChecksWrite('permissions:\n  checks: write # publishes the verdict\n');

  // The degenerate case: a document nobody can read must raise, so the caller
  // reports it. Returning "no triggers, no gated names, no advisory jobs" would
  // read as a workflow with clean wiring.
  let unparseableRaised = false;
  try {
    parseWorkflowRunTriggers('on:\n  a:\n   - b\n  - c\n');
  } catch {
    unparseableRaised = true;
  }

  const checks = {
    'reads a block trigger list past its comments': triggerList.join() === 'A,B',
    'reads the same list written as flow collections': inlineTriggerList.join() === 'A,B',
    'reads the gated array from a bare script body': gated.join() === 'A,B',
    'reads the gated array out of a workflow document': gatedFromWorkflow.join() === 'A,B',
    'names an advisory job declared with comments': advisory.join() === 'lint',
    'reports an advisory job it cannot evaluate': advisoryExpression.join() === 'lint',
    'does not treat continue-on-error: false as an opt-out': notAdvisory.length === 0,
    'sees an inline path filter on pull_request': filtered,
    'does not read a sibling trigger filter as one on pull_request': !unfiltered,
    'reads the workflow name past a trailing comment': named === 'Quality',
    'reads the checks: write permission': writes,
    'raises on a workflow that cannot be parsed rather than reporting it clean':
      unparseableRaised,
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
