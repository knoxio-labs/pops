import { describe, expect, it } from 'vitest';

import {
  maestroResults,
  playwrightResults,
  scenarioPacket,
  scenarioRecords,
  scenarioStatus,
  vitestResults,
} from '../inventory-acceptance/evidence.mjs';
import { EPIC, SCENARIOS } from '../inventory-acceptance/scenarios.mjs';

import type { Scenario, TestResult } from '../inventory-acceptance/evidence.mjs';

const ROOT = '/repo';
const CONTEXT = { revision: 'abcdef1234567', host: 'local test host' };

const scenario: Scenario = {
  id: 'SX',
  title: 'A test scenario',
  ticket: 'POPS-9001',
  layer: 'vitest',
  file: 'pillars/mcp/src/acceptance/sx.acceptance.test.ts',
  implementation: 'somewhere',
  stack: 'a stack',
  limitations: 'none known',
  criteria: [
    { id: 'SX.1', description: 'first' },
    { id: 'SX.2', description: 'second', gapTicket: 'POPS-9002' },
  ],
};

function vitestReport(
  tests: Array<{
    title: string;
    status: string;
    duration?: number;
    failureMessages?: string[];
    meta?: Record<string, unknown>;
  }>
) {
  return {
    testResults: [{ name: `${ROOT}/${scenario.file}`, assertionResults: tests }],
  };
}

function result(title: string, status: TestResult['status'], detail = 'd'): TestResult {
  return { layer: 'vitest', file: scenario.file, title, status, detail };
}

describe('vitestResults', () => {
  it('maps pass, failure and skip, stripping the repo root from the file', () => {
    const results = vitestResults(
      vitestReport([
        { title: 'SX.1 passes', status: 'passed', duration: 12.4 },
        {
          title: 'SX.2 fails',
          status: 'failed',
          failureMessages: ['\nAssertionError: boom\n  at x'],
        },
        { title: 'SX.3 skips', status: 'skipped', meta: { skipReason: 'not on this build' } },
        { title: 'SX.4 pending', status: 'pending', meta: {} },
      ]),
      ROOT
    );
    expect(results).toEqual([
      {
        layer: 'vitest',
        file: scenario.file,
        title: 'SX.1 passes',
        status: 'passed',
        detail: 'passed in 12 ms',
      },
      {
        layer: 'vitest',
        file: scenario.file,
        title: 'SX.2 fails',
        status: 'failed',
        detail: 'AssertionError: boom',
      },
      {
        layer: 'vitest',
        file: scenario.file,
        title: 'SX.3 skips',
        status: 'skipped',
        detail: 'not on this build',
      },
      {
        layer: 'vitest',
        file: scenario.file,
        title: 'SX.4 pending',
        status: 'skipped',
        detail: 'vitest reported pending with no recorded reason',
      },
    ]);
  });

  it('fails the criteria of a suite whose setup failed, keeping recorded skips', () => {
    const report = vitestReport([
      { title: 'SX.1 never ran', status: 'skipped', meta: {} },
      { title: 'SX.2 skips', status: 'skipped', meta: { skipReason: 'not on this build' } },
    ]);
    const [file] = report.testResults;
    if (file === undefined) throw new Error('no file in the report');
    const failed = {
      testResults: [
        { ...file, status: 'failed', message: 'Error: [registry] timed out after 20000ms\nmore' },
      ],
    };

    expect(vitestResults(failed, ROOT).map(({ status, detail }) => ({ status, detail }))).toEqual([
      { status: 'failed', detail: 'suite failed: Error: [registry] timed out after 20000ms' },
      { status: 'skipped', detail: 'not on this build' },
    ]);
  });

  it('refuses a report that is not vitest JSON rather than reading it as empty', () => {
    expect(() => vitestResults({ numTotalTests: 3 }, ROOT)).toThrow();
  });
});

describe('playwrightResults', () => {
  const report = {
    suites: [
      {
        suites: [
          {
            specs: [
              {
                title: 'S7.1 passes',
                file: 'a.acceptance.spec.ts',
                tests: [{ status: 'expected', results: [{ status: 'passed', duration: 30 }] }],
              },
              {
                title: 'S7.2 flaky',
                file: 'a.acceptance.spec.ts',
                tests: [{ status: 'flaky', results: [{ status: 'failed' }, { status: 'passed' }] }],
              },
              {
                title: 'S7.3 skipped',
                file: 'a.acceptance.spec.ts',
                tests: [
                  {
                    status: 'skipped',
                    annotations: [{ type: 'skip', description: 'builder not on this build' }],
                    results: [{ status: 'skipped' }],
                  },
                ],
              },
              {
                title: 'S7.4 fails',
                file: 'a.acceptance.spec.ts',
                tests: [
                  {
                    status: 'unexpected',
                    results: [
                      { status: 'failed', error: { message: 'Error: locator missing\nmore' } },
                    ],
                  },
                ],
              },
              {
                title: 'S7.5 times out',
                file: 'a.acceptance.spec.ts',
                tests: [{ status: 'unexpected', results: [{ status: 'timedOut' }] }],
              },
            ],
          },
        ],
      },
    ],
  };

  it('walks nested suites and maps every outcome', () => {
    const results = playwrightResults(report, 'pillars/shell/e2e');
    expect(results.map(({ title, status, detail }) => [title, status, detail])).toEqual([
      ['S7.1 passes', 'passed', 'passed in 30 ms'],
      ['S7.2 flaky', 'passed', 'passed after 1 failed attempt(s)'],
      ['S7.3 skipped', 'skipped', 'builder not on this build'],
      ['S7.4 fails', 'failed', 'Error: locator missing'],
      ['S7.5 times out', 'failed', 'playwright reported unexpected'],
    ]);
    expect(results[0]?.file).toBe('pillars/shell/e2e/a.acceptance.spec.ts');
  });
});

