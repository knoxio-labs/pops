#!/usr/bin/env node
/**
 * Node pin coherence guard — see [ADR-039](../../docs/architecture/adr-039-pillar-isolation.md)
 * on the toolchain pin, and `check-mise-tool-overrides.mjs` next door.
 *
 * Scope is the fleet-level pins only. A unit may still override `[tools] node`
 * in its own `mise.toml` to trial or lag a bump — that escape hatch belongs to
 * the sibling guard, and nothing here reads a unit config.
 *
 * The Node major is declared in five independent places, and nothing used to
 * make them agree:
 *
 *   - `mise.toml`           `[tools] node`      — what a local `mise run` uses
 *   - `mise.ci.toml`        `[tools] node`      — what `MISE_ENV=ci` uses
 *   - `package.json`        `engines.node`      — what pnpm refuses to run under
 *   - the workflows         `node-version:`     — what CI actually runs
 *   - every pillar image  `FROM node:<major>` — what the images ship
 *
 * "Every pillar image" is literal: a pillar may ship more than one, and
 * `pillars/design` does (`Dockerfile` and `Dockerfile.api`). See
 * `isDockerfileName` below — this guard read only the first of them until
 * POPS-2788.
 *
 * When they drift, "green locally" and "green in CI" stop being the same claim,
 * and the failure is a silent behavioural difference rather than an error.
 *
 * This guard also asserts `activate_aggressive` is still set in the root
 * `mise.toml`. Without it mise appends its resolved tool bin dirs *after* the
 * inherited PATH whenever its shim dir is on PATH, so a system Node ahead of
 * the shims wins every `#!/usr/bin/env node` lookup inside a task — every
 * `node_modules/.bin` entry is such a shebang. Dropping that one line silently
 * reintroduces suites that pass under pnpm and fail under mise, so it is
 * load-bearing config, not preference.
 *
 * **Tier B guard**: it reads TOML and workflow YAML through real parsers, so
 * the job that runs it installs the workspace first. See the tier amendment in
 * [ADR-045](../../docs/architecture/adr-045-guards-must-prove-they-report.md).
 *
 * Coherence is not coverage. Everything above only compares pins that were
 * already declared somewhere — a workflow job that runs `node` without
 * provisioning it at all (no `jdx/mise-action`, no `actions/setup-node`)
 * contributes no pin, so it never enters the disagreement check and the two
 * "no workflow/Dockerfile declares a pin" floors are satisfied by any other
 * workflow in the fleet. `release.yml` shipped exactly that shape — a bare
 * `node scripts/pack-moltbot-bundle.mjs` with neither step in its job — and
 * this guard reported clean the whole time. `collectUnprovisionedNodeSteps`
 * closes that: it walks each job's steps in declaration order and flags the
 * first `run:` step that invokes `node` before that job has seen a
 * provisioning step of its own.
 *
 * Usage:
 *   node scripts/ci/check-node-pin.mjs
 *   node scripts/ci/check-node-pin.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = a violation. Exit 2 = usage error.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseTomlSection } from './check-mise-tool-overrides.mjs';
import { formatPath, isMapping, parseYaml, scalarText, walkMappings } from './config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** mise setting that must stay enabled for the pin to reach task subprocesses. */
export const REQUIRED_MISE_SETTINGS = { activate_aggressive: 'true' };

/**
 * Reduce any Node version expression to its major as a string. Handles a bare
 * major (`24`), an exact version (`24.19.0`), and the range operators that
 * appear in an `engines` field (`^24`, `>=24`, `~24.19`).
 *
 * Returns `null` when no major can be read, which callers report as a
 * violation rather than silently skipping — an unreadable pin is drift.
 *
 * @param {string} expression
 * @returns {string | null}
 */
export function nodeMajor(expression) {
  const match = /(\d+)/u.exec(expression.trim());
  return match === null ? null : match[1];
}

/**
 * @typedef {{ source: string, expression: string, major: string | null }} PinSite
 *
 * @typedef {object} PinScan
 * @property {PinSite[]} pins
 * @property {string[]} problems  Declaration sites that exist but could not be
 *   read. Reported as violations rather than dropped: a pin the collector
 *   cannot see agrees with every other pin by default.
 */

