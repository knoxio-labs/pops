/**
 * Turns what the acceptance layers reported — vitest's JSON report,
 * Playwright's JSON report, and the Maestro lane's exit status — into
 * per-criterion evidence records and, given the pull request that carries
 * them, evidence packets `scripts/implementation-evidence.mjs` validates.
 *
 * Pure: no process, file or network access, so every mapping here is unit
 * tested (`scripts/__tests__/inventory-acceptance-evidence.test.ts`). A
 * criterion is only ever `passed` because a test with its id reported
 * passing; no result, an ambiguous result, or a result the collector cannot
 * read is recorded as `skipped` or `failed`, never as a pass.
 */
import { z } from 'zod';

import { EPIC } from './scenarios.mjs';

/** @typedef {import('./scenarios.mjs').Scenario} Scenario */
/** @typedef {import('./scenarios.mjs').Layer} Layer */
/** @typedef {'passed' | 'failed' | 'skipped'} EvidenceStatus */
/**
 * One test outcome, whichever layer produced it.
 * @typedef {{ layer: Layer, file: string, title: string, status: EvidenceStatus, detail: string }} TestResult
 */
/**
 * One criterion's evidence record, in the shape
 * `scripts/implementation-evidence.mjs` reads (`status` + `detail`).
 * @typedef {{
 *   criterion: string,
 *   implementation: string,
 *   test: string,
 *   revision: string,
 *   environment: string,
 *   status: EvidenceStatus,
 *   detail: string,
 *   limitations: string,
 *   state: 'complete' | 'partial',
 *   deferredTicket?: string,
 * }} EvidenceRecord
 */
/**
 * @typedef {{ revision: string, host: string }} RunContext
 * @typedef {{ number: number, prIssue: string }} PullRequestRef
 */

const vitestReportSchema = z.object({
  testResults: z.array(
    z.object({
      name: z.string(),
      status: z.string().optional(),
      message: z.string().optional(),
      assertionResults: z.array(
        z.object({
          title: z.string(),
          status: z.string(),
          duration: z.number().nullable().optional(),
          failureMessages: z.array(z.string()).optional(),
          meta: z.object({ skipReason: z.string().optional() }).passthrough().optional(),
        })
      ),
    })
  ),
});

/**
 * @typedef {{
 *   title: string,
 *   file: string,
 *   tests: Array<{
 *     status: string,
 *     annotations?: Array<{ type: string, description?: string }>,
 *     results: Array<{ status: string, duration?: number, error?: { message?: string } }>,
 *   }>,
 * }} PlaywrightSpec
 * @typedef {{ specs?: PlaywrightSpec[], suites?: PlaywrightSuite[] }} PlaywrightSuite
 */

/** @type {z.ZodType<PlaywrightSuite>} */
const playwrightSuiteSchema = z.lazy(() =>
  z.object({
    specs: z
      .array(
        z.object({
          title: z.string(),
          file: z.string(),
          tests: z.array(
            z.object({
              status: z.string(),
              annotations: z
                .array(z.object({ type: z.string(), description: z.string().optional() }))
                .optional(),
              results: z.array(
                z.object({
                  status: z.string(),
                  duration: z.number().optional(),
                  error: z.object({ message: z.string().optional() }).optional(),
                })
              ),
            })
          ),
        })
      )
      .optional(),
    suites: z.array(playwrightSuiteSchema).optional(),
  })
);
const playwrightReportSchema = z.object({ suites: z.array(playwrightSuiteSchema) });

/** @param {string} message */
function firstLine(message) {
  const line = message.split('\n').find((candidate) => candidate.trim() !== '') ?? message;
  return line.trim().slice(0, 500);
}

/**
 * Reads vitest's `--reporter=json` output. A skip carries the reason the test
 * recorded on its task `meta` (`test-helpers-acceptance-skip.ts`).
 *
 * @param {unknown} report
 * @param {string} repoRoot absolute path the report's file names are relative to
 * @returns {TestResult[]}
 */
export function vitestResults(report, repoRoot) {
  const parsed = vitestReportSchema.parse(report);
  return parsed.testResults.flatMap((file) =>
    file.assertionResults.map((test) => {
      const path = file.name.startsWith(`${repoRoot}/`)
        ? file.name.slice(repoRoot.length + 1)
        : file.name;
      /** @type {TestResult} */
      const base = {
        layer: 'vitest',
        file: path,
        title: test.title,
        status: 'skipped',
        detail: '',
      };
      if (test.status === 'passed') {
        return {
          ...base,
          status: 'passed',
          detail: `passed in ${Math.round(test.duration ?? 0)} ms`,
        };
      }
      if (test.status === 'failed') {
        const message = test.failureMessages?.[0] ?? 'failed without a message';
        return { ...base, status: 'failed', detail: firstLine(message) };
      }
      if (file.status === 'failed' && test.meta?.skipReason === undefined) {
        const message = file.message ?? 'the suite failed before its tests ran';
        return { ...base, status: 'failed', detail: `suite failed: ${firstLine(message)}` };
      }
      return {
        ...base,
        detail: test.meta?.skipReason ?? `vitest reported ${test.status} with no recorded reason`,
      };
    })
  );
}

/**
 * @param {PlaywrightSuite} suite
 * @returns {PlaywrightSpec[]}
 */
function specsOf(suite) {
  return [...(suite.specs ?? []), ...(suite.suites ?? []).flatMap(specsOf)];
}

