#!/usr/bin/env node
/**
 * Exact-input result reuse for the per-unit CI lanes.
 *
 * A unit job computes one key over everything that can change its verdict,
 * asks the Actions artifacts API for a receipt with that exact name, and skips
 * its checks only when the receipt was uploaded by a trusted CI run. The job
 * itself still runs and succeeds, so the workflow conclusion and every required
 * check that aggregates it are unchanged. Receipts are workflow artifacts:
 * nothing outside a workflow run can create one, and local machines never do.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { environmentFingerprint } from '../local-dev/fingerprint.mjs';
import { addRepositoryFile, listRepositoryFiles } from '../local-dev/repository-inputs.mjs';
import { discoverPackages } from './select-affected-apps.mjs';

export const RECEIPT_VERSION = 1;
export const NO_CACHE_LABEL = 'no-ci-cache';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const self = 'scripts/ci/ci-receipts.mjs';
const promotionWorkflow = '.github/workflows/promotion-quality.yml';

/**
 * @typedef {'unit-ts' | 'unit-rust' | 'app'} LaneId
 * @typedef {{workflow: string, language: 'ts' | 'rust', checks: readonly string[], tools: readonly string[]}} Lane
 * @typedef {{dir: string, pkg: string}} Unit
 */

/**
 * Lanes whose results may be reused. Each one runs only deterministic checks
 * over checked-out inputs: no network fixtures, no clock-sensitive gates, no
 * external services. E2E, live-seam, iOS, image and supply-chain lanes are
 * deliberately absent and always run in full.
 * @type {Readonly<Record<LaneId, Lane>>}
 */
export const LANES = Object.freeze({
  'unit-ts': {
    workflow: '.github/workflows/unit-quality.yml',
    language: 'ts',
    checks: ['format', 'lint', 'build', 'typecheck', 'codegen', 'test'],
    tools: [],
  },
  'unit-rust': {
    workflow: '.github/workflows/unit-quality.yml',
    language: 'rust',
    checks: ['format', 'clippy', 'build', 'test'],
    tools: [],
  },
  app: {
    workflow: '.github/workflows/app-quality.yml',
    language: 'ts',
    checks: ['codegen', 'typecheck', 'build', 'test'],
    tools: ['scripts/codegen/generate.mjs'],
  },
});

const sharedRootInputs = ['.gitignore', 'mise.toml', 'mise.ci.toml', '.github/actions/setup-mise'];
/** @type {Record<Lane['language'], readonly string[]>} */
const languageRootInputs = {
  ts: [
    '.oxfmtrc.json',
    '.oxlintrc.json',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    'tsconfig.build.json',
  ],
  rust: [
    'Cargo.lock',
    'Cargo.toml',
    '.cargo',
    'clippy.toml',
    'rustfmt.toml',
    'rust-toolchain.toml',
  ],
};
const keyedEnvironment = ['ImageOS', 'MISE_ENV', 'RUNNER_ARCH', 'RUNNER_OS'];
const configFile =
  /(?:^|\/)(?:package\.json|mise\.toml|Cargo\.toml|tsconfig[^/]*\.json|[^/]+\.config\.[cm]?[jt]s)$/u;
