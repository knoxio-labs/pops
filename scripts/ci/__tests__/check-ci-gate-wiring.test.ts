import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ALWAYS_RUNNING_GATED_WORKFLOW,
  checkCiGateWiring,
  findContinueOnErrorJobs,
  grantsChecksWrite,
  hasPullRequestPathFilter,
  matchKey,
  parseGatedArray,
  parseWorkflowName,
  parseWorkflowRunTriggers,
} from '../check-ci-gate-wiring.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');

const created: string[] = [];

/** A throwaway repo root holding a full copy of `.github/workflows`. */
function cloneWorkflows(): string {
  const root = mkdtempSync(join(tmpdir(), 'ci-gate-wiring-'));
  created.push(root);
  mkdirSync(join(root, '.github'), { recursive: true });
  cpSync(workflowsDir, join(root, '.github', 'workflows'), { recursive: true });
  return root;
}

function patch(root: string, file: string, edit: (source: string) => string): void {
  const path = join(root, '.github', 'workflows', file);
  writeFileSync(path, edit(readFileSync(path, 'utf8')));
}

afterEach(() => {
  while (created.length > 0) rmSync(created.pop() as string, { recursive: true, force: true });
});

/**
 * The line from `.github/workflows/unit-quality.yml` that motivated centralising
 * key matching — a real inline value with a real trailing comment.
 */
const REAL_INLINE_PATHS_LINE = '    paths: ["**"] # main rebuilds via the changed-set';

describe('matchKey — the one place end-of-line anchoring is allowed to be wrong', () => {
  it('matches a bare key and reports an empty inline value', () => {
    expect(matchKey('  pull_request:', 2, 'pull_request')).toEqual({
      key: 'pull_request',
      value: '',
    });
  });

  it('matches a key carrying an inline value', () => {
    expect(matchKey('  checks: write', 2, 'checks')).toEqual({ key: 'checks', value: 'write' });
  });

  it('matches a key whose value is followed by a comment', () => {
    expect(matchKey('  checks: write # publishes the verdict', 2, 'checks')).toEqual({
      key: 'checks',
      value: 'write',
    });
  });

  it('matches a bare key followed by a comment', () => {
    expect(matchKey('  pull_request: # every PR', 2, 'pull_request')).toEqual({
      key: 'pull_request',
      value: '',
    });
  });

  it('matches the real inline paths line from unit-quality.yml', () => {
    expect(matchKey(REAL_INLINE_PATHS_LINE, 4, 'paths')).toEqual({
      key: 'paths',
      value: '["**"]',
    });
  });

  it('respects the exact indent', () => {
    expect(matchKey('    checks: write', 2, 'checks')).toBeUndefined();
  });

  it('does not match a different key at the right indent', () => {
    expect(matchKey('  contents: read', 2, 'checks')).toBeUndefined();
  });

  it('does not treat a longer key as the one asked for', () => {
    expect(matchKey('    paths-ignore: ["docs/**"]', 4, 'paths')).toBeUndefined();
  });

  it('keeps a # that is part of the value rather than a comment', () => {
    expect(matchKey('  node: 24#5', 2, 'node')).toEqual({ key: 'node', value: '24#5' });
  });

  it('ignores a comment line', () => {
    expect(matchKey('  # pull_request: not a key', 2)).toBeUndefined();
  });
});

describe('grantsChecksWrite', () => {
  it('accepts the bare form', () => {
    expect(grantsChecksWrite('permissions:\n  checks: write\n')).toBe(true);
  });

  it('accepts a trailing comment', () => {
    expect(grantsChecksWrite('permissions:\n  checks: write # to publish\n')).toBe(true);
  });

  it('rejects read', () => {
    expect(grantsChecksWrite('permissions:\n  checks: read\n')).toBe(false);
  });
});