/**
 * Reads Playwright's JSON reporter output. `expected` is a pass, `flaky` a
 * pass that needed a retry (said so in the detail), `skipped` carries the
 * `test.skip` reason, and anything else is a failure.
 *
 * @param {unknown} report
 * @param {string} fileRoot repo-relative directory the report's file names are relative to
 * @returns {TestResult[]}
 */
export function playwrightResults(report, fileRoot) {
  const parsed = playwrightReportSchema.parse(report);
  return parsed.suites.flatMap(specsOf).flatMap((spec) =>
    spec.tests.map((test) => {
      const last = test.results.at(-1);
      /** @type {TestResult} */
      const base = {
        layer: 'playwright',
        file: `${fileRoot}/${spec.file}`,
        title: spec.title,
        status: 'failed',
        detail: '',
      };
      if (test.status === 'expected' && last?.status === 'passed') {
        return { ...base, status: 'passed', detail: `passed in ${String(last.duration ?? 0)} ms` };
      }
      if (test.status === 'flaky') {
        return {
          ...base,
          status: 'passed',
          detail: `passed after ${String(test.results.length - 1)} failed attempt(s)`,
        };
      }
      if (test.status === 'skipped') {
        const reason = test.annotations?.find(
          (annotation) => annotation.type === 'skip'
        )?.description;
        return { ...base, status: 'skipped', detail: reason ?? 'skipped with no recorded reason' };
      }
      return {
        ...base,
        detail: firstLine(last?.error?.message ?? `playwright reported ${test.status}`),
      };
    })
  );
}

/**
 * The Maestro lane reports one exit status for the whole flow, so its one
 * criterion passes only when the lane exited 0.
 *
 * @param {Scenario} scenario
 * @param {number} exitCode
 * @param {string} logPath where the lane's output was kept
 * @returns {TestResult[]}
 */
export function maestroResults(scenario, exitCode, logPath) {
  return scenario.criteria.map((criterion) => ({
    layer: 'maestro',
    file: scenario.file,
    title: `${criterion.id} ${criterion.description}`,
    status: exitCode === 0 ? 'passed' : 'failed',
    detail:
      exitCode === 0
        ? 'the Maestro lane exited 0'
        : `the Maestro lane exited ${String(exitCode)}; see ${logPath}`,
  }));
}

/**
 * @param {Scenario} scenario
 * @param {string} criterionId
 * @param {readonly TestResult[]} results
 * @param {string | undefined} notRunReason
 * @returns {{ status: EvidenceStatus, detail: string, test: string }}
 */
function outcomeFor(scenario, criterionId, results, notRunReason) {
  const matching = results.filter(
    (result) =>
      result.layer === scenario.layer &&
      result.file === scenario.file &&
      result.title.startsWith(`${criterionId} `)
  );
  if (matching.length === 0) {
    return {
      status: 'skipped',
      detail: notRunReason ?? `no ${scenario.layer} result names ${criterionId}`,
      test: `${scenario.file} › ${criterionId}`,
    };
  }
  const [only] = matching;
  if (matching.length > 1 || only === undefined) {
    return {
      status: 'failed',
      detail: `${String(matching.length)} results name ${criterionId}; the evidence is ambiguous`,
      test: `${scenario.file} › ${criterionId}`,
    };
  }
  return { status: only.status, detail: only.detail, test: `${scenario.file} › ${only.title}` };
}

/**
 * One evidence record per criterion. Anything but a pass is `partial`,
 * leads its limitations with why, and names the ticket that owns the gap —
 * the criterion's own, else the epic — so a packet built from it blocks
 * rather than completes, and says what blocked it.
 *
 * @param {Scenario} scenario
 * @param {readonly TestResult[]} results
 * @param {RunContext} context
 * @param {string} [notRunReason] why this scenario's layer produced no results
 * @returns {EvidenceRecord[]}
 */
export function scenarioRecords(scenario, results, context, notRunReason) {
  return scenario.criteria.map((criterion) => {
    const outcome = outcomeFor(scenario, criterion.id, results, notRunReason);
    /** @type {EvidenceRecord} */
    const record = {
      criterion: criterion.id,
      implementation: scenario.implementation,
      test: outcome.test,
      revision: context.revision,
      environment: `${context.host}; ${scenario.stack}`,
      status: outcome.status,
      detail: outcome.detail,
      limitations: scenario.limitations,
      state: 'complete',
    };
    if (outcome.status === 'passed') return record;
    return {
      ...record,
      limitations: `${outcome.status}: ${outcome.detail}. ${scenario.limitations}`,
      state: 'partial',
      deferredTicket: criterion.gapTicket ?? EPIC,
    };
  });
}

/**
 * The packet `scripts/implementation-evidence.mjs --evidence` validates.
 *
 * @param {Scenario} scenario
 * @param {readonly EvidenceRecord[]} records
 * @param {PullRequestRef} pullRequest
 */
export function scenarioPacket(scenario, records, pullRequest) {
  return {
    implementationTicket: scenario.ticket,
    criteria: scenario.criteria.map(({ id, description }) => ({ id, description })),
    pullRequests: [
      {
        number: pullRequest.number,
        implementationTicket: scenario.ticket,
        prIssue: pullRequest.prIssue,
        evidence: records,
      },
    ],
  };
}

/**
 * The scenario's overall status: failed if any criterion failed, passed only
 * if every criterion passed, otherwise skipped.
 *
 * @param {readonly EvidenceRecord[]} records
 * @returns {EvidenceStatus}
 */
export function scenarioStatus(records) {
  if (records.some((record) => record.status === 'failed')) return 'failed';
  if (records.length > 0 && records.every((record) => record.status === 'passed')) return 'passed';
  return 'skipped';
}
