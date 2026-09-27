import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { embeddedScript, parseGatedArray } from '../check-ci-gate-wiring.mjs';

const source = readFileSync(resolve('.github/workflows/ci-gate.yml'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<void>;
const script = embeddedScript(source);
const execute = new AsyncFunction(
  'github',
  'context',
  'core',
  'process',
  'observedCancellationOnly',
  script.replace(
    /const cancellationOnly = \[[^\]]*\];/u,
    'const cancellationOnly = observedCancellationOnly;'
  )
);

const association = { number: 7, base: { ref: 'main' } };
const pullRequest = {
  ...association,
  state: 'open',
  head: { sha: 'new-head', ref: 'feature', repo: { id: 4 } },
};
const run = {
  id: 20,
  name: 'Quality',
  display_title: 'Quality for pull_request into main',
  workflow_id: 3,
  head_sha: 'new-head',
  head_branch: 'feature',
  head_repository: { id: 4 },
  event: 'pull_request',
  status: 'completed',
  conclusion: 'success',
  run_number: 20,
  run_attempt: 1,
  pull_requests: [association],
};

type Run = typeof run;
type PullRequest = typeof pullRequest;

async function evaluate(
  options: {
    cancellationOnly?: string[];
    workflows?: { id: number; name: string }[];
    trigger?: Run;
    runs?: Run[];
    candidates?: Run[];
    action?: string;
    files?: string[];
    prs?: PullRequest[];
    failFiles?: boolean;
    cancelFails?: boolean;
    registered?: Run;
    associated?: PullRequest[];
  } = {}
) {
  const trigger = options.trigger ?? run;
  const prs = [...(options.prs ?? [pullRequest])];
  const create = vi.fn().mockResolvedValue({});
  const cancel = vi.fn().mockImplementation(() => {
    if (options.cancelFails) throw new Error('already completed');
    return Promise.resolve({});
  });
  const setFailed = vi.fn();
  const listFiles = Symbol('files');
  const listAssociated = Symbol('associated');
  const listRuns = Symbol('runs');
  const listWorkflows = Symbol('workflows');
  const listCandidates = Symbol('candidates');
  await execute(
    {
      rest: {
        repos: { listPullRequestsAssociatedWithCommit: listAssociated },
        pulls: {
          get: () => Promise.resolve({ data: prs.length > 1 ? prs.shift() : prs[0] }),
          listFiles,
        },
        actions: {
          listWorkflowRunsForRepo: listRuns,
          listRepoWorkflows: listWorkflows,
          listWorkflowRuns: listCandidates,
          getWorkflowRun: ({ run_id }: { run_id: number }) =>
            Promise.resolve({
              data:
                options.registered ??
                options.runs?.find((candidate) => candidate.id === run_id) ??
                trigger,
            }),
          cancelWorkflowRun: cancel,
        },
        checks: { create },
      },
      paginate: (endpoint: symbol) => {
        if (endpoint === listWorkflows)
          return Promise.resolve(
            options.workflows ??
              [...(options.runs ?? []), trigger].map((candidate) => ({
                id: candidate.workflow_id,
                name: candidate.name,
              }))
          );
        if (endpoint === listAssociated) return Promise.resolve(options.associated ?? []);
        if (endpoint === listFiles) {
          if (options.failFiles) throw new Error('unavailable');
          return Promise.resolve(
            (options.files ?? ['README.md']).map((filename) => ({ filename }))
          );
        }
        if (endpoint === listCandidates) return Promise.resolve(options.candidates ?? []);
        return Promise.resolve(options.runs ?? [trigger]);
      },
    },
    {
      repo: { owner: 'example', repo: 'project' },
      payload: { workflow_run: trigger, action: options.action ?? 'completed' },
      serverUrl: 'https://github.com',
      runId: 123,
    },
    { info: vi.fn(), warning: vi.fn(), setFailed },
    { env: { HEAD_SHA: trigger.head_sha } },
    options.cancellationOnly ?? parseGatedArray(script, 'cancellationOnly')
  );
  return { create, cancel, setFailed };
}

describe('CI Gate convergence', () => {
  it('identifies a workflow by its registered ID when GitHub puts the run title in name', async () => {
    const result = await evaluate({
      trigger: { ...run, name: 'Quality for pull_request into main' },
      workflows: [{ id: run.workflow_id, name: 'Quality' }],
    });
    expect(result.create).toHaveBeenCalledWith(expect.objectContaining({ conclusion: 'success' }));
  });

  it('cannot substitute a title that names a different registered workflow', async () => {
    const result = await evaluate({
      trigger: { ...run, name: 'Quality' },
      workflows: [{ id: run.workflow_id, name: 'Other Workflow' }],
    });
    expect(result.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });

  it('resolves fork PRs with empty run associations using source identity and the recorded base', async () => {
    const result = await evaluate({
      trigger: { ...run, pull_requests: [] },
      associated: [pullRequest],
    });
    expect(result.create).toHaveBeenCalledWith(expect.objectContaining({ conclusion: 'success' }));
  });

  it('rejects a fork run recorded for the old base after retargeting', async () => {
    const result = await evaluate({
      trigger: {
        ...run,
        pull_requests: [],
        display_title: 'Quality for pull_request into integration/work',
      },
      associated: [pullRequest],
    });
    expect(result.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });

  it('does not guess when fork identity is wrong or multiple matching PRs share its head', async () => {
    for (const associated of [
      [{ ...pullRequest, head: { ...pullRequest.head, repo: { id: 99 } } }],
      [pullRequest, { ...pullRequest, number: 8 }],
    ]) {
      const result = await evaluate({ trigger: { ...run, pull_requests: [] }, associated });
      expect(result.create).not.toHaveBeenCalled();
      expect(result.setFailed).toHaveBeenCalled();
    }
  });

  it('passes a docs-only PR after its unfiltered workflow completes', async () => {
    const result = await evaluate();
    expect(result.create).toHaveBeenCalledWith(
      expect.objectContaining({ head_sha: 'new-head', status: 'completed', conclusion: 'success' })
    );
  });

  it('waits for a missing workflow whose path filter matches', async () => {
    const result = await evaluate({ files: ['clients/ios/Sources/App.swift'] });
    expect(result.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
    expect(result.create.mock.calls[0]?.[0]).not.toHaveProperty('conclusion');
  });

  it('waits when files cannot be read or their API result is truncated', async () => {
    for (const options of [{ failFiles: true }, { files: Array<string>(3000).fill('README.md') }]) {
      const result = await evaluate(options);
      expect(result.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_progress' })
      );
    }
  });

  it('requires every workflow in a merge group even for a docs-only diff', async () => {
    const result = await evaluate({ trigger: { ...run, event: 'merge_group', pull_requests: [] } });
    expect(result.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });

  it.each(['cancelled', 'failure', 'timed_out', 'neutral', 'unknown', ''])(
    'fails closed for completed conclusion %s',
    async (conclusion) => {
      const result = await evaluate({ trigger: { ...run, conclusion } });
      expect(result.create).toHaveBeenCalledWith(
        expect.objectContaining({ conclusion: 'failure' })
      );
      expect(result.setFailed).toHaveBeenCalled();
    }
  );

  it('uses the newer attempt when a stale completion arrives', async () => {
    const result = await evaluate({
      trigger: { ...run, conclusion: 'failure' },
      runs: [{ ...run, run_attempt: 2 }],
    });
    expect(result.create).toHaveBeenCalledWith(expect.objectContaining({ conclusion: 'success' }));
  });

  it('uses a completion event when the run-list API still shows that attempt in progress', async () => {
    const result = await evaluate({ runs: [{ ...run, status: 'in_progress', conclusion: '' }] });
    expect(result.create).toHaveBeenCalledWith(expect.objectContaining({ conclusion: 'success' }));
  });

  it('holds the gate while a failed attempt is rerunning', async () => {
    const result = await evaluate({
      runs: [{ ...run, run_attempt: 2, status: 'in_progress', conclusion: '' }],
    });
    expect(result.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });

  it.each(['push', 'workflow_dispatch'])(
    'does not publish admission checks for %s runs',
    async (event) => {
      const result = await evaluate({ trigger: { ...run, event } });
      expect(result.create).not.toHaveBeenCalled();
    }
  );

  it('does not let push results mask a failing PR run', async () => {
    const result = await evaluate({
      trigger: { ...run, conclusion: 'failure' },
      runs: [{ ...run, event: 'push', run_number: 50 }],
    });
    expect(result.create).toHaveBeenCalledWith(expect.objectContaining({ conclusion: 'failure' }));
  });

  it('does not reuse another PR or base branch result after retargeting', async () => {
    for (const pr of [
      { ...association, number: 8 },
      { ...association, base: { ref: 'integration/work' } },
    ]) {
      const result = await evaluate({ trigger: { ...run, pull_requests: [pr] } });
      expect(result.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_progress' })
      );
    }
  });

  it('ignores old heads and PRs closed during or before evaluation', async () => {
    for (const prs of [
      [{ ...pullRequest, head: { ...pullRequest.head, sha: 'third-head' } }],
      [{ ...pullRequest, state: 'closed' }],
      [pullRequest, { ...pullRequest, state: 'closed' }],
      [pullRequest, { ...pullRequest, base: { ref: 'other-base' } }],
    ]) {
      const result = await evaluate({ prs });
      expect(result.create).not.toHaveBeenCalled();
    }
  });

  it('keeps a reopened PR pending while its new registration is missing from the run list', async () => {
    const result = await evaluate({
      action: 'requested',
      trigger: { ...run, run_number: 21, id: 21, status: 'queued', conclusion: '' },
      runs: [run],
    });
    expect(result.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });
});

describe('registered replacement cancellation', () => {
  const replacement = { ...run, status: 'in_progress', conclusion: '' };
  const old = { ...run, id: 19, head_sha: 'old-head', status: 'in_progress', conclusion: '' };

  it('cancels obsolete promotion runs without publishing or aggregating an admission verdict', async () => {
    const result = await evaluate({
      action: 'requested',
      trigger: { ...replacement, name: 'Promotion Quality' },
      cancellationOnly: ['Promotion Quality'],
      candidates: [old],
    });
    expect(result.cancel).toHaveBeenCalledExactlyOnceWith({
      owner: 'example',
      repo: 'project',
      run_id: 19,
    });
    expect(result.create).not.toHaveBeenCalled();
  });

  it('ignores completed optional promotion runs without weakening the nine-workflow gate', async () => {
    const result = await evaluate({
      trigger: { ...run, name: 'Promotion Quality' },
      cancellationOnly: ['Promotion Quality'],
    });
    expect(result.create).not.toHaveBeenCalled();
    expect(result.cancel).not.toHaveBeenCalled();
  });

  it('cancels only older runs belonging to this workflow, PR and repository', async () => {
    const result = await evaluate({
      action: 'requested',
      trigger: replacement,
      candidates: [
        old,
        { ...old, id: 21 },
        { ...old, workflow_id: 100 },
        { ...old, status: 'completed' },
        { ...old, head_repository: { id: 99 } },
        { ...old, pull_requests: [{ ...association, number: 9 }] },
        { ...old, event: 'merge_group' },
      ],
    });
    expect(result.cancel).toHaveBeenCalledExactlyOnceWith({
      owner: 'example',
      repo: 'project',
      run_id: 19,
    });
  });

  it('cancels the older same-SHA run after an edit registers its replacement', async () => {
    const result = await evaluate({
      action: 'requested',
      trigger: replacement,
      candidates: [{ ...old, head_sha: run.head_sha }],
    });
    expect(result.cancel).toHaveBeenCalledExactlyOnceWith({
      owner: 'example',
      repo: 'project',
      run_id: 19,
    });
  });

  it('requires the registered replacement itself to match the current head', async () => {
    const result = await evaluate({
      action: 'requested',
      trigger: replacement,
      registered: old,
      candidates: [old],
    });
    expect(result.cancel).not.toHaveBeenCalled();
  });

  it('does not cancel when a rapid third push supersedes the replacement', async () => {
    const result = await evaluate({
      action: 'requested',
      trigger: replacement,
      candidates: [old],
      prs: [pullRequest, { ...pullRequest, head: { ...pullRequest.head, sha: 'third-head' } }],
    });
    expect(result.cancel).not.toHaveBeenCalled();
    expect(result.create).not.toHaveBeenCalled();
  });

  it('retires obsolete work even when the replacement has already completed', async () => {
    const result = await evaluate({ trigger: run, candidates: [old] });
    expect(result.cancel).toHaveBeenCalledExactlyOnceWith({
      owner: 'example',
      repo: 'project',
      run_id: old.id,
    });
  });

  it('reconciles other registered workflows when their observer event was coalesced', async () => {
    for (const name of ['iOS Quality', 'Promotion Quality']) {
      const queued = { ...replacement, id: 30, name, workflow_id: 9, status: 'queued' };
      const result = await evaluate({
        trigger: run,
        runs: [run, queued],
        cancellationOnly: ['Promotion Quality'],
        candidates: [{ ...old, workflow_id: queued.workflow_id }],
      });
      expect(result.cancel).toHaveBeenCalledExactlyOnceWith({
        owner: 'example',
        repo: 'project',
        run_id: old.id,
      });
    }
  });

  it('does not cancel when a fork run has no explicit PR association', async () => {
    const result = await evaluate({
      trigger: { ...replacement, pull_requests: [] },
      associated: [pullRequest],
      candidates: [old],
    });
    expect(result.cancel).not.toHaveBeenCalled();
  });

  it('continues evaluating if obsolete work completes before cancellation reaches it', async () => {
    const result = await evaluate({
      action: 'in_progress',
      trigger: replacement,
      candidates: [old],
      cancelFails: true,
    });
    expect(result.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });
});

describe('workflow admission wiring', () => {
  it('isolates cancellation-only and non-PR events from queued admission publications', () => {
    expect(source).toContain('github.event.workflow_run.event');
    expect(source).toContain(
      "github.event.workflow_run.path == '.github/workflows/promotion-quality.yml' && 'cancellation' || 'admission'"
    );
  });

  it.each([
    'unit-quality',
    'fe-quality',
    'rust-quality',
    'app-quality',
    'quality',
    'registry-generated-quality',
    'ios-quality',
    'docker-build',
    'fe-test-e2e',
  ])('%s registers new heads independently and reruns on retargeting', (name) => {
    const workflow = readFileSync(resolve(`.github/workflows/${name}.yml`), 'utf8');
    expect(workflow).toContain('github.event.pull_request.head.sha || github.sha');
    expect(workflow).toContain('cancel-in-progress: false');
    expect(workflow).toContain('types: [opened, synchronize, reopened, edited]');
  });
});
