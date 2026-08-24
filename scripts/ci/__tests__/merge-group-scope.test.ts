/**
 * The merge-queue scoping helper, and the wiring that makes it load-bearing.
 *
 * `scripts/ci/merge-group-scope.mjs` owns its own degenerate cases in
 * `--self-test`, which the first case here runs for real. What it cannot see is
 * the half of the mechanism that lives in YAML: a `scope` job wired to the
 * wrong workflow file, or an expensive job whose condition reads `selected`
 * from a job it does not `need`, still passes every unit test and still skips a
 * macOS compile it should have run. That is the failure this file is for, and
 * it is the same shape ADR-045 is about — the mistake is invisible because the
 * result of it is a green check.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { embeddedScript } from '../check-ci-gate-wiring.mjs';
import {
  ConfigParseError,
  isMapping,
  parseYaml,
  scalarText,
  walkMappings,
} from '../config-parse.mjs';
import { globToRegExp, pullRequestPaths, ScopeError } from '../merge-group-scope.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');
const helper = join(repoRoot, 'scripts', 'ci', 'merge-group-scope.mjs');

/** Every workflow whose expensive jobs are scoped inside the merge-queue lane. */
const SCOPED_WORKFLOWS = [
  { file: 'ios-quality.yml', expensiveJobs: ['quality'] },
  { file: 'docker-build.yml', expensiveJobs: ['discover', 'compose-validate'] },
] as const;

/** Only a status check function breaks an inherited skip — see job-skip-inheritance.test.ts. */
const BREAKS_INHERITED_SKIP = /(?:^|[^\w.])(?:always\(\s*\)|!\s*cancelled\(\s*\))/u;

function workflowSource(file: string): string {
  return readFileSync(join(workflowsDir, file), 'utf8');
}

function jobsOf(file: string): Map<string, Record<string, unknown>> {
  const doc = parseYaml(workflowSource(file), file);
  if (!isMapping(doc) || !isMapping(doc.jobs))
    throw new ConfigParseError(file, 'no `jobs:` mapping');
  const jobs = new Map<string, Record<string, unknown>>();
  for (const [name, job] of Object.entries(doc.jobs)) {
    if (!isMapping(job)) throw new ConfigParseError(file, `job "${name}" is not a mapping`);
    jobs.set(name, job);
  }
  return jobs;
}

function triggersOf(file: string): Record<string, unknown> {
  const doc = parseYaml(workflowSource(file), file);
  if (!isMapping(doc) || !isMapping(doc.on)) throw new ConfigParseError(file, 'no `on:` mapping');
  return doc.on;
}

/** Every `run:` scalar in a job, concatenated. */
function runScriptOf(job: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const entry of walkMappings(job.steps)) {
    if (entry.key !== 'run') continue;
    const run = scalarText(entry.value);
    if (run !== undefined) lines.push(run);
  }
  return lines.join('\n');
}

function needsOf(job: Record<string, unknown> | undefined): string[] {
  const value = job?.needs;
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function stepsOf(job: Record<string, unknown> | undefined): Record<string, unknown>[] {
  if (!Array.isArray(job?.steps)) return [];
  return job.steps.filter(isMapping);
}

describe('the helper proves itself', () => {
  // The self-test's 19 cases each build and diff a throwaway git repository, so
  // this one call is ~40 subprocess spawns and lands either side of Vitest's 5s
  // default depending on what else the machine is doing — and it sits in the
  // pre-push hook, where a bad draw blocks every push. Match the outer test
  // budget to the inner subprocess cap so the outer one never cuts off first.
  const SELF_TEST_TIMEOUT_MS = 120_000;

  it(
    'passes its own --self-test',
    () => {
      // The same invocation the `scope` jobs run before they answer. Asserted
      // here as well so a self-test that has stopped proving anything fails in
      // `Quality`'s Scripts tests job on the PR, not first inside a merge queue.
      const output = execFileSync(process.execPath, [helper, '--self-test'], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: SELF_TEST_TIMEOUT_MS,
      });
      expect(output).toMatch(/self-test OK/u);
      expect(output).toMatch(/deselects a non-touching one/u);
    },
    SELF_TEST_TIMEOUT_MS
  );
});