describe('parseWorkflowRunTriggers', () => {
  it('reads the workflow_run trigger sequence', () => {
    const source = [
      'on:',
      '  workflow_run:',
      '    workflows:',
      '      - "Unit Quality"',
      '      - "FE Quality"',
      '    types: [completed]',
    ].join('\n');
    expect(parseWorkflowRunTriggers(source)).toEqual(['Unit Quality', 'FE Quality']);
  });

  it('stops at the next key rather than swallowing it', () => {
    const source = [
      'on:',
      '  workflow_run:',
      '    workflows:',
      '      - "Quality"',
      '    types: [completed]',
      'permissions:',
      '  checks: write',
    ].join('\n');
    expect(parseWorkflowRunTriggers(source)).toEqual(['Quality']);
  });

  it('reads the list when the key or an entry carries a comment', () => {
    const source = [
      'on:',
      '  workflow_run:',
      '    workflows: # the gated set',
      '      - "Quality"',
      '      - "Docker Build" # slowest',
      '    types: [completed]',
    ].join('\n');
    expect(parseWorkflowRunTriggers(source)).toEqual(['Quality', 'Docker Build']);
  });

  it('returns nothing when there is no workflow_run trigger', () => {
    expect(parseWorkflowRunTriggers('on:\n  pull_request:\n')).toEqual([]);
  });
});

describe('parseGatedArray', () => {
  it('reads a multi-line array with a trailing comma', () => {
    expect(parseGatedArray('const gated = [\n  "Quality",\n  "FE Quality",\n];\n')).toEqual([
      'Quality',
      'FE Quality',
    ]);
  });

  it('reads a single-line array', () => {
    expect(parseGatedArray('const gated = ["Quality"];')).toEqual(['Quality']);
  });

  it('returns nothing when the array is absent', () => {
    expect(parseGatedArray('const other = ["Quality"];')).toEqual([]);
  });
});

describe('parseWorkflowName', () => {
  it('reads the top-level name', () => {
    expect(parseWorkflowName('name: CI Gate\n\non:\n  push:\n')).toBe('CI Gate');
  });

  it('ignores a nested step name', () => {
    expect(parseWorkflowName('name: Quality\njobs:\n  a:\n    steps:\n      - name: Lint\n')).toBe(
      'Quality'
    );
  });

  it('does not swallow a trailing comment into the name', () => {
    expect(parseWorkflowName('name: Quality # runs on every PR\n')).toBe('Quality');
  });
});

describe('hasPullRequestPathFilter', () => {
  it('detects paths under pull_request', () => {
    expect(hasPullRequestPathFilter('on:\n  pull_request:\n    paths:\n      - "a/**"\n')).toBe(
      true
    );
  });

  it('detects paths-ignore under pull_request', () => {
    expect(
      hasPullRequestPathFilter('on:\n  pull_request:\n    paths-ignore:\n      - "docs/**"\n')
    ).toBe(true);
  });

  it('detects the inline array form the repo already uses elsewhere', () => {
    expect(hasPullRequestPathFilter('on:\n  pull_request:\n    paths: ["**"]\n')).toBe(true);
  });

  it('detects an inline form carrying a trailing comment', () => {
    expect(
      hasPullRequestPathFilter('on:\n  pull_request:\n    paths: ["**"] # rebuilds everything\n')
    ).toBe(true);
  });

  it('detects an inline paths-ignore', () => {
    expect(hasPullRequestPathFilter('on:\n  pull_request:\n    paths-ignore: ["docs/**"]\n')).toBe(
      true
    );
  });

  it('detects the exact line unit-quality.yml uses', () => {
    expect(hasPullRequestPathFilter(`on:\n  pull_request:\n${REAL_INLINE_PATHS_LINE}\n`)).toBe(
      true
    );
  });

  it('still scans when the pull_request key itself carries a comment', () => {
    expect(
      hasPullRequestPathFilter('on:\n  pull_request: # every PR, deliberately\n    paths: ["**"]\n')
    ).toBe(true);
  });

  it('does not mistake another key that merely starts with "paths" for a filter', () => {
    expect(hasPullRequestPathFilter('on:\n  pull_request:\n    paths-filter-name: x\n')).toBe(
      false
    );
  });

  it('does not confuse a filter on a sibling trigger for one on pull_request', () => {
    expect(
      hasPullRequestPathFilter('on:\n  pull_request:\n  push:\n    paths:\n      - "a/**"\n')
    ).toBe(false);
  });

  it('is false for a bare pull_request trigger', () => {
    expect(hasPullRequestPathFilter('on:\n  pull_request:\n  push:\n    branches: [main]\n')).toBe(
      false
    );
  });
});

