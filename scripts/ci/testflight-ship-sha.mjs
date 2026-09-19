#!/usr/bin/env node
/**
 * Which commit of a push to `main` does `ios-testflight.yml` ship, if any?
 *
 * iOS Quality does not run on `push` (POPS-4152): the merge-queue lane already
 * ran the full job — suite, analyzer, Release check, UI flow — on the commit
 * that lands, so a push run would build that same commit a second time on the
 * five-runner macOS pool. TestFlight therefore reads the merge-group run's
 * verdict instead of chaining off a push run.
 *
 * A push can carry several commits (the queue merges a batch in one push),
 * and which of their merge groups selected the iOS lane depends on each
 * group's diff. So every pushed commit is looked at, newest first, and the
 * first one whose merge-group `quality` job actually ran is decisive: shipped
 * if it passed, nothing shipped if it did not. A commit whose lane was scoped
 * out (`skipped`) or that has no merge-group run at all (a direct push) says
 * nothing about iOS and is passed over.
 *
 * Tier A: no third-party imports, runs straight after checkout.
 *
 * Usage (in `ios-testflight.yml`, on `push`):
 *   node scripts/ci/testflight-ship-sha.mjs
 * reading GITHUB_EVENT_PATH, GITHUB_REPOSITORY and GITHUB_TOKEN, and writing
 * `sha=<commit or empty>` to GITHUB_OUTPUT.
 */

import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** The `name:` of the macOS job in `ios-quality.yml`; a test holds the two equal. */
export const QUALITY_JOB_NAME = 'build + test + lint + UI flow';

/** The `name:` of `ios-quality.yml` itself. */
export const QUALITY_WORKFLOW_NAME = 'iOS Quality';

/**
 * Picks the commit to ship from pushed commits and their merge-group verdicts.
 *
 * @param {readonly string[]} commitsNewestFirst every commit of the push, newest first
 * @param {ReadonlyMap<string, string>} verdicts sha → the merge-group `quality`
 *   job's conclusion (`success`, `failure`, `skipped`, …), `absent` when there
 *   is no such run or job, `pending` when the run has not completed
 * @returns {string | null} the sha to ship, or null to ship nothing
 */
export function pickShipSha(commitsNewestFirst, verdicts) {
  for (const sha of commitsNewestFirst) {
    const verdict = verdicts.get(sha) ?? 'absent';
    if (verdict === 'absent' || verdict === 'skipped') continue;
    return verdict === 'success' ? sha : null;
  }
  return null;
}

/**
 * @typedef {{ id: number, name: string, run_number: number, run_attempt: number, status: string }} WorkflowRun
 * @typedef {{ name: string, conclusion: string | null }} Job
 * @typedef {{ workflow_runs?: WorkflowRun[], jobs?: Job[] }} ApiPage
 */

/**
 * Reads the merge-group `quality` job's verdict for one commit from the API.
 *
 * @param {string} sha
 * @param {{ repo: string, request: (path: string) => Promise<ApiPage> }} api
 * @returns {Promise<string>}
 */
export async function verdictFor(sha, { repo, request }) {
  const { workflow_runs: runs = [] } = await request(
    `/repos/${repo}/actions/runs?head_sha=${sha}&event=merge_group&per_page=100`
  );
  const latest = runs
    .filter((run) => run.name === QUALITY_WORKFLOW_NAME)
    .toSorted((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt)[0];
  if (!latest) return 'absent';
  if (latest.status !== 'completed') return 'pending';
  const { jobs = [] } = await request(`/repos/${repo}/actions/runs/${latest.id}/jobs?per_page=100`);
  const job = jobs.find((candidate) => candidate.name === QUALITY_JOB_NAME);
  return job?.conclusion ?? 'absent';
}

async function main() {
  const { GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_OUTPUT } = process.env;
  if (!GITHUB_EVENT_PATH || !GITHUB_REPOSITORY || !GITHUB_TOKEN || !GITHUB_OUTPUT) {
    throw new Error(
      'testflight-ship-sha: GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_TOKEN and GITHUB_OUTPUT are required'
    );
  }
  /** @type {{ commits?: { id: string }[], after?: string }} */
  const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
  const commitsNewestFirst = (event.commits ?? []).map((commit) => commit.id).toReversed();
  if (commitsNewestFirst.length === 0 && event.after) commitsNewestFirst.push(event.after);

  /** @param {string} path @returns {Promise<ApiPage>} */
  const request = async (path) => {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`GET ${path} → ${response.status}`);
    return response.json();
  };

  const verdicts = new Map();
  for (const sha of commitsNewestFirst) {
    const verdict = await verdictFor(sha, { repo: GITHUB_REPOSITORY, request });
    verdicts.set(sha, verdict);
    console.log(`${sha}: merge-group ${QUALITY_JOB_NAME} → ${verdict}`);
    if (verdict !== 'absent' && verdict !== 'skipped') break;
  }

  const sha = pickShipSha(commitsNewestFirst, verdicts);
  console.log(sha ? `shipping ${sha}` : 'nothing to ship');
  appendFileSync(GITHUB_OUTPUT, `sha=${sha ?? ''}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
