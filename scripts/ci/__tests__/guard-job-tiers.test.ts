/**
 * The guard-job tier invariant (ADR-045, tier amendment).
 *
 * Guard jobs come in two tiers. A **Tier A** job runs its guards straight after
 * `actions/checkout` with no `pnpm install`, so the gate answers in seconds and
 * cannot be broken by a dependency problem it exists to be independent of. A
 * **Tier B** job installs the workspace first, because its guards read YAML or
 * TOML through a real parser.
 *
 * The split only holds while somebody can say which job is which. Nobody can,
 * by reading — the tier of a job is a property of the transitive import closure
 * of every script it runs, and one `import { load } from 'js-yaml'` three files
 * deep moves it. Left to review, the failure is a `MODULE_NOT_FOUND` inside a
 * REQUIRED check: not a red build on the PR that caused it, a red build on
 * every PR afterwards.
 *
 * So the tier is derived here, from the workflows and the import graph, rather
 * than declared anywhere.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isMapping, parseYaml, scalarText, walkMappings } from '../config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');

/** A `run:` step that puts `node_modules` on disk for the steps after it. */
const INSTALLS = /\bpnpm\s+(?:install|i)\b/u;

/** `node path/to/guard.mjs` inside a `run:` block, however many per block. */
const NODE_INVOCATION = /\bnode\s+(scripts\/[\w./-]+\.mjs)/gu;

interface GuardJob {
  workflow: string;
  job: string;
  installs: boolean;
  scripts: string[];
}

function workflowFiles(): string[] {
  return readdirSync(workflowsDir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .toSorted((a, b) => a.localeCompare(b));
}

/**
 * Every job in every workflow that runs at least one `node scripts/….mjs`,
 * with whether an install precedes its steps.
 *
 * `installs` is per JOB rather than per step: GitHub runs a job's steps in
 * order in one workspace, and every install in this repo sits above the guards
 * it serves. A job that installs after its guards would be a different bug, and
 * one no `node_modules`-less run could hide.
 */
function guardJobs(): GuardJob[] {
  const jobs: GuardJob[] = [];
  for (const file of workflowFiles()) {
    const doc = parseYaml(readFileSync(join(workflowsDir, file), 'utf8'), file);
    if (!isMapping(doc) || !isMapping(doc.jobs)) continue;
    for (const [name, job] of Object.entries(doc.jobs)) {
      if (!isMapping(job) || !Array.isArray(job.steps)) continue;
      let installs = false;
      const scripts = new Set<string>();
      for (const entry of walkMappings(job.steps)) {
        if (entry.key !== 'run') continue;
        const run = scalarText(entry.value);
        if (run === undefined) continue;
        if (INSTALLS.test(run)) installs = true;
        for (const match of run.matchAll(NODE_INVOCATION)) scripts.add(match[1]);
      }
      if (scripts.size > 0) jobs.push({ workflow: file, job: name, installs, scripts: [...scripts] });
    }
  }
  return jobs;
}

/**
 * A static ESM import, anchored to the start of its line.
 *
 * `import-scan.mjs` is not used here: it is deliberately permissive so it can
 * catch a pillar reach-behind anywhere in a file, and these guards embed import
 * STATEMENTS inside self-test fixture strings (`"// import { m } from
 * '@pops/app-beta';"`). Counting one of those as a real dependency would
 * declare a healthy Tier A job broken, and the pressure would then be to relax
 * the rule rather than fix the job. Every real import in `scripts/**` begins
 * its own line; `importFloor` below fails if that ever stops being true.
 */
const IMPORT_LINE = /^[ \t]*(?:import|export)\b[^'"\n]*?['"]([^'"\n]+)['"]/gmu;

/**
 * Every third-party module specifier reachable from `entry` by following
 * relative imports. Node builtins do not count — they are on disk before the
 * checkout is.
 */
function thirdPartyClosure(entry: string): string[] {
  const seen = new Set<string>();
  const bare = new Set<string>();
  const queue = [resolve(repoRoot, entry)];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_LINE)) {
      const specifier = match[1];
      if (specifier.startsWith('node:') || isBuiltin(specifier)) continue;
      if (specifier.startsWith('.')) {
        queue.push(resolve(dirname(file), specifier));
        continue;
      }
      bare.add(specifier);
    }
  }
  return [...bare].toSorted((a, b) => a.localeCompare(b));
}

const jobs = guardJobs();
const tierA = jobs.filter((j) => !j.installs);
const tierB = jobs.filter((j) => j.installs);