describe('maestroResults', () => {
  const ios = SCENARIOS.find((candidate) => candidate.layer === 'maestro');
  if (ios === undefined) throw new Error('no maestro scenario');

  it('passes only on a zero exit', () => {
    expect(maestroResults(ios, 0, 'log').every((entry) => entry.status === 'passed')).toBe(true);
    const failed = maestroResults(ios, 3, 'the log');
    expect(failed.every((entry) => entry.status === 'failed')).toBe(true);
    expect(failed[0]?.detail).toBe('the Maestro lane exited 3; see the log');
  });
});

describe('scenarioRecords', () => {
  it('records a passed criterion as complete with no deferral', () => {
    const [first] = scenarioRecords(
      scenario,
      [result('SX.1 ok', 'passed', 'passed in 3 ms')],
      CONTEXT
    );
    expect(first).toEqual({
      criterion: 'SX.1',
      implementation: 'somewhere',
      test: `${scenario.file} › SX.1 ok`,
      revision: CONTEXT.revision,
      environment: 'local test host; a stack',
      status: 'passed',
      detail: 'passed in 3 ms',
      limitations: 'none known',
      state: 'complete',
    });
  });

  it('defers a failure to the criterion gap ticket, else the epic', () => {
    const records = scenarioRecords(
      scenario,
      [result('SX.1 broke', 'failed', 'boom'), result('SX.2 skipped', 'skipped', 'why')],
      CONTEXT
    );
    expect(
      records.map(({ status, state, deferredTicket, limitations }) => [
        status,
        state,
        deferredTicket,
        limitations,
      ])
    ).toEqual([
      ['failed', 'partial', EPIC, 'failed: boom. none known'],
      ['skipped', 'partial', 'POPS-9002', 'skipped: why. none known'],
    ]);
  });

  it('never passes a criterion no result names, and says why it did not run', () => {
    const records = scenarioRecords(scenario, [], CONTEXT, 'not run: layer not selected');
    expect(records.map(({ status, detail }) => [status, detail])).toEqual([
      ['skipped', 'not run: layer not selected'],
      ['skipped', 'not run: layer not selected'],
    ]);
  });

  it('does not match an id that is only a prefix of another', () => {
    const [first] = scenarioRecords(scenario, [result('SX.10 other', 'passed')], CONTEXT);
    expect(first?.status).toBe('skipped');
  });

  it('ignores results from another file or layer', () => {
    const elsewhere: TestResult = { ...result('SX.1 ok', 'passed'), file: 'other.test.ts' };
    const otherLayer: TestResult = { ...result('SX.1 ok', 'passed'), layer: 'playwright' };
    const [first] = scenarioRecords(scenario, [elsewhere, otherLayer], CONTEXT);
    expect(first?.status).toBe('skipped');
  });

  it('fails a criterion two results claim, instead of picking one', () => {
    const [first] = scenarioRecords(
      scenario,
      [result('SX.1 a', 'passed'), result('SX.1 b', 'passed')],
      CONTEXT
    );
    expect(first?.status).toBe('failed');
    expect(first?.detail).toMatch(/ambiguous/);
  });
});

describe('scenarioStatus', () => {
  it('is failed if anything failed, passed only if everything passed, else skipped', () => {
    const records = (statuses: TestResult['status'][]) =>
      scenarioRecords(
        {
          ...scenario,
          criteria: statuses.map((_, index) => ({
            id: `SX.${String(index + 1)}`,
            description: 'c',
          })),
        },
        statuses.map((status, index) => result(`SX.${String(index + 1)} t`, status)),
        CONTEXT
      );
    expect(scenarioStatus(records(['passed', 'passed']))).toBe('passed');
    expect(scenarioStatus(records(['passed', 'skipped']))).toBe('skipped');
    expect(scenarioStatus(records(['skipped', 'failed']))).toBe('failed');
    expect(scenarioStatus([])).toBe('skipped');
  });
});

describe('scenarioPacket', () => {
  it('names the scenario ticket once per packet and carries every record under the pull request', () => {
    const records = scenarioRecords(
      scenario,
      [result('SX.1 ok', 'passed'), result('SX.2 skipped', 'skipped')],
      CONTEXT
    );
    const packet = scenarioPacket(scenario, records, { number: 5100, prIssue: 'POPS-9100' });
    expect(packet).toEqual({
      implementationTicket: 'POPS-9001',
      criteria: [
        { id: 'SX.1', description: 'first' },
        { id: 'SX.2', description: 'second' },
      ],
      pullRequests: [
        {
          number: 5100,
          implementationTicket: 'POPS-9001',
          prIssue: 'POPS-9100',
          evidence: records,
        },
      ],
    });
  });
});

describe('SCENARIOS', () => {
  it('gives every criterion a unique id prefixed by its scenario, and every scenario a distinct file', () => {
    const ids = SCENARIOS.flatMap((entry) => entry.criteria.map((criterion) => criterion.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of SCENARIOS) {
      for (const criterion of entry.criteria)
        expect(criterion.id.startsWith(`${entry.id}.`)).toBe(true);
    }
    expect(new Set(SCENARIOS.map((entry) => entry.file)).size).toBe(SCENARIOS.length);
    expect(SCENARIOS.every((entry) => entry.ticket !== EPIC)).toBe(true);
  });
});
