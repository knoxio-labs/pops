#!/usr/bin/env node
/**
 * Mise setup single-source guard: every workflow reaches `jdx/mise-action`
 * through `.github/actions/setup-mise`, and that one call site pins a version
 * that carries the action's download retry.
 *
 * WHY THE INVARIANT IS WORTH A GUARD. `jdx/mise-action` fetches the mise binary
 * from GitHub Releases on a cache MISS. Before v4.2.5 that fetch was a single
 * un-retried `curl`, so one transient 503 from the release CDN failed the setup
 * step before any job step ran — and inside a merge group that reads as
 * `failed_checks`, evicting a green entry from the queue. The fix is entirely a
 * version fact: v4.2.5 retries every download five times. It cannot be wrapped
 * locally, because a composite action's steps reject `continue-on-error` and so
 * cannot attempt a nested `uses:` and recover.
 *
 * That makes the version the only lever, and a version hand-copied into every
 * lane's `uses:` line is a lever with one handle per lane. The wrapper collapses
 * them to one; this guard is what keeps the next lane from growing its own. Both
 * halves matter — a repo where every lane but one uses the wrapper has the bug
 * back on that one, silently, because the rest are green.
 *
 * WHAT IT REFUSES, and why each is a violation rather than a shrug:
 *
 *   - A `uses:` that names `jdx/mise-action` at all, in a workflow or in any
 *     OTHER composite action under `.github/actions`. The wrapper is the only
 *     sanctioned call site. Composite actions live under `.github/actions`, so a
 *     guard that read only `.github/workflows` would leave the directory holding
 *     the wrapper unscanned — which is where the seventh call site is likeliest
 *     to appear.
 *   - A wrapper pin that is floating (`@v4`) or a branch. `@v4` resolved to the
 *     un-retried v4.2.4 on the day the evictions happened. A major-only pin
 *     cannot express "must carry the retry", so it is not a pin for this
 *     purpose.
 *   - A wrapper pin that is a bare commit SHA. The retry cannot be read off a
 *     SHA without a network call this guard will not make, and a shape the
 *     guard cannot rule on is a violation, not a pass — see
 *     [ADR-045](../../docs/architecture/adr-045-guards-must-prove-they-report.md).
 *   - A wrapper pin below {@link RETRY_FLOOR}, which is the release that added
 *     the retry. Dependabot moves the pin forward; nothing stopped it moving
 *     back.
 *
 * WHAT IT REFUSES TO ASSUME. Discovery is the failure path ADR-045 was written
 * about, so none of it is allowed to come back empty and read as clean: zero
 * workflow files, a missing or unparseable wrapper, a wrapper with no
 * `jdx/mise-action` step, or a wrapper with more than one are each reported as
 * findings. A repo where the wrapper has been deleted and every workflow
 * therefore has nothing to violate is exactly the state this guard exists to
 * catch, and the naive version of it passes. The same applies to the composite
 * actions beside it: YAML under `.github/actions` that does not parse is a
 * finding, not a file quietly dropped from the sweep.
 *
 * **Tier B guard**: it reads workflow YAML through a real parser, so the job
 * that runs it installs the workspace first. See the tier amendment in
 * [ADR-045](../../docs/architecture/adr-045-guards-must-prove-they-report.md).
 *
 * Usage:
 *   node scripts/ci/check-mise-setup-single-source.mjs
 *   node scripts/ci/check-mise-setup-single-source.mjs --self-test
 *
 * Exit 0 = clean. Exit 1 = at least one violation. Exit 2 = usage error.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConfigParseError, parseYaml, scalarText, walkMappings } from './config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const WORKFLOWS_DIR = join(repoRoot, '.github', 'workflows');
const ACTIONS_DIR = join(repoRoot, '.github', 'actions');
const WRAPPER_PATH = join(repoRoot, '.github', 'actions', 'setup-mise', 'action.yml');

/** How a workflow is expected to name the wrapper. */
export const WRAPPER_USES = './.github/actions/setup-mise';

/** Path of the wrapper, as printed in findings. */
export const WRAPPER_REL = '.github/actions/setup-mise/action.yml';