describe('guard-job discovery', () => {
  // A derived invariant is only as good as its discovery: parse the workflows
  // wrong and every assertion below passes over an empty set.
  it('finds guard invocations across several workflows', () => {
    expect(new Set(jobs.map((j) => j.workflow)).size).toBeGreaterThanOrEqual(3);
    expect(jobs.length).toBeGreaterThanOrEqual(8);
  });

  it('finds jobs in both tiers', () => {
    expect(tierA.length).toBeGreaterThan(0);
    expect(tierB.length).toBeGreaterThan(0);
  });

  it('resolves every invoked script to a file on disk', () => {
    for (const { workflow, job, scripts } of jobs) {
      for (const script of scripts) {
        expect(existsSync(join(repoRoot, script)), `${workflow} ${job} runs ${script}`).toBe(true);
      }
    }
  });

  it('reads the guards it is meant to be about', () => {
    const all = new Set(jobs.flatMap((j) => j.scripts));
    expect(all).toContain('scripts/ci/check-node-pin.mjs');
    expect(all).toContain('scripts/ci/smoke-image.mjs');
    expect(all).toContain('scripts/check-bundle-map-coverage.mjs');
  });

  // The import floor. A closure walker that has stopped seeing imports reports
  // every job as dependency-free, which is the Tier A assertion passing for the
  // one reason it must never pass.
  it('still sees the imports it is built to find, direct and transitive', () => {
    expect(thirdPartyClosure('scripts/ci/smoke-image.mjs')).toContain('js-yaml');
    expect(thirdPartyClosure('scripts/ci/check-homelab-service-isolation.mjs')).toContain(
      'js-yaml'
    );
    // Two hops: check-cargo-deps -> ../ci/config-parse.mjs -> smol-toml.
    expect(thirdPartyClosure('scripts/extractability/check-cargo-deps.mjs')).toContain(
      'smol-toml'
    );
  });

  it('does not mistake an import statement inside a fixture string for a dependency', () => {
    // scripts/check-bundle-map-coverage.mjs self-tests against fixture source
    // that contains `import … from '@pops/app-beta'`. It is a string, not an
    // edge, and reading it as one would misfile a healthy Tier A job.
    expect(thirdPartyClosure('scripts/check-bundle-map-coverage.mjs')).toEqual([]);
  });
});

describe('Tier A — an install-free job may not reach a third-party import', () => {
  it.each(tierA.map((j) => [`${j.workflow} → ${j.job}`, j] as const))('%s', (_label, job) => {
    for (const script of job.scripts) {
      const bare = thirdPartyClosure(script);
      expect(
        bare,
        `${job.workflow} job "${job.job}" runs ${script} with no \`pnpm install\`, but that ` +
          `script's import closure reaches ${bare.join(', ')}. There is no node_modules on ` +
          'disk when it executes, so this is a MODULE_NOT_FOUND inside a required check — ' +
          'and not only on the PR that introduced it. Either drop the dependency or move ' +
          'the job to Tier B by adding pnpm/action-setup + `pnpm install --frozen-lockfile` ' +
          '(see docs/architecture/adr-045-guards-must-prove-they-report.md).'
      ).toEqual([]);
    }
  });
});

describe('Tier B — a job whose guards need a parser keeps its install', () => {
  // Stated as an explicit roster rather than derived, so DELETING the install
  // from one of these jobs fails here instead of quietly demoting it. The
  // derived half above cannot see that: a job with no install and no
  // third-party import is a legitimate Tier A job.
  const REQUIRED_INSTALLS: ReadonlyArray<readonly [string, string]> = [
    ['agent-review.yml', 'agent-review'],
    ['rust-quality.yml', 'quality'],
    ['docker-build.yml', 'docker-build'],
  ];

  it.each(REQUIRED_INSTALLS)('%s → %s installs the workspace', (workflow, job) => {
    const found = jobs.find((j) => j.workflow === workflow && j.job === job);
    expect(found, `${workflow} has no job "${job}" running a guard`).toBeDefined();
    expect(
      found?.installs,
      `${workflow} job "${job}" runs a guard that parses YAML or TOML and must keep its ` +
        '`pnpm install --frozen-lockfile` step.'
    ).toBe(true);
  });

  it('each of those jobs really does reach a parser', () => {
    for (const [workflow, job] of REQUIRED_INSTALLS) {
      const found = jobs.find((j) => j.workflow === workflow && j.job === job);
      const bare = (found?.scripts ?? []).flatMap((s) => thirdPartyClosure(s));
      expect(
        bare,
        `${workflow} job "${job}" is on the Tier B roster but none of its guards imports ` +
          'anything from node_modules. Either it belongs in Tier A now, or the roster is stale.'
      ).not.toEqual([]);
    }
  });
});

describe('the parser module is only reachable from Tier B', () => {
  it('is imported by at least one guard, and by no Tier A guard', () => {
    const importers = jobs
      .flatMap((j) => j.scripts.map((s) => ({ job: j, script: s })))
      .filter(({ script }) => thirdPartyClosure(script).length > 0);
    expect(importers.length).toBeGreaterThan(0);
    expect(importers.filter(({ job }) => !job.installs).map(({ job, script }) =>
      `${job.workflow}:${job.job}:${script}`
    )).toEqual([]);
  });

  it('config-parse.mjs is not itself referenced by a workflow as a guard', () => {
    // It is a library, not a check. A workflow running it directly would report
    // nothing and pass, which is the shape ADR-045 exists to end.
    const all = new Set(jobs.flatMap((j) => j.scripts));
    expect(all).not.toContain(relative(repoRoot, join(here, '..', 'config-parse.mjs')));
  });
});