describe('reading a workflow’s own pull_request.paths', () => {
  it.each(SCOPED_WORKFLOWS.map((w) => w.file))('%s declares a non-empty filter', (file) => {
    const paths = pullRequestPaths(workflowSource(file), file);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => typeof p === 'string' && p.length > 0)).toBe(true);
  });

  it('reads ios-quality.yml’s real filter, including the BFM it boots', () => {
    const paths = pullRequestPaths(workflowSource('ios-quality.yml'), 'ios-quality.yml');
    // Pinned rather than floored: this list is what the queue lane is scoped
    // by, so a silent narrowing of it silently narrows the queue lane too.
    expect(paths).toEqual([
      'clients/ios/**',
      'pillars/bfm/**',
      'scripts/ios-e2e/**',
      'pnpm-lock.yaml',
      '.github/workflows/ios-quality.yml',
      '.github/actions/**',
    ]);
  });

  it.each(SCOPED_WORKFLOWS.map((w) => w.file))(
    '%s scopes push and pull_request identically',
    (file) => {
      // The helper mirrors `pull_request.paths`. If the `push` filter said
      // something else, `main` and the queue would disagree about what a change
      // is relevant to, and only one of them would be the one this scopes.
      const on = triggersOf(file);
      const push = on.push;
      expect(isMapping(push)).toBe(true);
      const pushPaths = isMapping(push) ? push.paths : undefined;
      expect(pushPaths).toEqual(pullRequestPaths(workflowSource(file), file));
    }
  );

  it.each(SCOPED_WORKFLOWS.map((w) => w.file))('%s still triggers on merge_group', (file) => {
    // Dropping the trigger does not turn the check off, it makes the check
    // never report on the queue's head — and the entry sits until the queue's
    // check-response timeout evicts it. See .github/workflows/README.md.
    expect(Object.keys(triggersOf(file))).toContain('merge_group');
  });

  it('refuses a workflow with no paths filter rather than guessing', () => {
    const noFilter = 'name: X\n"on":\n  pull_request:\n    types: [opened]\njobs: {}\n';
    expect(() => pullRequestPaths(noFilter, '<fixture>')).toThrow(ScopeError);
  });

  it('refuses a workflow that does not parse rather than reading it as unfiltered', () => {
    expect(() =>
      pullRequestPaths('"on":\n  pull_request:\n    paths: [oops\n', '<fixture>')
    ).toThrow(ConfigParseError);
  });
});

describe('the scope job is wired to the workflow it scopes', () => {
  it.each(SCOPED_WORKFLOWS.map((w) => [w.file, w] as const))(
    '%s has a merge-group-only scope job that runs the helper against itself',
    (file, spec) => {
      const jobs = jobsOf(file);
      const scope = jobs.get('scope');
      expect(scope, `${file} defines no "scope" job`).toBeDefined();
      expect(scope?.if).toBe("github.event_name == 'merge_group'");
      expect(scope?.['runs-on']).toBe('ubuntu-latest');

      const run = runScriptOf(scope ?? {});
      expect(run, `${file}'s scope job does not self-test the helper`).toMatch(
        /merge-group-scope\.mjs --self-test/u
      );

      // The whole mechanism turns on this one argument. A copy-paste that left
      // the other workflow's path here would scope this lane by somebody
      // else's filter, and every test that only reads the helper would pass.
      const wired = /merge-group-scope\.mjs[\s\\]+--workflow[\s\\]+(\S+)/u.exec(run);
      expect(wired?.[1], `${file}'s scope job passes no --workflow`).toBeDefined();
      expect(wired?.[1]).toBe(`.github/workflows/${spec.file}`);

      expect(run, 'the base must come from the merge group payload').toMatch(
        /--base "\$BASE_SHA"/u
      );
      expect(run, 'the head must come from the merge group payload').toMatch(
        /--head "\$HEAD_SHA"/u
      );
    }
  );

  it.each(
    SCOPED_WORKFLOWS.flatMap((w) =>
      w.expensiveJobs.map((job) => [`${w.file} → ${job}`, w.file, job] as const)
    )
  )('%s is gated on the scope job’s answer', (_label, file, jobName) => {
    const job = jobsOf(file).get(jobName);
    expect(job, `${file} defines no "${jobName}" job`).toBeDefined();
    expect(needsOf(job), `${jobName} must depend on scope to read its output`).toContain('scope');

    const condition = typeof job?.if === 'string' ? job.if : '';
    // Three properties, and dropping any one of them is a silent bug:
    expect(condition, 'a plain expression inherits the skip from a skipped `scope`').toMatch(
      BREAKS_INHERITED_SKIP
    );
    expect(condition, 'must still run on every non-merge-group event').toMatch(
      /github\.event_name != 'merge_group'/u
    );
    expect(condition, 'must require an explicit true, so a failed scope job cannot select').toMatch(
      /needs\.scope\.outputs\.selected == 'true'/u
    );
  });

  it('runs Maestro only after an iOS change reaches main', () => {
    const steps = stepsOf(jobsOf('ios-quality.yml').get('quality'));
    const namedStep = (name: string) => steps.find((step) => step.name === name);

    expect(namedStep('Test + SwiftLint analyzer rules (one shared compile)')?.if).toBe(
      "github.event_name != 'merge_group'"
    );
    expect(namedStep('Compile + SwiftLint analyzer rules')?.if).toBe(
      "github.event_name == 'merge_group'"
    );

    for (const name of [
      'Expose bundled node-gyp on PATH',
      "Install the BFM's subgraph",
      'UI flow (Maestro, against a real BFM)',
    ]) {
      expect(namedStep(name)?.if).toBe("github.event_name == 'push'");
    }

    expect(namedStep('Release carries no BFM host')?.if).toBe("github.event_name != 'merge_group'");
  });
});