const moduleFile = /\.[cm]?[jt]s$/u;
const relativeReference = /(?:^|[\s'"`=(,[])((?:\.\.?\/)+[\w@+-][\w@.+/-]*)/gu;
const generatedFile = /(?:\.gen\.ts|(?:^|\/)api-types\.generated\.ts)$/u;
const ignoredOutputDirectories = new Set([
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'storybook-static',
  'target',
  'test-results',
  'tmp',
]);

/** @param {string} path */
function toPosix(path) {
  return path.split(sep).join('/');
}

/** @param {string} file @param {readonly string[]} directories */
function inside(file, directories) {
  return directories.some((directory) => file === directory || file.startsWith(`${directory}/`));
}

/**
 * The repository directories a unit's checks read: the unit itself plus its
 * transitive workspace dependencies. Rust units take every Cargo workspace
 * member, since one lockfile and target directory serve them all.
 * @param {string} root
 * @param {Lane['language']} language
 * @param {string} unitDir
 * @returns {string[]}
 */
export function unitClosure(root, language, unitDir) {
  if (language === 'rust') {
    const manifest = readFileSync(join(root, 'Cargo.toml'), 'utf8');
    const members = /members\s*=\s*\[([^\]]*)\]/u.exec(manifest)?.[1] ?? '';
    const dirs = [...members.matchAll(/"([^"]+)"/gu)].map((match) => match[1] ?? '');
    if (!dirs.includes(unitDir)) throw new Error(`${unitDir} is not a Cargo workspace member`);
    return dirs.toSorted();
  }
  const packages = discoverPackages(root);
  const byName = new Map(
    packages.map((workspacePackage) => [workspacePackage.name, workspacePackage])
  );
  const start = packages.find((workspacePackage) => workspacePackage.dir === unitDir);
  if (!start) throw new Error(`${unitDir} is not a workspace package`);
  const seen = new Set([start.name]);
  const queue = [start];
  for (let next = queue.shift(); next; next = queue.shift()) {
    for (const dependency of next.dependencies) {
      const workspacePackage = byName.get(dependency);
      if (!workspacePackage || seen.has(dependency)) continue;
      seen.add(dependency);
      queue.push(workspacePackage);
    }
  }
  return [...seen].map((name) => byName.get(name)?.dir ?? '').toSorted();
}

/**
 * Repository files outside `boundary` that `sources` name by relative path:
 * root scripts a unit's tasks invoke, OpenAPI snapshots its generators read,
 * base configs it extends. Script files are followed through their own
 * relative imports. Only files count; a bare directory reference is ignored.
 * @param {string} root
 * @param {readonly string[]} sources
 * @param {readonly string[]} boundary
 * @returns {string[]}
 */
export function referencedFiles(root, sources, boundary) {
  const found = new Set();
  const visited = new Set();
  const pending = [...sources];
  for (let source = pending.pop(); source !== undefined; source = pending.pop()) {
    if (visited.has(source)) continue;
    visited.add(source);
    const absolute = join(root, source);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) continue;
    for (const match of readFileSync(absolute, 'utf8').matchAll(relativeReference)) {
      const target = toPosix(relative(root, resolve(dirname(absolute), match[1] ?? '')));
      if (target.startsWith('..') || target === '' || inside(target, boundary)) continue;
      const resolved = join(root, target);
      if (!existsSync(resolved) || !statSync(resolved).isFile()) continue;
      found.add(target);
      if (moduleFile.test(target)) pending.push(target);
    }
  }
  return [...found].toSorted();
}

/**
 * Generated TypeScript in the closure that git ignores. Tracked or untracked
 * generated files are already listed with ordinary sources; this keeps the
 * key correct when generated clients stop being tracked.
 * @param {string} root
 * @param {readonly string[]} directories
 * @returns {string[]}
 */
