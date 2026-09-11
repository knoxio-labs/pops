/**
 * `resolve-report-base.mjs` and the wiring that makes it load-bearing.
 *
 * The script owns its own degenerate cases in `--self-test` (POPS-2166): a
 * fixture git repo for each of `pull_request`, `merge_group` (in both the bare
 * and the `refs/heads/` spelling), and `push`, with the resolved base pinned
 * against a commit captured independently of `resolveBase` itself — see the
 * `mainTip` capture in the fixture there. What
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

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, inject, it } from 'vitest';

import {
  ConfigParseError,
  isMapping,
  parseYaml,
  scalarText,
  walkMappings,
} from '../config-parse.mjs';
import { GIT_LOCATION_VARS, gitEnv } from '../resolve-report-base.mjs';
import { passingProofStdout } from './real-tree-proofs.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
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
    const output = passingProofStdout(inject('realTreeProofs'), 'resolve-report-base:self-test');
    expect(output).toMatch(/self-test OK/u);
    // Both merge-group spellings, named separately: the bare `main` the
    // self-test always fed it, and the full `refs/heads/main` the merge-group
    // lane actually sends. Asserting only the first is how POPS-2166's second
    // bullet stayed green for months while production reported every leg.
    expect(output).toMatch(/merge_group base from both the bare name and the full/u);
    expect(output).toMatch(/refs\/heads\//u);
    expect(output).toMatch(/queued diff, neither empty nor everything/u);
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

describe('one git-location list (POPS-3426)', () => {
  it('strips every location variable, keeps everything else, and cannot be handed one back', () => {
    const leaked = Object.fromEntries(GIT_LOCATION_VARS.map((name) => [name, '/elsewhere']));
    const env = gitEnv({ ...leaked, GIT_SSH_COMMAND: 'ssh -i key' });

    for (const name of GIT_LOCATION_VARS) expect(env[name]).toBeUndefined();
    // Transport variables are deliberately not location variables: a fetch needs them.
    expect(env.GIT_SSH_COMMAND).toBe('ssh -i key');
  });

  it('names the nine variables a git hook exports for the repository being pushed', () => {
    // Pinned so a quiet removal from the list fails here, not first inside a hook.
    expect([...GIT_LOCATION_VARS].toSorted()).toEqual(
      [
        'GIT_ALTERNATE_OBJECT_DIRECTORIES',
        'GIT_COMMON_DIR',
        'GIT_DIR',
        'GIT_INDEX_FILE',
        'GIT_NAMESPACE',
        'GIT_OBJECT_DIRECTORY',
        'GIT_PREFIX',
        'GIT_QUARANTINE_PATH',
        'GIT_WORK_TREE',
      ].toSorted()
    );
  });

  it('has no private copy anywhere under scripts/', () => {
    // A copy is how this went wrong: a four-entry list in one suite forgot
    // GIT_COMMON_DIR. The most distinctive entry marks a hand-written list.
    const marker = `'${'GIT_QUARANTINE'}_PATH'`;
    const scriptsDir = join(repoRoot, 'scripts');
    const holders: string[] = [];
    let scanned = 0;
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(?:mjs|ts)$/u.test(entry.name)) {
          // This file pins the list above, so it names every entry on purpose.
          if (full === fileURLToPath(import.meta.url)) continue;
          scanned += 1;
          if (readFileSync(full, 'utf8').includes(marker))
            holders.push(full.slice(repoRoot.length + 1));
        }
      }
    };
    walk(scriptsDir);

    // Discovery floor: a scan that read nothing, or missed the real list,
    // would pass hardest at the moment it stopped seeing copies.
    expect(scanned).toBeGreaterThan(100);
    expect(holders).toEqual(['scripts/ci/resolve-report-base.mjs']);
  });
});