/** The upstream action the wrapper — and nothing else — is allowed to call. */
const UPSTREAM = 'jdx/mise-action';

/**
 * First `jdx/mise-action` release whose download helpers retry.
 *
 * Below this the binary/checksum/signature fetches make exactly one attempt, so
 * a transient release-CDN error aborts setup and fails the job.
 */
export const RETRY_FLOOR = [4, 2, 5];

/** An exact release pin: `v4.2.5`. Anything else is not one. */
const EXACT_PIN = /^v(\d+)\.(\d+)\.(\d+)$/u;

/** A bare commit SHA pin, which this guard cannot rule on. */
const SHA_PIN = /^[0-9a-f]{7,40}$/u;

/**
 * Every `uses:` value in a parsed workflow or action document.
 *
 * Walked rather than line-matched: `uses` is reachable through `jobs.<id>.steps`
 * and through a composite's `runs.steps`, at indents and flow spellings a regex
 * would have to enumerate. The traversal sees all of them because by the time it
 * runs they are the same tree.
 *
 * @param {unknown} doc  Parsed YAML document.
 * @returns {string[]}
 */
export function usesValues(doc) {
  /** @type {string[]} */
  const out = [];
  for (const entry of walkMappings(doc)) {
    if (entry.key !== 'uses') continue;
    const text = scalarText(entry.value);
    if (text === undefined) continue;
    out.push(text.trim());
  }
  return out;
}

/**
 * @typedef {object} WrapperPin
 * @property {'exact'} kind
 * @property {string} ref            The literal ref, e.g. `v4.2.5`.
 * @property {[number, number, number]} version
 */

/**
 * @typedef {object} UnrulablePin
 * @property {'floating' | 'sha' | 'unrecognised'} kind
 * @property {string} ref
 */

/**
 * Classify the ref a `uses:` line pins.
 *
 * @param {string} ref
 * @returns {WrapperPin | UnrulablePin}
 */
export function classifyPin(ref) {
  const exact = EXACT_PIN.exec(ref);
  if (exact) {
    return {
      kind: 'exact',
      ref,
      version: [Number(exact[1]), Number(exact[2]), Number(exact[3])],
    };
  }
  if (/^v\d+(\.\d+)?$/u.test(ref)) return { kind: 'floating', ref };
  if (SHA_PIN.test(ref)) return { kind: 'sha', ref };
  return { kind: 'unrecognised', ref };
}

/**
 * `a >= b` over `[major, minor, patch]`.
 *
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {boolean}
 */
export function atLeast(a, b) {
  for (const [index, floor] of b.entries()) {
    const part = a[index] ?? 0;
    if (part !== floor) return part > floor;
  }
  return true;
}

/**
 * @typedef {object} Inputs
 * @property {Map<string, string>} workflows  Workflow filename to YAML source.
 * @property {Map<string, string>} actions    Repo-relative path to YAML source, for every
 *                                            composite action under `.github/actions` EXCEPT the
 *                                            wrapper itself.
 * @property {string | null} wrapper          Wrapper action YAML source, or null if absent.
 */

/**
 * The whole ruling, as a list of findings. Empty means clean.
 *
 * Pure over in-memory sources so the self-test can drive the degenerate
 * inputs — no workflows at all, no wrapper at all, a wrapper that does not
 * parse — which a fixture tree makes awkward and which are precisely the
 * states that must not read as clean.
 *
 * @param {Inputs} inputs
 * @returns {string[]} Findings, in reporting order.
 */