describe('findContinueOnErrorJobs', () => {
  it('names the job that opted out of the workflow conclusion', () => {
    const source = [
      'jobs:',
      '  lint:',
      '    runs-on: ubuntu-latest',
      '  flaky:',
      '    continue-on-error: true',
      '    runs-on: ubuntu-latest',
    ].join('\n');
    expect(findContinueOnErrorJobs(source)).toEqual(['flaky']);
  });

  it('ignores a step-level continue-on-error', () => {
    const source = ['jobs:', '  lint:', '    steps:', '      - continue-on-error: true'].join('\n');
    expect(findContinueOnErrorJobs(source)).toEqual([]);
  });

  it('sees an opt-out that carries a trailing comment', () => {
    const source = [
      'jobs:',
      '  flaky: # under investigation',
      '    continue-on-error: true # re-enable once the backend settles',
      '    runs-on: ubuntu-latest',
    ].join('\n');
    expect(findContinueOnErrorJobs(source)).toEqual(['flaky']);
  });

  it('does not treat continue-on-error: false as an opt-out', () => {
    expect(findContinueOnErrorJobs('jobs:\n  lint:\n    continue-on-error: false\n')).toEqual([]);
  });

  it('finds nothing in a workflow with no opt-outs', () => {
    expect(findContinueOnErrorJobs('jobs:\n  lint:\n    runs-on: ubuntu-latest\n')).toEqual([]);
  });
});

