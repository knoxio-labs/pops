/**
 * `resolve-report-base.mjs` and the wiring that makes it load-bearing.
 *
 * The script owns its own degenerate cases in `--self-test` (POPS-2166): a
 * fixture git repo for each of `pull_request`, `merge_group`, and `push`,
 * with the resolved base pinned against a commit captured independently of
 * `resolveBase` itself — see the `mainTip` capture in the fixture there. What
 * that self-test cannot see is whether `quality.yml`'s `contract-consumers`
 * job still calls this script for its REAL base computation, or whether a
 * future edit reintroduces an inline `git merge-base` recipe that drifts from
 * what the self-test proves. That is the same shape POPS-2181 found in
 * `report-contract-consumers.mjs`'s own self-test: a check built from a copy
 * of the logic it is meant to verify cannot catch that copy going stale. So
 * this file also asserts the job's `run:` step, not just the module.
 *
 * @see docs/architecture/adr-045-guards-must-prove-they-report.md
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ConfigParseError,
  isMapping,
  parseYaml,
  scalarText,
  walkMappings,
} from '../config-parse.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const helper = join(repoRoot, 'scripts', 'ci', 'resolve-report-base.mjs');
const workflowPath = join(repoRoot, '.github', 'workflows', 'quality.yml');

function contractConsumersJob(): Record<string, unknown> {
  const source = readFileSync(workflowPath, 'utf8');
  const doc = parseYaml(source, 'quality.yml');
  if (!isMapping(doc) || !isMapping(doc.jobs)) {
    throw new ConfigParseError('quality.yml', 'no `jobs:` mapping');
  }
  const job = doc.jobs['contract-consumers'];
  if (!isMapping(job)) throw new ConfigParseError('quality.yml', 'no `contract-consumers` job');
  return job;
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

describe('the helper proves itself', () => {
  it('passes its own --self-test', () => {
    const output = execFileSync(process.execPath, [helper, '--self-test'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(output).toMatch(/self-test OK/u);
    expect(output).toMatch(/merge_group base \(queued diff/u);
  });
});

describe('quality.yml’s contract-consumers job', () => {
  const job = contractConsumersJob();
  const script = runScriptOf(job);

  it('self-tests this helper before using it', () => {
    expect(script).toMatch(/node scripts\/ci\/resolve-report-base\.mjs --self-test/u);
  });

  it('computes its real base by calling this helper, not an inline git recipe', () => {
    expect(script).toMatch(/node scripts\/ci\/resolve-report-base\.mjs --ref "\$BASE_REF"/u);
    // The trap this guards against: a future edit restoring
    // `git merge-base "origin/..." HEAD` inline would still pass the helper's
    // own self-test (nothing calls the helper to notice), and the two would be
    // free to drift silently. There must be exactly one place that computes
    // this base.
    expect(script).not.toMatch(/git merge-base/u);
  });

  it('resolves BASE_REF the same way agent-review.yml resolves its own base ref, plus a push fallback', () => {
    const steps = Array.isArray(job.steps) ? job.steps : [];
    const step = steps.find(
      (s): s is Record<string, unknown> =>
        isMapping(s) && s.name === 'Name the vendored consumers this change obliges'
    );
    expect(step, 'expected to find the step by name').toBeDefined();
    const env = step?.env;
    expect(isMapping(env) ? env.BASE_REF : undefined).toBe(
      "${{ github.base_ref || github.event.merge_group.base_ref || 'main' }}"
    );
  });
});