export function findViolations({ workflows, actions, wrapper }) {
  /** @type {string[]} */
  const findings = [];

  if (workflows.size === 0) {
    findings.push(
      'discovered no workflow files under .github/workflows — this guard cannot see its subject, ' +
        'which is a finding and not a clean tree.'
    );
  }

  /** @type {[string, string][]} */
  const callers = [];
  for (const [name, source] of [...workflows].toSorted(([a], [b]) => a.localeCompare(b))) {
    callers.push([`.github/workflows/${name}`, source]);
  }
  for (const entry of [...actions].toSorted(([a], [b]) => a.localeCompare(b))) {
    callers.push(entry);
  }

  let wrapperUsers = 0;
  for (const [label, source] of callers) {
    /** @type {string[]} */
    let uses;
    try {
      uses = usesValues(parseYaml(source, label));
    } catch (error) {
      findings.push(
        error instanceof ConfigParseError
          ? error.message
          : `${label} could not be read: ${String(error)}`
      );
      continue;
    }
    for (const value of uses) {
      if (value === WRAPPER_USES) wrapperUsers += 1;
      if (!value.startsWith(`${UPSTREAM}@`) && value !== UPSTREAM) continue;
      findings.push(
        `${label} calls \`${value}\` directly. ` +
          `Use \`${WRAPPER_USES}\` so the pinned version stays in one place.`
      );
    }
  }

  if (wrapper === null) {
    findings.push(
      `${WRAPPER_REL} is missing. Every workflow's mise setup routes through it, so without ` +
        'it there is no pinned version for this guard to rule on.'
    );
    return findings;
  }

  /** @type {string[]} */
  let wrapperUses;
  try {
    wrapperUses = usesValues(parseYaml(wrapper, WRAPPER_REL));
  } catch (error) {
    findings.push(
      error instanceof ConfigParseError
        ? error.message
        : `${WRAPPER_REL} could not be read: ${String(error)}`
    );
    return findings;
  }

  const upstream = wrapperUses.filter(
    (value) => value === UPSTREAM || value.startsWith(`${UPSTREAM}@`)
  );
  if (upstream.length !== 1) {
    findings.push(
      `${WRAPPER_REL} has ${upstream.length} \`${UPSTREAM}\` step(s); expected exactly 1. ` +
        'The wrapper exists to be the single place that names the upstream action.'
    );
    return findings;
  }

  const ref = upstream[0].slice(UPSTREAM.length + 1);
  const pin = classifyPin(ref);
  const floor = RETRY_FLOOR.join('.');
  if (pin.kind === 'floating') {
    findings.push(
      `${WRAPPER_REL} pins \`${UPSTREAM}@${ref}\`, a floating tag. It cannot express "carries the ` +
        `download retry" — the same tag resolved below v${floor} while the retry was missing. ` +
        `Pin an exact release, v${floor} or later.`
    );
  } else if (pin.kind === 'sha') {
    findings.push(
      `${WRAPPER_REL} pins \`${UPSTREAM}@${ref}\`, a commit SHA. This guard cannot tell whether a ` +
        `SHA carries the download retry without a network call it will not make, so it reports ` +
        `rather than assumes. Pin an exact release, v${floor} or later.`
    );
  } else if (pin.kind === 'unrecognised') {
    findings.push(
      `${WRAPPER_REL} pins \`${UPSTREAM}@${ref}\`, which is not a release tag this guard models. ` +
        `Pin an exact release, v${floor} or later.`
    );
  } else if (!atLeast(pin.version, RETRY_FLOOR)) {
    findings.push(
      `${WRAPPER_REL} pins \`${UPSTREAM}@${ref}\`, which predates the download retry added in ` +
        `v${floor}. On a cold mise cache one transient release-CDN error fails setup and evicts ` +
        'the merge-queue entry.'
    );
  }

  if (workflows.size > 0 && wrapperUsers === 0) {
    findings.push(
      `no workflow uses \`${WRAPPER_USES}\`. The wrapper is pinned and unreferenced, which means ` +
        'nothing is actually getting the pinned version.'
    );
  }

  return findings;
}

/**
 * Read `.github/workflows/*.yml` off disk.
 *
 * A read error propagates. A guard that swallowed it would report on the files
 * it happened to manage to read and call that a clean sweep.
 *
 * @param {string} dir
 * @returns {Map<string, string>}
 */
function readWorkflows(dir) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true }).toSorted((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.yml') && !entry.name.endsWith('.yaml')) continue;
    out.set(entry.name, readFileSync(join(dir, entry.name), 'utf8'));
  }
  return out;
}

/**
 * Read every composite action definition under `.github/actions`, except the
 * wrapper — which is ruled on separately, and is the one file allowed to name
 * the upstream action.
 *
 * Walked recursively rather than globbed one level deep: `uses: ./.github/
 * actions/a/b` is a legal reference to a nested definition, so a one-level scan
 * would sanction a call site the workflows can already reach.
 *
 * @param {string} dir       Directory to walk.
 * @param {string} exclude   Absolute path of the wrapper.
 * @returns {Map<string, string>} Repo-relative path to source.
 */