/**
 * True for a file name this collector treats as a pillar image definition:
 * `Dockerfile` and any `Dockerfile.<suffix>` beside it.
 *
 * A pillar is NOT one image. `pillars/design` ships two — a static nginx one
 * for the playground and `Dockerfile.api` for its comment API — and
 * `docker-build.yml` builds both by discovering `-name Dockerfile -o -name
 * 'Dockerfile.*'`. This predicate is that same discovery, so an image the
 * fleet ships cannot be one this guard never opened.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isDockerfileName(name) {
  return name === 'Dockerfile' || name.startsWith('Dockerfile.');
}

/**
 * Collect every `FROM node:<tag>` base image across the repo's Dockerfiles.
 *
 * Every image in a pillar directory is read, not just the one named
 * `Dockerfile`. Reading one of two is worse than reading neither: the pin it
 * does see satisfies the "some Dockerfile declares a pin" floor below, so the
 * unread one is absent from the disagreement check while the guard reports
 * clean — a second image is free to drift off the fleet's major forever.
 *
 * @param {string} root
 * @returns {PinSite[]}
 */
export function collectDockerfilePins(root) {
  /** @type {PinSite[]} */
  const pins = [];
  const pillarsDir = join(root, 'pillars');
  if (!existsSync(pillarsDir)) return pins;
  for (const entry of readdirSync(pillarsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pillarDir = join(pillarsDir, entry.name);
    const names = readdirSync(pillarDir, { withFileTypes: true })
      .filter((file) => !file.isDirectory() && isDockerfileName(file.name))
      .map((file) => file.name)
      .toSorted((a, b) => a.localeCompare(b));
    for (const name of names) {
      const dockerfile = join(pillarDir, name);
      const source = readFileSync(dockerfile, 'utf8');
      for (const match of source.matchAll(/^FROM\s+node:(\S+)/gmu)) {
        pins.push({
          source: relative(root, dockerfile),
          expression: match[1],
          major: nodeMajor(match[1]),
        });
      }
    }
  }
  return pins;
}

/**
 * Collect every `node-version:` pin across the GitHub Actions workflows.
 *
 * The workflow is parsed and then walked for the key at any depth, rather than
 * matched line by line. `with: { node-version: 24 }` and a `node-version` under
 * a matrix expansion are the same declaration as the block form, and a line
 * matcher sees only whichever spelling it was written against.
 *
 * @param {string} root
 * @returns {PinScan}
 */
export function collectWorkflowPins(root) {
  /** @type {PinSite[]} */
  const pins = [];
  /** @type {string[]} */
  const problems = [];
  const workflowsDir = join(root, '.github', 'workflows');
  if (!existsSync(workflowsDir)) return { pins, problems };
  for (const name of readdirSync(workflowsDir).toSorted((a, b) => a.localeCompare(b))) {
    if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue;
    const file = join(workflowsDir, name);
    const source = relative(root, file);
    /** @type {unknown} */
    let doc;
    try {
      doc = parseYaml(readFileSync(file, 'utf8'), source);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    for (const entry of walkMappings(doc)) {
      if (entry.key !== 'node-version') continue;
      const expression = scalarText(entry.value);
      if (expression === undefined) {
        problems.push(
          `${source} declares \`node-version\` at ${formatPath(entry.path)} as a ` +
            `${Array.isArray(entry.value) ? 'sequence' : 'mapping'} rather than a single value. ` +
            'The coherence check compares one major per site and cannot rule on that shape.'
        );
        continue;
      }
      pins.push({ source, expression, major: nodeMajor(expression) });
    }
  }
  return { pins, problems };
}

/**
 * `uses:` sources that provision a pinned Node onto PATH before any later
 * step in the same job. Matched by prefix so a version tag bump (`@v8`,
 * `@v5`) does not need a matching update here.
 */
const NODE_PROVISIONING_STEP_PREFIXES = ['jdx/mise-action@', 'actions/setup-node@'];

/** A `run:` script invoking `node` as its own command, not as a substring of
 * something else (`node_modules`, `nodejs`, a package named `*-node-*`). */
const NODE_INVOCATION = /(?:^|[\n;]|&&|\|\|)\s*node\b/mu;

/**
 * Decide whether a `uses:` reference provisions Node, following a local
 * composite action into its own steps.
 *
 * A repo-local wrapper (`./.github/actions/setup-mise`) is how this repo pins
 * the one mise-action version every lane shares, so a prefix match against the
 * upstream action names alone would read every call site as unprovisioned. It
 * is resolved rather than allow-listed by name: a wrapper that stops calling a
 * provisioning action must go back to failing this guard, which an allow-list
 * of paths could not express.
 *
 * @param {string} root
 * @param {string} uses
 * @param {Set<string>} visited  Guards a wrapper cycle, which GitHub rejects at
 *   run time but which must not hang the guard here.
 * @returns {boolean}
 */
function usesProvisionsNode(root, uses, visited = new Set()) {
  if (NODE_PROVISIONING_STEP_PREFIXES.some((prefix) => uses.startsWith(prefix))) return true;
  if (!uses.startsWith('./')) return false;

  const actionDir = join(root, uses.slice(2));
  const manifest = ['action.yml', 'action.yaml']
    .map((name) => join(actionDir, name))
    .find((candidate) => existsSync(candidate));
  if (manifest === undefined || visited.has(manifest)) return false;
  visited.add(manifest);

  /** @type {unknown} */
  let doc;
  try {
    doc = parseYaml(readFileSync(manifest, 'utf8'), relative(root, manifest));
  } catch {
    return false;
  }
  const runs = isMapping(doc) ? doc.runs : undefined;
  const steps = isMapping(runs) ? runs.steps : undefined;
  if (!Array.isArray(steps)) return false;
  return steps.some((step) => {
    if (!isMapping(step)) return false;
    const nested = scalarText(step.uses);
    return nested !== undefined && usesProvisionsNode(root, nested, visited);
  });
}

/**
 * Find every job step that runs `node` before that job has provisioned a
 * pinned Node runtime of its own.
 *
 * Coherence-checking declared pins (above) cannot see this failure mode: a
 * job with no provisioning step declares no pin at all, so it is invisible to
 * every check that only compares pins it found. This walks `jobs.<id>.steps`
 * in file order instead, which is the shape that actually decides what Node a
 * `run:` step resolves at execution time.
 *
 * @param {string} root
 * @returns {string[]} One violation message per offending step.
 */
export function collectUnprovisionedNodeSteps(root) {
  /** @type {string[]} */
  const violations = [];
  const workflowsDir = join(root, '.github', 'workflows');
  if (!existsSync(workflowsDir)) return violations;

  for (const name of readdirSync(workflowsDir).toSorted((a, b) => a.localeCompare(b))) {
    if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue;
    const file = join(workflowsDir, name);
    const source = relative(root, file);
    /** @type {unknown} */
    let doc;
    try {
      doc = parseYaml(readFileSync(file, 'utf8'), source);
    } catch {
      // Already recorded by collectWorkflowPins for the same file; a second
      // report here would just duplicate it under a different check.
      continue;
    }
    const jobs = isMapping(doc) ? doc.jobs : undefined;
    if (!isMapping(jobs)) continue;

    for (const [jobId, job] of Object.entries(jobs)) {
      if (!isMapping(job)) continue;
      const steps = job.steps;
      if (steps === undefined) continue;
      if (!Array.isArray(steps)) {
        violations.push(
          `${source} jobs.${jobId}.steps is not a sequence, so this guard cannot walk its step ` +
            'order to confirm Node is provisioned before it runs.'
        );
        continue;
      }

      let provisioned = false;
      for (const [index, step] of steps.entries()) {
        if (!isMapping(step)) continue;
        const uses = scalarText(step.uses);
        if (uses !== undefined && usesProvisionsNode(root, uses)) {
          provisioned = true;
          continue;
        }
        if (provisioned) continue;
        const run = scalarText(step.run);
        if (run !== undefined && NODE_INVOCATION.test(run)) {
          violations.push(
            `${source} jobs.${jobId}.steps[${index}] runs \`node\` but the job provisions no ` +
              'pinned Node first (no jdx/mise-action, no actions/setup-node, and no local ' +
              'composite action that reaches one) — it runs on ' +
              'whatever Node the runner image happens to ship.'
          );
        }
      }
    }
  }
  return violations;
}

/**
 * Gather every declared Node pin in the repo.
 *
 * @param {string} root
 * @returns {PinScan}
 */
export function collectPins(root) {
  /** @type {PinSite[]} */
  const pins = [];
  /** @type {string[]} */
  const problems = [];

  /**
   * @param {string} file
   * @param {string} label
   */
  const addMisePin = (file, label) => {
    /** @type {Record<string, string>} */
    let tools;
    try {
      tools = parseTomlSection(readFileSync(file, 'utf8'), 'tools', label);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      return;
    }
    const node = tools.node;
    if (node !== undefined && node !== '') {
      pins.push({ source: label, expression: node, major: nodeMajor(node) });
    }
  };

  addMisePin(join(root, 'mise.toml'), 'mise.toml');
  const ciMisePath = join(root, 'mise.ci.toml');
  if (existsSync(ciMisePath)) addMisePin(ciMisePath, 'mise.ci.toml');

  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const engines = manifest.engines?.node;
  if (typeof engines === 'string') {
    pins.push({
      source: 'package.json engines.node',
      expression: engines,
      major: nodeMajor(engines),
    });
  }

  const workflows = collectWorkflowPins(root);
  pins.push(...workflows.pins, ...collectDockerfilePins(root));
  problems.push(...workflows.problems);
  return { pins, problems };
}

/**
 * @typedef {{
 *   pins: PinSite[],
 *   majors: string[],
 *   violations: string[],
 * }} PinReport
 */

/**
 * Check that every declared Node pin names the same major, that the root
 * manifest declares `engines.node` at all, and that the root `mise.toml` still
 * enables the settings the pin depends on.
 *
 * @param {string} root
 * @returns {PinReport}
 */
export function checkNodePin(root) {
  const { pins, problems } = collectPins(root);
  /** @type {string[]} */
  const violations = [...problems, ...collectUnprovisionedNodeSteps(root)];

  for (const pin of pins) {
    if (pin.major === null) {
      violations.push(
        `${pin.source} declares Node "${pin.expression}", which has no readable major.`
      );
    }
  }

  const majors = [...new Set(pins.map((pin) => pin.major).filter((major) => major !== null))];
  if (majors.length > 1) {
    const detail = pins.map((pin) => `  ${pin.source}: ${pin.expression}`).join('\n');
    violations.push(
      `Node pins disagree — majors ${majors.toSorted().join(', ')} are all declared:\n${detail}`
    );
  }

  if (!pins.some((pin) => pin.source === 'package.json engines.node')) {
    violations.push(
      'package.json declares no engines.node. Without it pnpm has nothing to enforce, ' +
        'so a shell resolving an unpinned Node runs the workspace silently.'
    );
  }

  // The disagreement check is a set comparison over discovered pins: discover
  // none and every major agrees trivially. Both of these sites are populated in
  // any healthy tree, so an empty one means the collector stopped finding them,
  // not that the pins went away (ADR-045).
  if (!pins.some((pin) => pin.source.startsWith('.github/workflows/'))) {
    violations.push(
      'No workflow declares a `node-version:`. Either .github/workflows moved, or CI now ' +
        'resolves Node some other way — until the collector is taught that way, the ' +
        'workflows are outside the coherence check rather than agreeing with it.'
    );
  }
  // `endsWith('Dockerfile')` would be satisfied by `Dockerfile` alone and blind
  // to a pillar that ships only a suffixed image — the same one-image
  // assumption the collector above no longer makes.
  if (!pins.some((pin) => isDockerfileName(basename(pin.source)))) {
    violations.push(
      'No pillar Dockerfile declares a `FROM node:<tag>` base image. Either pillars/ moved, ' +
        'or the images now derive their Node another way — either way the shipped runtime is ' +
        'no longer being compared against the local and CI pins.'
    );
  }

  /** @type {Record<string, string> | undefined} */
  let settings;
  try {
    settings = parseTomlSection(readFileSync(join(root, 'mise.toml'), 'utf8'), 'settings');
  } catch (error) {
    // `collectPins` read the same file for its `[tools]` table, so a document
    // that does not parse at all is already recorded and must not be counted
    // twice. A `[settings]` table that is present but not a table is NOT — that
    // failure is unique to this read, and swallowing it would drop the
    // activate_aggressive check silently.
    settings = undefined;
    const message = error instanceof Error ? error.message : String(error);
    if (!violations.includes(message)) violations.push(message);
  }
  if (settings !== undefined) {
    for (const [key, expected] of Object.entries(REQUIRED_MISE_SETTINGS)) {
      if (settings[key] !== expected) {
        violations.push(
          `mise.toml [settings] ${key} must be ${expected} (found ${settings[key] ?? 'unset'}). ` +
            'Without it mise appends its tool bin dirs after the inherited PATH, so a system ' +
            'Node ahead of the mise shims wins every shebang lookup inside a task.'
        );
      }
    }
  }

  return { pins, majors, violations };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-node-pin.mjs [--self-test]\n' +
        'Fails if the Node major disagrees across mise.toml, mise.ci.toml, package.json ' +
        'engines.node, the workflows and the pillar Dockerfiles, or if the root mise ' +
        'settings that carry the pin into tasks have been dropped.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { pins, majors, violations } = checkNodePin(repoRoot);

  if (violations.length === 0) {
    console.log(`OK — all ${pins.length} Node pins name major ${majors[0]}.`);
    process.exit(0);
  }
  for (const pin of pins) console.error(`  ${pin.source}: ${pin.expression}`);
  for (const violation of violations) console.error(`FAIL — ${violation}`);
  process.exit(1);
}

/** @returns {boolean} */
function selfTest() {
  const checks = [
    nodeMajor('24') === '24',
    nodeMajor('24.19.0') === '24',
    nodeMajor('^24') === '24',
    nodeMajor('>=24.1') === '24',
    nodeMajor('24-slim') === '24',
    nodeMajor('lts/*') === null,
    parseTomlSection('[settings]\nactivate_aggressive = true\n', 'settings').activate_aggressive ===
      'true',
    // A tree the collectors cannot see must fail, not agree with itself.
    emptyTreeIsReported(),
    // A pillar's SECOND image drifting off the fleet's major must be reported.
    // The first image agrees with everything, so this is the shape that used
    // to pass: the guard opened one file and never learned the other existed.
    secondImageDriftIsReported(),
    // And a pillar that ships only a suffixed image must still satisfy the
    // "some image declares a pin" floor rather than reading as an empty tree.
    suffixedOnlyImageSatisfiesTheFloor(),
    // Nor may an unreadable declaration site quietly agree with the others.
    unparseableWorkflowIsReported(),
    // A `[settings]` table that is present but is not a table is a failure only
    // this read sees, so it must not be swallowed as already-reported.
    malformedSettingsIsReported(),
    // A job that runs `node` without provisioning it is the coherence check's
    // blind spot: it declares no pin, so it never disagrees with anything.
    unprovisionedNodeStepIsReported(),
    // A job that provisions Node before running it — the fleet's own shape —
    // must not be flagged just for running `node`.
    provisionedNodeStepIsNotReported(),
    // A non-sequence `steps` value is a shape this guard cannot walk, not a
    // job with nothing to say.
    malformedStepsIsReported(),
    // A repo-local composite wrapper is how this fleet provisions Node, so it
    // must count — and must stop counting the moment it stops provisioning.
    wrapperProvisioningIsFollowed(),
    wrapperWithoutProvisioningIsReported(),
  ];
  const ok = checks.every(Boolean);
  if (!ok) console.error(`self-test FAILED: ${JSON.stringify(checks)}`);
  return ok;
}

/** A minimal, otherwise-coherent fixture tree so a self-test case's only
 * violation is the one it plants.
 * @param {string} dir
 * @param {string} workflow
 */
function writeCoherentFixture(dir, workflow) {
  writeFileSync(
    join(dir, 'mise.toml'),
    '[settings]\nactivate_aggressive = true\n\n[tools]\nnode = "24.19.0"\n',
    'utf8'
  );
  writeFileSync(join(dir, 'package.json'), '{"engines":{"node":"24"}}\n', 'utf8');
  mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
  writeFileSync(join(dir, '.github', 'workflows', 'sample.yml'), workflow, 'utf8');
}

/** @returns {boolean} */
function unprovisionedNodeStepIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'node-pin-unprovisioned-'));
  try {
    writeCoherentFixture(
      dir,
      'jobs:\n  release:\n    steps:\n      - uses: actions/checkout@v7\n      - run: node scripts/pack.mjs\n'
    );
    const violations = collectUnprovisionedNodeSteps(dir);
    return violations.some((v) => v.includes('provisions no pinned Node'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function provisionedNodeStepIsNotReported() {
  const dir = mkdtempSync(join(tmpdir(), 'node-pin-provisioned-'));
  try {
    writeCoherentFixture(
      dir,
      'jobs:\n  release:\n    steps:\n      - uses: actions/checkout@v7\n      - uses: jdx/mise-action@v4\n      - run: node scripts/pack.mjs\n'
    );
    return collectUnprovisionedNodeSteps(dir).length === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * @param {string} dir
 * @param {string} nestedUses
 */
function writeWrapperAction(dir, nestedUses) {
  const actionDir = join(dir, '.github', 'actions', 'setup-mise');
  mkdirSync(actionDir, { recursive: true });
  writeFileSync(
    join(actionDir, 'action.yml'),
    `name: Setup mise\ndescription: wrapper\nruns:\n  using: composite\n  steps:\n    - uses: ${nestedUses}\n`,
    'utf8'
  );
}

const WRAPPER_CALL_WORKFLOW =
  'jobs:\n  release:\n    steps:\n      - uses: actions/checkout@v7\n      - uses: ./.github/actions/setup-mise\n      - run: node scripts/pack.mjs\n';

/** @returns {boolean} */
function wrapperProvisioningIsFollowed() {
  const dir = mkdtempSync(join(tmpdir(), 'node-pin-wrapper-ok-'));
  try {
    writeCoherentFixture(dir, WRAPPER_CALL_WORKFLOW);
    writeWrapperAction(dir, 'jdx/mise-action@v4.2.5');
    return collectUnprovisionedNodeSteps(dir).length === 0;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function wrapperWithoutProvisioningIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'node-pin-wrapper-empty-'));
  try {
    writeCoherentFixture(dir, WRAPPER_CALL_WORKFLOW);
    writeWrapperAction(dir, 'actions/checkout@v7');
    return collectUnprovisionedNodeSteps(dir).some((v) => v.includes('provisions no pinned Node'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function malformedStepsIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'node-pin-badsteps-'));
  try {
    writeCoherentFixture(dir, 'jobs:\n  release:\n    steps: "not a sequence"\n');
    const violations = collectUnprovisionedNodeSteps(dir);
    return violations.some((v) => v.includes('is not a sequence'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function malformedSettingsIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'node-pin-badsettings-'));
  try {
    // `settings` before any table header, so it is a TOP-LEVEL key that is not
    // a table. `[tools]` still parses, so `collectPins` records no problem and
    // this read is the only one that sees the breakage.
    writeFileSync(join(dir, 'mise.toml'), 'settings = "on"\n\n[tools]\nnode = "24"\n', 'utf8');
    writeFileSync(join(dir, 'package.json'), '{"engines":{"node":"24"}}\n', 'utf8');
    const { violations } = checkNodePin(dir);
    return violations.some((v) => v.includes('[settings] is a string'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function unparseableWorkflowIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'node-pin-badyaml-'));
  try {
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    writeFileSync(
      join(dir, '.github', 'workflows', 'broken.yml'),
      'jobs:\n  a:\n   - b\n  - c\n',
      'utf8'
    );
    const { problems } = collectWorkflowPins(dir);
    return problems.some((p) => p.includes('could not be parsed'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * A pillar shipping two images, the second on a different major.
 *
 * @param {string} dir
 * @param {string} first
 * @param {string} second
 */
function writeTwoImagePillar(dir, first, second) {
  writeCoherentFixture(
    dir,
    'jobs:\n  a:\n    steps:\n      - with:\n          node-version: "24"\n'
  );
  const pillar = join(dir, 'pillars', 'design');
  mkdirSync(pillar, { recursive: true });
  writeFileSync(join(pillar, 'Dockerfile'), first, 'utf8');
  writeFileSync(join(pillar, 'Dockerfile.api'), second, 'utf8');
}

/** @returns {boolean} */
function secondImageDriftIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'node-pin-second-image-'));
  try {
    writeTwoImagePillar(dir, 'FROM node:24-alpine\n', 'FROM node:22-slim\n');
    const { violations } = checkNodePin(dir);
    return violations.some((v) => v.includes('disagree') && v.includes('Dockerfile.api'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function suffixedOnlyImageSatisfiesTheFloor() {
  const dir = mkdtempSync(join(tmpdir(), 'node-pin-suffixed-only-'));
  try {
    writeCoherentFixture(
      dir,
      'jobs:\n  a:\n    steps:\n      - with:\n          node-version: "24"\n'
    );
    const pillar = join(dir, 'pillars', 'design');
    mkdirSync(pillar, { recursive: true });
    writeFileSync(join(pillar, 'Dockerfile.api'), 'FROM node:24-slim\n', 'utf8');
    const { violations } = checkNodePin(dir);
    return !violations.some((v) => v.includes('declares a `FROM node:'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** @returns {boolean} */
function emptyTreeIsReported() {
  const dir = mkdtempSync(join(tmpdir(), 'node-pin-selftest-'));
  try {
    writeFileSync(
      join(dir, 'mise.toml'),
      '[tools]\nnode = "24"\n\n[settings]\nactivate_aggressive = true\n',
      'utf8'
    );
    writeFileSync(join(dir, 'package.json'), '{"engines":{"node":"24"}}\n', 'utf8');
    const { violations } = checkNodePin(dir);
    return (
      violations.some((v) => v.includes('No workflow declares')) &&
      violations.some((v) => v.includes('No pillar Dockerfile declares'))
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  main();
}