export function ignoredGeneratedFiles(root, directories) {
  const listed = execFileSync(
    'git',
    [
      'ls-files',
      '--others',
      '--ignored',
      '--exclude-standard',
      '--directory',
      '-z',
      '--',
      ...directories,
    ],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  const found = [];
  for (const entry of listed.split('\0').filter(Boolean)) {
    if (!entry.endsWith('/')) {
      if (generatedFile.test(entry)) found.push(entry);
      continue;
    }
    walk(entry.slice(0, -1));
  }
  return found.toSorted();

  /** @param {string} directory */
  function walk(directory) {
    if (ignoredOutputDirectories.has(directory.split('/').at(-1) ?? '')) return;
    for (const child of readdirSync(join(root, directory), { withFileTypes: true })) {
      const path = `${directory}/${child.name}`;
      if (child.isDirectory()) walk(path);
      else if (generatedFile.test(path)) found.push(path);
    }
  }
}

/**
 * Every file whose content is part of a unit's receipt key, sorted.
 * @param {string} root
 * @param {LaneId} laneId
 * @param {Unit} unit
 * @returns {string[]}
 */
export function receiptInputs(root, laneId, unit) {
  const lane = LANES[laneId];
  const closure = unitClosure(root, lane.language, unit.dir);
  const listed = listRepositoryFiles(root, [
    ...closure,
    ...sharedRootInputs,
    ...languageRootInputs[lane.language],
    lane.workflow,
  ]);
  const definitions = [self, ...lane.tools];
  return [
    ...new Set([
      ...listed,
      ...definitions,
      ...referencedFiles(root, definitions, []),
      ...referencedFiles(
        root,
        listed.filter((file) => inside(file, closure) && configFile.test(file)),
        closure
      ),
      ...ignoredGeneratedFiles(root, closure),
    ]),
  ].toSorted();
}

/** @param {string} dir */
function slug(dir) {
  return dir.replaceAll('/', '_');
}

/**
 * The exact artifact name a receipt for these inputs is stored under. Paths
 * and contents are hashed; environment values are hashed and never stored.
 * @param {{root: string, lane: LaneId, unit: Unit, environment: NodeJS.ProcessEnv}} options
 * @returns {{digest: string, name: string, inputs: number}}
 */
export function receiptKey({ root, lane, unit, environment }) {
  const definition = LANES[lane];
  if (!definition) throw new Error(`unknown receipt lane ${lane}`);
  const files = receiptInputs(root, lane, unit);
  const hash = createHash('sha256');
  hash.update(JSON.stringify({ version: RECEIPT_VERSION, lane, checks: definition.checks, unit }));
  hash.update(
    environmentFingerprint(
      Object.fromEntries(keyedEnvironment.map((key) => [key, environment[key] ?? '']))
    )
  );
  for (const file of files) addRepositoryFile(hash, root, file, { environmentFileContent: true });
  const digest = hash.digest('hex');
  return {
    digest,
    name: `ci-receipt-v${RECEIPT_VERSION}-${lane}-${slug(unit.dir)}-${digest}`,
    inputs: files.length,
  };
}

/**
 * Whether this run may reuse receipts. A `workflow_dispatch` input or the
 * `no-ci-cache` pull-request label forces every check to run; labels are read
 * from the triggering event, so a label change takes effect on the next push.
 * @param {{noCacheInput: string | undefined, labels: string | undefined}} options
 * @returns {{reuse: boolean, reason: string}}
 */
export function reusePolicy({ noCacheInput, labels }) {
  if (noCacheInput === 'true') return { reuse: false, reason: 'the no-ci-cache input is set' };
  /** @type {unknown} */
  let parsed = [];
  try {
    parsed = labels ? JSON.parse(labels) : [];
  } catch {
    return { reuse: false, reason: 'pull request labels are unreadable' };
  }
  if (parsed === null) parsed = [];
  if (!Array.isArray(parsed)) return { reuse: false, reason: 'pull request labels are unreadable' };
  if (parsed.includes(NO_CACHE_LABEL))
    return { reuse: false, reason: `the ${NO_CACHE_LABEL} label is set` };
  return { reuse: true, reason: 'receipt reuse is enabled' };
}

/**
 * @typedef {{id: number, expired: boolean, workflow_run?: {id?: number, repository_id?: number, head_repository_id?: number} | null}} Artifact
 * @typedef {{id: number, event: string, head_branch: string | null, head_sha: string, path: string, html_url: string, run_attempt?: number, repository: {id: number}, head_repository: {id: number} | null}} WorkflowRun
 * @typedef {{repositoryId: number, event: string, headRef: string}} RunContext
 */

/**
 * Only CI runs that executed a protected branch's own workflow, or earlier
 * runs of this same pull request, may vouch for a result. Fork runs and other
 * pull requests never can, whatever they upload.
 * @param {WorkflowRun} run
 * @param {RunContext} context
 * @param {LaneId} lane
 * @returns {boolean}
 */
export function trustedProducer(run, context, lane) {
  if (
    run.repository.id !== context.repositoryId ||
    run.head_repository?.id !== context.repositoryId
  )
    return false;
  const path = run.path.replace(/@.*$/u, '');
  if (path !== LANES[lane].workflow && path !== promotionWorkflow) return false;
  const branch = run.head_branch ?? '';
  if (run.event === 'push' || run.event === 'workflow_dispatch')
    return branch === 'main' || branch.startsWith('integration/');
  return (
    run.event === 'pull_request' &&
    context.event === 'pull_request' &&
    context.headRef !== '' &&
    branch === context.headRef
  );
}

/**
 * Find a trusted receipt for `name`. Any API failure is a miss, never an error:
 * the cost of an unreachable receipt store is a full run.
 * @param {{name: string, lane: LaneId, context: RunContext, listArtifacts: (name: string) => Promise<Artifact[]>, getRun: (id: number) => Promise<WorkflowRun>}} options
 * @returns {Promise<{run: WorkflowRun | null, reason: string}>}
 */
export async function findReceipt({ name, lane, context, listArtifacts, getRun }) {
  let artifacts;
  try {
    artifacts = await listArtifacts(name);
  } catch (error) {
    return { run: null, reason: `receipt lookup failed: ${messageOf(error)}` };
  }
  const candidates = artifacts
    .filter(
      (artifact) =>
        !artifact.expired &&
        artifact.workflow_run?.id !== undefined &&
        artifact.workflow_run.repository_id === context.repositoryId &&
        artifact.workflow_run.head_repository_id === context.repositoryId
    )
    .toSorted((a, b) => b.id - a.id)
    .slice(0, 5);
  for (const artifact of candidates) {
    const runId = artifact.workflow_run?.id;
    if (runId === undefined) continue;
    try {
      const run = await getRun(runId);
      if (trustedProducer(run, context, lane)) return { run, reason: 'trusted receipt found' };
    } catch (error) {
      return { run: null, reason: `producing run lookup failed: ${messageOf(error)}` };
    }
  }
  return {
    run: null,
    reason:
      artifacts.length === 0 ? 'no receipt for these inputs' : 'no receipt from a trusted run',
  };
}

/** @param {unknown} error */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {string[]} argv
 * @returns {{lane: LaneId, dir: string, pkg: string}}
 */
function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== 'resolve')
    throw new Error('usage: ci-receipts.mjs resolve --lane <lane> --dir <dir> --pkg <pkg>');
  /** @type {Record<string, string>} */
  const values = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index] ?? '';
    const value = rest[index + 1];
    if (!['--lane', '--dir', '--pkg'].includes(flag) || value === undefined)
      throw new Error(`unexpected argument ${flag}`);
    values[flag.slice(2)] = value;
  }
  const { lane, dir, pkg } = values;
  if (!lane || !dir || !pkg) throw new Error('--lane, --dir and --pkg are required');
  if (!Object.hasOwn(LANES, lane)) throw new Error(`unknown receipt lane ${lane}`);
  return { lane: /** @type {LaneId} */ (lane), dir, pkg };
}