describe('the live repo', () => {
  it('has intact CI Gate wiring', () => {
    expect(checkCiGateWiring(repoRoot)).toEqual([]);
  });

  it('gates the one workflow that runs on every pull request', () => {
    const gate = readFileSync(join(workflowsDir, 'ci-gate.yml'), 'utf8');
    expect(parseGatedArray(gate)).toContain(ALWAYS_RUNNING_GATED_WORKFLOW);
  });

  it('publishes the verdict at the observed head SHA, not the implicit check run', () => {
    const gate = readFileSync(join(workflowsDir, 'ci-gate.yml'), 'utf8');
    expect(gate).toMatch(/checks\.create\(/u);
    expect(gate).toMatch(/head_sha:\s*headSha/u);
    expect(gate).toMatch(/^\s{2}checks:\s*write\s*$/mu);
  });

  it('names the created check run "CI Gate" — the context a ruleset would list', () => {
    const gate = readFileSync(join(workflowsDir, 'ci-gate.yml'), 'utf8');
    expect(gate).toMatch(/name:\s*"CI Gate"/u);
  });

  it('holds at in_progress while a gated workflow is still running', () => {
    const gate = readFileSync(join(workflowsDir, 'ci-gate.yml'), 'utf8');
    expect(gate).toMatch(/status:\s*settled\s*\?\s*"completed"\s*:\s*"in_progress"/u);
    expect(gate).not.toMatch(/status:\s*"completed"\s*,/u);
  });
});

describe('the guard catches each way the wiring goes inert', () => {
  it('flags a workflow that fires the gate but is not in `gated`', () => {
    const root = cloneWorkflows();
    patch(root, 'ci-gate.yml', (s) => s.replace('              "iOS Quality",\n', ''));
    expect(checkCiGateWiring(root).join('\n')).toContain(
      '"iOS Quality" fires ci-gate.yml but is missing from its `gated` array'
    );
  });

  it('flags a workflow in `gated` that never fires the gate', () => {
    const root = cloneWorkflows();
    patch(root, 'ci-gate.yml', (s) => s.replace('      - "Docker Build"\n', ''));
    expect(checkCiGateWiring(root).join('\n')).toContain(
      '"Docker Build" is in ci-gate.yml\'s `gated` array but not its workflow_run trigger list'
    );
  });

  it('flags a gated workflow whose display name no longer exists', () => {
    const root = cloneWorkflows();
    patch(root, 'rust-quality.yml', (s) => s.replace(/^name: .*$/mu, 'name: Cargo Quality'));
    expect(checkCiGateWiring(root).join('\n')).toContain(
      'ci-gate.yml references workflow "Rust Quality", which matches no `name:`'
    );
  });

  it('flags a gate that fell back to the implicit check run', () => {
    const root = cloneWorkflows();
    patch(root, 'ci-gate.yml', (s) => s.replace(/await github\.rest\.checks\.create\(/u, 'void ('));
    expect(checkCiGateWiring(root).join('\n')).toContain(
      'ci-gate.yml must POST its own check run at the observed head SHA'
    );
  });

  it('flags a gate that concludes green while siblings are still running', () => {
    const root = cloneWorkflows();
    patch(root, 'ci-gate.yml', (s) =>
      s.replace(/status: settled \? "completed" : "in_progress",/u, 'status: "completed",')
    );
    expect(checkCiGateWiring(root).join('\n')).toContain(
      'must publish `in_progress` while a gated workflow is still running'
    );
  });

  it('flags a gate that lost permission to publish', () => {
    const root = cloneWorkflows();
    patch(root, 'ci-gate.yml', (s) => s.replace(/^ {2}checks: write$/mu, '  checks: read'));
    expect(checkCiGateWiring(root).join('\n')).toContain('`permissions: checks: write`');
  });

  it('still accepts the permission when it carries a trailing comment', () => {
    const root = cloneWorkflows();
    patch(root, 'ci-gate.yml', (s) =>
      s.replace(/^ {2}checks: write$/mu, '  checks: write # publishes the verdict')
    );
    expect(checkCiGateWiring(root)).toEqual([]);
  });

  it('flags an advisory job declared with a trailing comment', () => {
    const root = cloneWorkflows();
    patch(root, 'quality.yml', (s) =>
      s.replace(
        /^ {2}extractability-baseline:$/mu,
        '  extractability-baseline:\n    continue-on-error: true # temporarily'
      )
    );
    expect(checkCiGateWiring(root).join('\n')).toContain(
      'job "extractability-baseline" sets `continue-on-error: true`'
    );
  });

  it('flags a path filter added to the always-running gated workflow', () => {
    const root = cloneWorkflows();
    patch(root, 'quality.yml', (s) =>
      s.replace(
        /^on:\n {2}pull_request:$/mu,
        'on:\n  pull_request:\n    paths-ignore:\n      - "docs/**"'
      )
    );
    expect(checkCiGateWiring(root).join('\n')).toContain(
      'added a path filter to its `pull_request` trigger'
    );
  });

  it('flags the inline form of that path filter too', () => {
    const root = cloneWorkflows();
    patch(root, 'quality.yml', (s) =>
      s.replace(
        /^on:\n {2}pull_request:$/mu,
        'on:\n  pull_request:\n    paths-ignore: ["docs/**"] # skip docs'
      )
    );
    expect(checkCiGateWiring(root).join('\n')).toContain(
      'added a path filter to its `pull_request` trigger'
    );
  });

  it('flags a job that made itself advisory inside a gated workflow', () => {
    const root = cloneWorkflows();
    patch(root, 'quality.yml', (s) =>
      s.replace(
        /^ {2}extractability-baseline:$/mu,
        '  extractability-baseline:\n    continue-on-error: true'
      )
    );
    expect(checkCiGateWiring(root).join('\n')).toContain(
      'job "extractability-baseline" sets `continue-on-error: true`'
    );
  });

  it('reports, rather than throws, when the always-running workflow is renamed away', () => {
    const root = cloneWorkflows();
    patch(root, 'quality.yml', (s) => s.replace(/^name: .*$/mu, 'name: Repo Quality'));
    expect(() => checkCiGateWiring(root)).not.toThrow();
    expect(checkCiGateWiring(root).join('\n')).toContain(
      'No workflow under .github/workflows is named "Quality"'
    );
  });

  it('flags dropping `Quality` from the gate entirely', () => {
    const root = cloneWorkflows();
    patch(root, 'ci-gate.yml', (s) =>
      s.replaceAll('      - "Quality"\n', '').replaceAll('              "Quality",\n', '')
    );
    expect(checkCiGateWiring(root).join('\n')).toContain(
      'must stay gated: it is the only gated workflow that runs on every pull request'
    );
  });

  it('passes on an unmutated copy, so the failures above are the mutations', () => {
    expect(checkCiGateWiring(cloneWorkflows())).toEqual([]);
  });
});
