import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  LANES,
  findReceipt,
  receiptInputs,
  receiptKey,
  reusePolicy,
  trustedProducer,
} from '../ci-receipts.mjs';
import { isMapping, parseYaml } from '../config-parse.mjs';
import { commit, fixtureRepo, write } from './git-fixture.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function manifest(name: string, dependencies: string[] = [], scripts: Record<string, string> = {}) {
  return `${JSON.stringify({
    name,
    dependencies: Object.fromEntries(dependencies.map((dependency) => [dependency, 'workspace:*'])),
    scripts,
  })}\n`;
}

function workspace(): string {
  const root = fixtureRepo();
  roots.push(root);
  const files: Record<string, string> = {
    '.gitignore': 'node_modules\ntmp\ngenerated/\n',
    'package.json': manifest('pops-root'),
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
    'pnpm-workspace.yaml': "packages: ['libs/*', 'pillars/*', 'pillars/*/*']\n",
    'mise.toml': '[tools]\nnode = "24.1.0"\n',
    'mise.ci.toml': '[tools]\nnode = "24.1.0"\n',
    'tsconfig.base.json': '{}\n',
    'Cargo.toml': '[workspace]\nmembers = ["pillars/contacts", "libs/pops-ai"]\n',
    'Cargo.lock': 'version = 4\n',
    '.github/workflows/unit-quality.yml': 'name: Unit Quality\n',
    '.github/workflows/app-quality.yml': 'name: App Quality\n',
    '.github/actions/setup-mise/action.yml': 'name: Setup mise\n',
    'scripts/ci/ci-receipts.mjs': "import './receipt-helper.mjs';\n",
    'scripts/ci/receipt-helper.mjs': 'export {};\n',
    'scripts/ci/check-generated-clients.mjs': 'export {};\n',
    'scripts/require-built-graph.mjs': "import './graph-helper.mjs';\n",
    'scripts/graph-helper.mjs': 'export {};\n',
    'scripts/unrelated.mjs': 'export {};\n',
    'libs/types/package.json': manifest('@pops/types'),
    'libs/types/src/index.ts': 'export type Id = string;\n',
    'libs/ui/package.json': manifest('@pops/ui', ['@pops/types']),
    'libs/ui/src/index.ts': 'export const ui = 1;\n',
    'pillars/alpha/package.json': manifest('@pops/alpha', ['@pops/ui'], {
      test: 'node ../../scripts/require-built-graph.mjs && vitest run',
    }),
    'pillars/alpha/src/index.ts': 'export const alpha = 1;\n',
    'pillars/alpha/.env.example': 'ALPHA_URL=\n',
    'pillars/alpha/openapi/alpha.openapi.json': '{"openapi":"3.1.0"}\n',
    'pillars/alpha/generated/client.gen.ts': 'export const generated = 1;\n',
    'pillars/alpha/src/tracked.gen.ts': 'export const tracked = 1;\n',
    'pillars/beta/package.json': manifest('@pops/beta'),
    'pillars/beta/src/index.ts': 'export const beta = 1;\n',
    'pillars/beta/app/package.json': manifest('@pops/app-beta', ['@pops/beta']),
    'pillars/beta/app/openapi-ts.alpha.config.ts':
      "export default { input: '../../alpha/openapi/alpha.openapi.json' };\n",
    'pillars/beta/app/src/main.ts': 'export const app = 1;\n',
    'pillars/contacts/Cargo.toml': '[package]\nname = "contacts"\n',
    'pillars/contacts/src/main.rs': 'fn main() {}\n',
    'libs/pops-ai/Cargo.toml': '[package]\nname = "pops-ai"\n',
    'libs/pops-ai/src/lib.rs': '\n',
  };
  for (const [path, content] of Object.entries(files)) write(root, path, content);
  commit(root, 'fixture');
  return root;
}

