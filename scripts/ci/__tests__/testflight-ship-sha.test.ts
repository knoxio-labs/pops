import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isMapping, parseYaml } from '../config-parse.mjs';
import {
  pickShipSha,
  QUALITY_JOB_NAME,
  QUALITY_WORKFLOW_NAME,
  verdictFor,
} from '../testflight-ship-sha.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const workflowsDir = resolve(here, '..', '..', '..', '.github', 'workflows');

function workflow(file: string): Record<string, unknown> {
  const doc = parseYaml(readFileSync(join(workflowsDir, file), 'utf8'), file);
  if (!isMapping(doc)) throw new Error(`${file} is not a mapping`);
  return doc;
}

describe('pickShipSha', () => {
  const verdicts = (entries: Record<string, string>) => new Map(Object.entries(entries));

  it.each([
    [
      'ships the newest commit when its lane passed',
      ['c', 'b'],
      { c: 'success', b: 'success' },
      'c',
    ],
    [
      'passes over a scoped-out newest commit to one that ran',
      ['c', 'b', 'a'],
      { c: 'skipped', b: 'success', a: 'failure' },
      'b',
    ],
    ['passes over a commit with no merge-group run', ['c', 'b'], { b: 'success' }, 'b'],
    [
      'ships nothing when the newest real verdict failed',
      ['c', 'b'],
      { c: 'failure', b: 'success' },
      null,
    ],
    [
      'ships nothing while the newest real verdict is pending',
      ['c', 'b'],
      { c: 'pending', b: 'success' },
      null,
    ],
    ['ships nothing when the lane was cancelled', ['c'], { c: 'cancelled' }, null],
    ['ships nothing when no commit touched iOS', ['c', 'b'], { c: 'skipped', b: 'absent' }, null],
    ['ships nothing for an empty push', [], {}, null],
  ] as const)('%s', (_label, commits, entries, expected) => {
    expect(pickShipSha(commits, verdicts(entries))).toBe(expected);
  });
});

describe('verdictFor', () => {
  const run = (id: number, runNumber: number, attempt: number, status = 'completed') => ({
    id,
    name: QUALITY_WORKFLOW_NAME,
    run_number: runNumber,
    run_attempt: attempt,
    status,
  });

  type Run = ReturnType<typeof run>;
  type Job = { name: string; conclusion: string | null };

  function api(runs: Run[], jobsByRun: Record<number, Job[]>) {
    const paths: string[] = [];
    return {
      paths,
      repo: 'o/r',
      request: (path: string) => {
        paths.push(path);
        const jobs = /\/runs\/(\d+)\/jobs/u.exec(path);
        return Promise.resolve(
          jobs ? { jobs: jobsByRun[Number(jobs[1])] ?? [] } : { workflow_runs: runs }
        );
      },
    };
  }

  it('asks only for merge-group runs of that commit', async () => {
    const a = api([], {});
    await verdictFor('abc', a);
    expect(a.paths[0]).toBe('/repos/o/r/actions/runs?head_sha=abc&event=merge_group&per_page=100');
  });

  it('reads the quality job of the newest attempt of the newest run', async () => {
    const a = api([run(1, 5, 1), run(3, 6, 2), run(2, 6, 1)], {
      1: [{ name: QUALITY_JOB_NAME, conclusion: 'success' }],
      2: [{ name: QUALITY_JOB_NAME, conclusion: 'success' }],
      3: [
        { name: 'Scope the merge-group lane', conclusion: 'success' },
        { name: QUALITY_JOB_NAME, conclusion: 'failure' },
      ],
    });
    expect(await verdictFor('abc', a)).toBe('failure');
  });

  it('ignores other workflows at the same commit', async () => {
    const other = { ...run(9, 99, 1), name: 'Docker Build' };
    const a = api([other], { 9: [{ name: QUALITY_JOB_NAME, conclusion: 'success' }] });
    expect(await verdictFor('abc', a)).toBe('absent');
  });

  it('reports a run still in flight as pending', async () => {
    expect(await verdictFor('abc', api([run(1, 1, 1, 'in_progress')], {}))).toBe('pending');
  });

  it('reports a scoped-out lane as skipped', async () => {
    const a = api([run(1, 1, 1)], { 1: [{ name: QUALITY_JOB_NAME, conclusion: 'skipped' }] });
    expect(await verdictFor('abc', a)).toBe('skipped');
  });
});

describe('the names it looks up are the real ones', () => {
  it('matches ios-quality.yml', () => {
    const doc = workflow('ios-quality.yml');
    expect(doc.name).toBe(QUALITY_WORKFLOW_NAME);
    const jobs = doc.jobs;
    expect(isMapping(jobs) && isMapping(jobs.quality) ? jobs.quality.name : undefined).toBe(
      QUALITY_JOB_NAME
    );
  });

  it('is what ios-testflight.yml runs on a push', () => {
    const source = readFileSync(join(workflowsDir, 'ios-testflight.yml'), 'utf8');
    expect(source).toMatch(/node scripts\/ci\/testflight-ship-sha\.mjs/u);
  });
});