/** @param {string} path @param {string} token */
async function githubGet(path, token) {
  const response = await fetch(`${process.env.GITHUB_API_URL ?? 'https://api.github.com'}${path}`, {
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`GET ${path} returned ${response.status}`);
  return response.json();
}

async function main() {
  const { lane, dir, pkg } = parseArgs(process.argv.slice(2));
  const environment = process.env;
  const key = receiptKey({ root: repoRoot, lane, unit: { dir, pkg }, environment });
  const receiptPath = join('tmp', 'ci-receipts', `${key.name}.json`);
  mkdirSync(join(repoRoot, dirname(receiptPath)), { recursive: true });
  const server = environment.GITHUB_SERVER_URL ?? 'https://github.com';
  const repository = environment.GITHUB_REPOSITORY ?? '';
  writeFileSync(
    join(repoRoot, receiptPath),
    `${JSON.stringify(
      {
        version: RECEIPT_VERSION,
        lane,
        unit: { dir, pkg },
        checks: LANES[lane].checks,
        digest: key.digest,
        run: {
          id: environment.GITHUB_RUN_ID ?? '',
          attempt: environment.GITHUB_RUN_ATTEMPT ?? '',
          url: `${server}/${repository}/actions/runs/${environment.GITHUB_RUN_ID ?? ''}`,
          sha: environment.GITHUB_SHA ?? '',
          ref: environment.GITHUB_REF ?? '',
          event: environment.GITHUB_EVENT_NAME ?? '',
        },
      },
      null,
      2
    )}\n`
  );
  console.log(`Receipt key ${key.name} covers ${key.inputs} input files.`);

  const policy = reusePolicy({
    noCacheInput: environment.NO_CI_CACHE,
    labels: environment.PR_LABELS,
  });
  let reuse = false;
  if (!policy.reuse) {
    console.log(`Receipt reuse disabled: ${policy.reason}. Running every check.`);
  } else {
    const token = environment.GITHUB_TOKEN ?? '';
    const found = await findReceipt({
      name: key.name,
      lane,
      context: {
        repositoryId: Number(environment.GITHUB_REPOSITORY_ID ?? '0'),
        event: environment.GITHUB_EVENT_NAME ?? '',
        headRef: environment.GITHUB_HEAD_REF ?? '',
      },
      listArtifacts: async (name) => {
        /** @type {{artifacts: Artifact[]}} */
        const body = await githubGet(
          `/repos/${repository}/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`,
          token
        );
        return body.artifacts;
      },
      getRun: (id) => githubGet(`/repos/${repository}/actions/runs/${id}`, token),
    });
    if (found.run) {
      reuse = true;
      const origin = `${found.run.event} on ${found.run.head_branch ?? '?'} at ${found.run.head_sha}`;
      console.log(
        `::notice title=CI receipt reused::${key.name} was produced by ${found.run.html_url} (${origin}); skipping ${LANES[lane].checks.join(', ')}.`
      );
    } else {
      console.log(`No reusable receipt (${found.reason}). Running every check.`);
    }
  }

  const output = environment.GITHUB_OUTPUT;
  if (output) {
    appendFileSync(output, `name=${key.name}\npath=${receiptPath}\nreuse=${reuse}\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(messageOf(error));
    process.exitCode = 1;
  });
}