const alpha = { dir: 'pillars/alpha', pkg: '@pops/alpha' };
const betaApp = { dir: 'pillars/beta/app', pkg: '@pops/app-beta' };
const contacts = { dir: 'pillars/contacts', pkg: 'contacts' };
const environment = { MISE_ENV: 'ci', RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64', ImageOS: 'ubuntu24' };

function key(
  root: string,
  lane: keyof typeof LANES,
  unit: { dir: string; pkg: string },
  env: NodeJS.ProcessEnv = environment
) {
  return receiptKey({ root, lane, unit, environment: env }).digest;
}

describe('receipt keys', { timeout: 30_000 }, () => {
  it('is stable for identical inputs and names the lane and unit', () => {
    const root = workspace();
    const first = receiptKey({ root, lane: 'unit-ts', unit: alpha, environment });
    expect(receiptKey({ root, lane: 'unit-ts', unit: alpha, environment })).toEqual(first);
    expect(first.name).toBe(`ci-receipt-v1-unit-ts-pillars_alpha-${first.digest}`);
    expect(key(root, 'app', betaApp)).not.toBe(
      key(root, 'unit-ts', { dir: 'pillars/beta', pkg: '@pops/beta' })
    );
  });

  it.each([
    ['a transitive dependency source', 'libs/types/src/index.ts'],
    ['the unit source', 'pillars/alpha/src/index.ts'],
    ['the lockfile', 'pnpm-lock.yaml'],
    ['the CI toolchain pin', 'mise.ci.toml'],
    ['the root toolchain pin', 'mise.toml'],
    ["the check's own workflow", '.github/workflows/unit-quality.yml'],
    ['the shared setup action', '.github/actions/setup-mise/action.yml'],
    ['the receipt tool', 'scripts/ci/ci-receipts.mjs'],
    ["the receipt tool's imports", 'scripts/ci/receipt-helper.mjs'],
    ['a root script the unit invokes', 'scripts/require-built-graph.mjs'],
    ["that script's imports", 'scripts/graph-helper.mjs'],
    ['a tracked generated file', 'pillars/alpha/src/tracked.gen.ts'],
    ['an ignored generated file', 'pillars/alpha/generated/client.gen.ts'],
  ])('changes when %s changes', (_label, file) => {
    const root = workspace();
    const before = key(root, 'unit-ts', alpha);
    write(root, file, `${readFileSync(join(root, file), 'utf8')}// changed\n`);
    expect(key(root, 'unit-ts', alpha)).not.toBe(before);
  });

  it.each([
    ['an unrelated pillar', 'pillars/beta/src/index.ts'],
    ['another lane workflow', '.github/workflows/app-quality.yml'],
    ['an unreferenced root script', 'scripts/unrelated.mjs'],
    ['the Cargo lockfile', 'Cargo.lock'],
  ])('ignores %s', (_label, file) => {
    const root = workspace();
    const before = key(root, 'unit-ts', alpha);
    write(root, file, `${readFileSync(join(root, file), 'utf8')}// changed\n`);
    expect(key(root, 'unit-ts', alpha)).toBe(before);
  });

  it('ignores checkout timestamps, including on committed env examples', () => {
    const root = workspace();
    const before = key(root, 'unit-ts', alpha);
    const later = new Date(Date.now() + 60_000);
    for (const file of [
      'pillars/alpha/.env.example',
      'pillars/alpha/src/index.ts',
      'pnpm-lock.yaml',
    ])
      utimesSync(join(root, file), later, later);
    expect(key(root, 'unit-ts', alpha)).toBe(before);
    write(root, 'pillars/alpha/.env.example', 'ALPHA_URL=http://localhost\n');
    expect(key(root, 'unit-ts', alpha)).not.toBe(before);
  });

  it('counts untracked source and a deleted tracked file', () => {
    const root = workspace();
    const before = key(root, 'unit-ts', alpha);
    write(root, 'pillars/alpha/src/new.ts', 'export {};\n');
    const withNew = key(root, 'unit-ts', alpha);
    expect(withNew).not.toBe(before);
    rmSync(join(root, 'pillars/alpha/src/index.ts'));
    expect(key(root, 'unit-ts', alpha)).not.toBe(withNew);
  });

  it('follows a generator input outside the unit closure', () => {
    const root = workspace();
    expect(receiptInputs(root, 'app', betaApp)).toContain(
      'pillars/alpha/openapi/alpha.openapi.json'
    );
    const before = key(root, 'app', betaApp);
    write(root, 'pillars/alpha/openapi/alpha.openapi.json', '{"openapi":"3.1.1"}\n');
    expect(key(root, 'app', betaApp)).not.toBe(before);
  });

  it('keys only behaviour-relevant environment, by hash', () => {
    const root = workspace();
    const before = key(root, 'unit-ts', alpha);
    expect(key(root, 'unit-ts', alpha, { ...environment, GITHUB_RUN_ID: '42', SECRET: 'x' })).toBe(
      before
    );
    expect(key(root, 'unit-ts', alpha, { ...environment, MISE_ENV: 'dev' })).not.toBe(before);
    expect(key(root, 'unit-ts', alpha, { ...environment, ImageOS: 'ubuntu26' })).not.toBe(before);
  });

  it('keys Rust units on the Cargo workspace, not the pnpm one', () => {
    const root = workspace();
    const before = key(root, 'unit-rust', contacts);
    write(root, 'pnpm-lock.yaml', "lockfileVersion: '9.1'\n");
    expect(key(root, 'unit-rust', contacts)).toBe(before);
    write(root, 'libs/pops-ai/src/lib.rs', 'pub fn changed() {}\n');
    const afterMember = key(root, 'unit-rust', contacts);
    expect(afterMember).not.toBe(before);
    write(root, 'Cargo.lock', 'version = 4\n# changed\n');
    expect(key(root, 'unit-rust', contacts)).not.toBe(afterMember);
  });

  it('refuses a unit outside the workspace', () => {
    const root = workspace();
    expect(() => key(root, 'unit-ts', { dir: 'pillars/missing', pkg: '@pops/missing' })).toThrow(
      'not a workspace package'
    );
    expect(() => key(root, 'unit-rust', { dir: 'pillars/alpha', pkg: 'alpha' })).toThrow(
      'not a Cargo workspace member'
    );
  });
});

describe('reuse policy', () => {
  it.each([
    [{ noCacheInput: '', labels: '[]' }, true],
    [{ noCacheInput: 'false', labels: '["area:ci"]' }, true],
    [{ noCacheInput: undefined, labels: undefined }, true],
    [{ noCacheInput: '', labels: 'null' }, true],
    [{ noCacheInput: 'true', labels: '[]' }, false],
    [{ noCacheInput: '', labels: '["no-ci-cache"]' }, false],
    [{ noCacheInput: '', labels: '{' }, false],
    [{ noCacheInput: '', labels: '{"no-ci-cache":true}' }, false],
  ])('%j reuses: %s', (options, reuse) => {
    expect(reusePolicy(options).reuse).toBe(reuse);
  });
});

const repositoryId = 7;
const prContext = { repositoryId, event: 'pull_request', headRef: 'feat/x' };

function run(overrides: Partial<Parameters<typeof trustedProducer>[0]> = {}) {
  return {
    id: 100,
    event: 'push',
    head_branch: 'main',
    head_sha: 'abc',
    path: '.github/workflows/unit-quality.yml',
    html_url: 'https://github.com/o/r/actions/runs/100',
    repository: { id: repositoryId },
    head_repository: { id: repositoryId },
    ...overrides,
  };
}

describe('receipt trust', () => {
  it.each([
    ['a push to main', run(), true],
    ['a push to an integration branch', run({ head_branch: 'integration/ci' }), true],
    ['a dispatch on main', run({ event: 'workflow_dispatch' }), true],
    [
      'an earlier run of this pull request',
      run({ event: 'pull_request', head_branch: 'feat/x' }),
      true,
    ],
    ['a promotion run', run({ path: '.github/workflows/promotion-quality.yml' }), true],
    ['a push to a feature branch', run({ head_branch: 'feat/x' }), false],
    ['another pull request', run({ event: 'pull_request', head_branch: 'feat/y' }), false],
    ['a fork', run({ head_repository: { id: 8 } }), false],
    ['another repository', run({ repository: { id: 8 } }), false],
    ['another workflow', run({ path: '.github/workflows/app-quality.yml' }), false],
    ['a merge group', run({ event: 'merge_group' }), false],
    ['a scheduled run', run({ event: 'schedule' }), false],
  ])('%s: %s', (_label, producer, trusted) => {
    expect(trustedProducer(producer, prContext, 'unit-ts')).toBe(trusted);
  });

  it('never trusts pull request runs for push-event consumers', () => {
    const producer = run({ event: 'pull_request', head_branch: 'main' });
    expect(trustedProducer(producer, { repositoryId, event: 'push', headRef: '' }, 'unit-ts')).toBe(
      false
    );
  });

  const artifact = (id: number, runId: number, headRepository = repositoryId, expired = false) => ({
    id,
    expired,
    workflow_run: { id: runId, repository_id: repositoryId, head_repository_id: headRepository },
  });

  it('reuses the newest trusted receipt and skips untrusted ones', async () => {
    const runs = new Map([
      [1, run({ id: 1 })],
      [2, run({ id: 2, event: 'pull_request', head_branch: 'feat/y' })],
    ]);
    const looked: number[] = [];
    const found = await findReceipt({
      name: 'n',
      lane: 'unit-ts',
      context: prContext,
      listArtifacts: async () => [
        artifact(10, 1),
        artifact(20, 2),
        artifact(30, 3, 8),
        artifact(40, 4, repositoryId, true),
      ],
      getRun: async (id) => {
        looked.push(id);
        const found = runs.get(id);
        if (!found) throw new Error(`unexpected run ${id}`);
        return found;
      },
    });
    expect(found.run?.id).toBe(1);
    expect(looked).toEqual([2, 1]);
  });

  it.each([
    ['no artifact exists', async () => [], async () => run(), 'no receipt for these inputs'],
    [
      'only untrusted artifacts exist',
      async () => [artifact(1, 1)],
      async () => run({ head_branch: 'feat/z' }),
      'no receipt from a trusted run',
    ],
    [
      'the artifact lookup fails',
      async () => {
        throw new Error('403');
      },
      async () => run(),
      'receipt lookup failed: 403',
    ],
    [
      'the run lookup fails',
      async () => [artifact(1, 1)],
      async () => {
        throw new Error('rate limited');
      },
      'producing run lookup failed: rate limited',
    ],
  ])('runs every check when %s', async (_label, listArtifacts, getRun, reason) => {
    const found = await findReceipt({
      name: 'n',
      lane: 'unit-ts',
      context: prContext,
      listArtifacts,
      getRun,
    });
    expect(found).toEqual({ run: null, reason });
  });
});

function workflow(name: string): Record<string, unknown> {
  const path = join(repoRoot, '.github/workflows', name);
  const parsed = parseYaml(readFileSync(path, 'utf8'), path);
  if (!isMapping(parsed)) throw new Error(`${name} is not a mapping`);
  return parsed;
}

describe('receipt wiring', () => {
  it('is confined to the deterministic per-unit lanes', () => {
    const users = readdirSync(join(repoRoot, '.github/workflows'))
      .filter(
        (file) =>
          file.endsWith('.yml') &&
          readFileSync(join(repoRoot, '.github/workflows', file), 'utf8').includes(
            'node scripts/ci/ci-receipts.mjs'
          )
      )
      .toSorted();
    expect(users).toEqual(['app-quality.yml', 'unit-quality.yml']);
    expect([...new Set(Object.values(LANES).map((lane) => lane.workflow))].toSorted()).toEqual([
      '.github/workflows/app-quality.yml',
      '.github/workflows/unit-quality.yml',
    ]);
  });

  it.each([
    ['unit-quality.yml', 'ts', 'unit-ts'],
    ['unit-quality.yml', 'rust', 'unit-rust'],
    ['app-quality.yml', 'app', 'app'],
  ])('%s %s guards every check behind the receipt and records success', (file, jobName, lane) => {
    const jobs = workflow(file).jobs;
    const job = isMapping(jobs) ? jobs[jobName] : undefined;
    const steps = isMapping(job) && Array.isArray(job.steps) ? job.steps.filter(isMapping) : [];
    const index = steps.findIndex((step) => step.id === 'receipt');
    expect(index).toBeGreaterThan(0);
    expect(String(steps[index]?.run)).toContain(`--lane ${lane} `);
    const guarded = steps.slice(index + 1);
    expect(guarded.length).toBeGreaterThan(2);
    for (const step of guarded) expect(step.if).toBe("steps.receipt.outputs.reuse != 'true'");
    const record = guarded.at(-1);
    expect(record?.uses).toMatch(/^actions\/upload-artifact@/u);
    expect(isMapping(record?.with) && record.with.name).toBe('${{ steps.receipt.outputs.name }}');
  });

  it('resolves a key and declines reuse when the escape hatch is set', { timeout: 30_000 }, () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), 'ci-receipts-'));
    roots.push(outputDirectory);
    const output = join(outputDirectory, 'output');
    const stdout = execFileSync(
      process.execPath,
      [
        'scripts/ci/ci-receipts.mjs',
        'resolve',
        '--lane',
        'unit-ts',
        '--dir',
        'libs/types',
        '--pkg',
        '@pops/types',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_OUTPUT: output, NO_CI_CACHE: 'true' },
        timeout: 20_000,
      }
    );
    expect(stdout).toContain('Receipt reuse disabled: the no-ci-cache input is set.');
    const lines = readFileSync(output, 'utf8');
    expect(lines).toMatch(/^name=ci-receipt-v1-unit-ts-libs_types-[0-9a-f]{64}$/mu);
    expect(lines).toContain('reuse=false');
    const path = /^path=(.+)$/mu.exec(lines)?.[1] ?? '';
    const receipt: unknown = JSON.parse(readFileSync(join(repoRoot, path), 'utf8'));
    expect(receipt).toMatchObject({
      version: 1,
      lane: 'unit-ts',
      unit: { dir: 'libs/types', pkg: '@pops/types' },
    });
    rmSync(join(repoRoot, path));
  });
});