describe('one glob implementation, two homes', () => {
  // `ci-gate.yml`'s job has no checkout and so cannot import the helper; it
  // carries its own copy of the matcher for its PATH_FILTERS mirror. Two copies
  // that disagree would mean the gate and the queue lane read the same filter
  // differently, so they are held to the same answers here.
  type Captured = { globToRegExp: (glob: string) => RegExp };
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
    ...args: string[]
  ) => (github: unknown, context: unknown, core: unknown) => Promise<void>;

  async function gateMatcher(): Promise<Captured['globToRegExp']> {
    const body = embeddedScript(readFileSync(join(workflowsDir, 'ci-gate.yml'), 'utf8'));
    let captured: Captured | undefined;
    (globalThis as { __ciGateTestHook?: (fns: Captured) => void }).__ciGateTestHook = (fns) => {
      captured = fns;
    };
    try {
      await new AsyncFunction('github', 'context', 'core', body)(
        { rest: {}, paginate: () => Promise.reject(new Error('unreachable')) },
        { repo: { owner: 'x', repo: 'y' }, payload: {} },
        { info: () => {}, warning: () => {}, setFailed: () => {} }
      );
    } finally {
      delete (globalThis as { __ciGateTestHook?: unknown }).__ciGateTestHook;
    }
    if (!captured) throw new Error('ci-gate.yml did not call the test hook');
    return captured.globToRegExp;
  }

  /** Every pattern any gated workflow really declares, plus the paths that exercise them. */
  const CANDIDATE_PATHS = [
    'clients/ios/App/Main.swift',
    'clients/ios/Packages/Auth/README.md',
    'pillars/bfm/src/server.ts',
    'pillars/bfm/openapi/bfm.json',
    'pillars/finance/Dockerfile',
    'pillars/finance/app/src/main.tsx',
    'pillars/finance/src/index.ts',
    'Dockerfile',
    'infra/docker-compose.dev.yml',
    'infra/docker/base/Dockerfile',
    'libs/ui/src/index.ts',
    'pnpm-lock.yaml',
    'scripts/ios-e2e/run.mjs',
    'scripts/ci/smoke-image.mjs',
    'docs/architecture/adr-045-guards-must-prove-they-report.md',
    'README.md',
    '.github/workflows/ios-quality.yml',
  ] as const;

  function declaredPatterns(): string[] {
    const patterns = new Set<string>();
    for (const { file } of SCOPED_WORKFLOWS) {
      for (const pattern of pullRequestPaths(workflowSource(file), file)) patterns.add(pattern);
    }
    return [...patterns].toSorted((a, b) => a.localeCompare(b));
  }

  it('has patterns to compare (discovery floor)', () => {
    expect(declaredPatterns().length).toBeGreaterThanOrEqual(8);
  });

  it('agrees with ci-gate.yml’s embedded matcher on every declared pattern', async () => {
    const gate = await gateMatcher();
    const disagreements: string[] = [];
    for (const pattern of declaredPatterns()) {
      for (const path of CANDIDATE_PATHS) {
        const mine = globToRegExp(pattern).test(path);
        const theirs = gate(pattern).test(path);
        if (mine !== theirs)
          disagreements.push(`${pattern} vs ${path}: helper=${mine} gate=${theirs}`);
      }
    }
    expect(
      disagreements,
      'scripts/ci/merge-group-scope.mjs and ci-gate.yml disagree about what a path filter ' +
        'selects. They read the same declarations and must reach the same answer.'
    ).toEqual([]);
  });

  it('reports a glob shape it cannot model instead of matching it literally', () => {
    expect(() => globToRegExp('clients/ios/*.?')).toThrow(ScopeError);
    expect(() => globToRegExp('libs/[au]*/**')).toThrow(ScopeError);
    expect(() => globToRegExp('!docs/**')).toThrow(ScopeError);
  });

  it('reports a blank pattern, which would compile to a guaranteed non-match', () => {
    expect(() => globToRegExp('')).toThrow(ScopeError);
    expect(() => globToRegExp('  ')).toThrow(ScopeError);
  });

  it('no scoped workflow declares a shape the matcher would have to refuse', () => {
    // The check above only matters while it is hypothetical. This is the line
    // that keeps it that way — and it is the reason the refusal is safe to have.
    for (const pattern of declaredPatterns()) {
      expect(() => globToRegExp(pattern), `${pattern} is not matchable`).not.toThrow();
    }
  });
});