function readActionDefinitions(dir, exclude) {
  /** @type {Map<string, string>} */
  const out = new Map();
  /** @type {import('node:fs').Dirent[]} */
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return out;
    throw error;
  }
  for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [nested, source] of readActionDefinitions(path, exclude)) out.set(nested, source);
      continue;
    }
    if (!entry.isFile()) continue;
    if (entry.name !== 'action.yml' && entry.name !== 'action.yaml') continue;
    if (path === exclude) continue;
    out.set(relative(repoRoot, path), readFileSync(path, 'utf8'));
  }
  return out;
}

/**
 * @param {string} path
 * @returns {string | null} Source, or null when the file is absent.
 */
function readOptional(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const CLEAN_WRAPPER = [
  'runs:',
  '  using: composite',
  '  steps:',
  `    - uses: ${UPSTREAM}@v${RETRY_FLOOR.join('.')}`,
  '',
].join('\n');

const CLEAN_WORKFLOW = [
  'jobs:',
  '  build:',
  '    steps:',
  '      - uses: actions/checkout@v7',
  `      - uses: ${WRAPPER_USES}`,
  '',
].join('\n');

/**
 * Self-test. Every case below is a state that must NOT read as clean, and half
 * of them are absences rather than planted violations — the half ADR-045 says a
 * self-test usually skips.
 *
 * @returns {boolean}
 */
function selfTest() {
  /** @type {[string, boolean][]} */
  const cases = [
    [
      'clean fixture passes',
      findViolations({
        actions: new Map(),
        workflows: new Map([['a.yml', CLEAN_WORKFLOW]]),
        wrapper: CLEAN_WRAPPER,
      }).length === 0,
    ],
    [
      'catches a workflow calling the action directly',
      findViolations({
        actions: new Map(),
        workflows: new Map([
          ['a.yml', CLEAN_WORKFLOW],
          ['b.yml', `jobs:\n  x:\n    steps:\n      - uses: ${UPSTREAM}@v4.2.5\n`],
        ]),
        wrapper: CLEAN_WRAPPER,
      }).some((f) => f.includes('b.yml') && f.includes('directly')),
    ],
    [
      'catches another composite action calling the action directly',
      findViolations({
        actions: new Map([
          [
            '.github/actions/setup-tools/action.yml',
            `runs:\n  using: composite\n  steps:\n    - uses: ${UPSTREAM}@v4\n`,
          ],
        ]),
        workflows: new Map([['a.yml', CLEAN_WORKFLOW]]),
        wrapper: CLEAN_WRAPPER,
      }).some(
        (f) => f.includes('.github/actions/setup-tools/action.yml') && f.includes('directly')
      ),
    ],
    [
      'DEGENERATE — unparseable YAML in another composite action is a finding, not a skip',
      findViolations({
        actions: new Map([['.github/actions/setup-tools/action.yml', 'runs:\n   - [unbalanced\n']]),
        workflows: new Map([['a.yml', CLEAN_WORKFLOW]]),
        wrapper: CLEAN_WRAPPER,
      }).some(
        (f) =>
          f.includes('.github/actions/setup-tools/action.yml') && f.includes('could not be parsed')
      ),
    ],
    [
      'catches a floating wrapper pin',
      findViolations({
        actions: new Map(),
        workflows: new Map([['a.yml', CLEAN_WORKFLOW]]),
        wrapper: CLEAN_WRAPPER.replace(`@v${RETRY_FLOOR.join('.')}`, '@v4'),
      }).some((f) => f.includes('floating')),
    ],
    [
      'catches a SHA wrapper pin',
      findViolations({
        actions: new Map(),
        workflows: new Map([['a.yml', CLEAN_WORKFLOW]]),
        wrapper: CLEAN_WRAPPER.replace(
          `@v${RETRY_FLOOR.join('.')}`,
          '@3c2e0cf82a5b2e5249f0d3635a4d83d0ae861518'
        ),
      }).some((f) => f.includes('commit SHA')),
    ],
    [
      'catches a wrapper pinned below the retry',
      findViolations({
        actions: new Map(),
        workflows: new Map([['a.yml', CLEAN_WORKFLOW]]),
        wrapper: CLEAN_WRAPPER.replace(`@v${RETRY_FLOOR.join('.')}`, '@v4.2.4'),
      }).some((f) => f.includes('predates the download retry')),
    ],
    [
      'DEGENERATE — a missing wrapper is a finding, not silence',
      findViolations({
        actions: new Map(),
        workflows: new Map([['a.yml', CLEAN_WORKFLOW]]),
        wrapper: null,
      }).some((f) => f.includes('is missing')),
    ],
    [
      'DEGENERATE — a wrapper with no upstream step is a finding',
      findViolations({
        actions: new Map(),
        workflows: new Map([['a.yml', CLEAN_WORKFLOW]]),
        wrapper: 'runs:\n  using: composite\n  steps:\n    - run: echo hi\n',
      }).some((f) => f.includes('expected exactly 1')),
    ],
    [
      'DEGENERATE — discovering no workflows is a finding',
      findViolations({ workflows: new Map(), actions: new Map(), wrapper: CLEAN_WRAPPER }).some(
        (f) => f.includes('discovered no workflow files')
      ),
    ],
    [
      'DEGENERATE — a wrapper nothing references is a finding',
      findViolations({
        actions: new Map(),
        workflows: new Map([['a.yml', 'jobs:\n  x:\n    steps:\n      - run: echo hi\n']]),
        wrapper: CLEAN_WRAPPER,
      }).some((f) => f.includes('pinned and unreferenced')),
    ],
    [
      'DEGENERATE — unparseable workflow YAML is a finding, not a skip',
      findViolations({
        actions: new Map(),
        workflows: new Map([
          ['a.yml', CLEAN_WORKFLOW],
          ['bad.yml', 'jobs:\n  x:\n   - [unbalanced\n'],
        ]),
        wrapper: CLEAN_WRAPPER,
      }).some((f) => f.includes('bad.yml') && f.includes('could not be parsed')),
    ],
    [
      'DEGENERATE — unparseable wrapper YAML is a finding, not a skip',
      findViolations({
        actions: new Map(),
        workflows: new Map([['a.yml', CLEAN_WORKFLOW]]),
        wrapper: 'runs:\n  steps:\n   - [unbalanced\n',
      }).some((f) => f.includes(WRAPPER_REL) && f.includes('could not be parsed')),
    ],
  ];

  const failed = cases.filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.error('SELF-TEST FAILED — guard did not behave as expected:');
    for (const [label] of failed) console.error(`  ${label}`);
    return false;
  }
  const degenerate = cases.filter(([label]) => label.startsWith('DEGENERATE')).length;
  console.log(`self-test OK — ${cases.length} cases, including ${degenerate} degenerate ones.`);
  return true;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      'Usage: node scripts/ci/check-mise-setup-single-source.mjs [--self-test]\n' +
        'Fails if a workflow calls jdx/mise-action directly, or if the setup-mise wrapper\n' +
        'does not pin a release carrying the action\u2019s download retry.'
    );
    process.exit(2);
  }
  if (args.includes('--self-test')) {
    process.exit(selfTest() ? 0 : 1);
  }

  const workflows = readWorkflows(WORKFLOWS_DIR);
  const actions = readActionDefinitions(ACTIONS_DIR, WRAPPER_PATH);
  const wrapper = readOptional(WRAPPER_PATH);
  console.log(
    `Scanned ${workflows.size} workflow file(s) and ${actions.size} other composite action(s) ` +
      `against ${WRAPPER_REL} (retry floor v${RETRY_FLOOR.join('.')}).`
  );

  const findings = findViolations({ workflows, actions, wrapper });
  if (findings.length === 0) {
    console.log(`OK — ${UPSTREAM} is named once, and the pin carries the download retry.`);
    process.exit(0);
  }
  for (const finding of findings) console.error(`FAIL — ${finding}`);
  process.exit(1);
}

if (import.meta.main) {
  main();
}
