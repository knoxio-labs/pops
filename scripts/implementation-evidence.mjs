#!/usr/bin/env node
/**
 * Validate the evidence packet used before a Huly implementation ticket can
 * be advanced. The packet is deliberately read-only: this command never
 * talks to Huly or GitHub, so advancing an issue remains a deliberate human
 * action after the evidence has been checked.
 *
 * One packet names one canonical `implementationTicket`. Each pull request
 * separately names its synced `prIssue`; it must not be mistaken for the
 * implementation ticket. Several PRs may point at the same implementation
 * ticket. Every declared criterion receives exactly one evidence record with
 * its implementation, test, revision, environment, status (an enumerated
 * `passed` / `failed` / `skipped`), free-text detail, and limitations.
 *
 * `partial` and `deferred` records require a different Huly ticket and a
 * limitation. A `complete` record whose `status` is `failed` or `skipped` is
 * rejected outright: the declared state can never override what the
 * evidence's own `status` says happened. Duplicate evidence is ambiguous and never becomes
 * automatic completion. A human may record an override with both an approver
 * and a rationale, but the resulting verdict still says that automation is
 * blocked: only a person may perform the state change.
 *
 * Usage:
 *   node scripts/implementation-evidence.mjs --evidence <packet.json>
 *   node scripts/implementation-evidence.mjs --evidence <packet.json> --json
 *   node scripts/implementation-evidence.mjs --self-test
 */

import { readFileSync } from 'node:fs';

import { readFlag } from './cli-flags.mjs';

const TICKET_RE = /^[A-Z][A-Z0-9_]*-\d+$/u;
const REVISION_RE = /^[0-9a-f]{7,64}$/iu;
const EVIDENCE_STATUSES = /** @type {const} */ (['passed', 'failed', 'skipped']);

export const HELP = `Usage: node scripts/implementation-evidence.mjs --evidence <packet.json> [--json]
       node scripts/implementation-evidence.mjs --self-test

Validates a read-only packet for one canonical implementation ticket. Every PR
must name that ticket and a different PR-sync issue. Each criterion needs one
evidence record containing implementation, test, revision, environment,
status (passed, failed, or skipped), detail, limitations, and state. Partial
or deferred work must name a different follow-up ticket. A complete record
needs status "passed": "failed" or "skipped" is rejected even when state says
complete. Ambiguous or incomplete evidence never authorizes automation; an
override records a named human rationale but remains human-only.`;

/**
 * @typedef {'complete' | 'partial' | 'deferred'} EvidenceState
 * @typedef {'passed' | 'failed' | 'skipped'} EvidenceStatus
 * @typedef {{ id: string, description: string }} Criterion
 * @typedef {{ criterion: string, implementation: string, test: string, revision: string, environment: string, status: EvidenceStatus, detail: string, limitations: string, state: EvidenceState, deferredTicket?: string }} CriterionEvidence
 * @typedef {{ number: number, implementationTicket: string, prIssue: string, evidence: CriterionEvidence[] }} PullRequestEvidence
 * @typedef {{ criterion: string, approvedBy: string, rationale: string }} HumanOverride
 * @typedef {{ implementationTicket: string, criteria: Criterion[], pullRequests: PullRequestEvidence[], overrides?: HumanOverride[] }} EvidencePacket
 * @typedef {{ criterion: string, reason: string }} Blocker
 */

/**
 * @param {unknown} value
 * @param {string} where
 * @returns {Record<string, unknown>}
 */
function record(value, where) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where} must be an object`);
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {Record<string, unknown>} value
 * @param {string} field
 * @param {string} where
 * @returns {string}
 */
function requiredText(value, field, where) {
  const raw = value[field];
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`${where}.${field} must be a non-empty string`);
  }
  return raw.trim();
}

/**
 * @param {string} value
 * @param {string} where
 * @returns {string}
 */
function ticket(value, where) {
  if (!TICKET_RE.test(value)) throw new Error(`${where} must be a tracker ticket identifier`);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} where
 * @returns {unknown[]}
 */
function array(value, where) {
  if (!Array.isArray(value)) throw new Error(`${where} must be an array`);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} where
 * @returns {number}
 */
function positiveInteger(value, where) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${where} must be a positive integer`);
  }
  return value;
}

/**
 * @param {string} value
 * @param {string} where
 * @returns {EvidenceState}
 */
function evidenceState(value, where) {
  if (value !== 'complete' && value !== 'partial' && value !== 'deferred') {
    throw new Error(`${where} must be complete, partial, or deferred`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} where
 * @returns {EvidenceStatus}
 */
function evidenceStatus(value, where) {
  if (
    typeof value !== 'string' ||
    !EVIDENCE_STATUSES.includes(/** @type {EvidenceStatus} */ (value))
  ) {
    throw new Error(`${where}.status must be one of ${EVIDENCE_STATUSES.join(', ')}`);
  }
  return /** @type {EvidenceStatus} */ (value);
}

/**
 * A record marked `complete` asserts the criterion passed. A `failed` or
 * `skipped` status is never completion evidence, regardless of the declared
 * state: the state alone cannot promise an outcome the status contradicts.
 *
 * @param {EvidenceStatus} value
 * @param {EvidenceState} state
 * @param {string} where
 * @returns {EvidenceStatus}
 */
function completionStatus(value, state, where) {
  if (state === 'complete' && value !== 'passed') {
    throw new Error(`${where}.status is complete but reports "${value}", not "passed"`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {EvidenceState} state
 * @param {string} implementationTicket
 * @param {string} where
 * @returns {string | undefined}
 */
function deferredTicket(value, state, implementationTicket, where) {
  if (state === 'complete') {
    if (value !== undefined) throw new Error(`${where} is complete and cannot defer work`);
    return undefined;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${where} is ${state} and needs deferredTicket`);
  }
  const deferred = ticket(value.trim(), `${where}.deferredTicket`);
  if (deferred === implementationTicket)
    throw new Error(`${where} must defer to a different ticket`);
  return deferred;
}

/**
 * Read and validate an evidence packet without making a network request.
 *
 * @param {unknown} parsed
 * @returns {EvidencePacket}
 */
export function readEvidencePacket(parsed) {
  const root = record(parsed, 'packet');
  const implementationTicket = ticket(
    requiredText(root, 'implementationTicket', 'packet'),
    'packet.implementationTicket'
  );
  const criteria = array(root['criteria'], 'packet.criteria').map((entry, index) => {
    const criterion = record(entry, `criteria[${index}]`);
    return {
      id: requiredText(criterion, 'id', `criteria[${index}]`),
      description: requiredText(criterion, 'description', `criteria[${index}]`),
    };
  });
  if (criteria.length === 0) throw new Error('packet.criteria must not be empty');
  const criterionIds = new Set();
  for (const criterion of criteria) {
    if (criterionIds.has(criterion.id))
      throw new Error(`criterion ${criterion.id} is declared more than once`);
    criterionIds.add(criterion.id);
  }

  const pullRequests = array(root['pullRequests'], 'packet.pullRequests').map((entry, index) => {
    const pullRequest = record(entry, `pullRequests[${index}]`);
    const number = positiveInteger(pullRequest['number'], `pullRequests[${index}].number`);
    const associatedTicket = ticket(
      requiredText(pullRequest, 'implementationTicket', `pullRequests[${index}]`),
      `pullRequests[${index}].implementationTicket`
    );
    if (associatedTicket !== implementationTicket) {
      throw new Error(
        `PR #${number} names ${associatedTicket}, not canonical implementation ticket ${implementationTicket}`
      );
    }
    const prIssue = ticket(
      requiredText(pullRequest, 'prIssue', `pullRequests[${index}]`),
      `pullRequests[${index}].prIssue`
    );
    if (prIssue === implementationTicket) {
      throw new Error(
        `PR #${number} uses ${prIssue} as both its PR issue and implementation ticket; these associations are distinct`
      );
    }
    const evidence = array(pullRequest['evidence'], `pullRequests[${index}].evidence`).map(
      (rawEvidence, evidenceIndex) => {
        const item = record(rawEvidence, `PR #${number}.evidence[${evidenceIndex}]`);
        const state = evidenceState(
          requiredText(item, 'state', `PR #${number}.evidence[${evidenceIndex}]`),
          `PR #${number}.evidence[${evidenceIndex}].state`
        );
        const revision = requiredText(item, 'revision', `PR #${number}.evidence[${evidenceIndex}]`);
        if (!REVISION_RE.test(revision)) {
          throw new Error(
            `PR #${number}.evidence[${evidenceIndex}].revision must be a git revision`
          );
        }
        const followUp = deferredTicket(
          item['deferredTicket'],
          state,
          implementationTicket,
          `PR #${number}.evidence[${evidenceIndex}]`
        );
        return {
          criterion: requiredText(item, 'criterion', `PR #${number}.evidence[${evidenceIndex}]`),
          implementation: requiredText(
            item,
            'implementation',
            `PR #${number}.evidence[${evidenceIndex}]`
          ),
          test: requiredText(item, 'test', `PR #${number}.evidence[${evidenceIndex}]`),
          revision,
          environment: requiredText(
            item,
            'environment',
            `PR #${number}.evidence[${evidenceIndex}]`
          ),
          status: completionStatus(
            evidenceStatus(item['status'], `PR #${number}.evidence[${evidenceIndex}]`),
            state,
            `PR #${number}.evidence[${evidenceIndex}]`
          ),
          detail: requiredText(item, 'detail', `PR #${number}.evidence[${evidenceIndex}]`),
          limitations: requiredText(
            item,
            'limitations',
            `PR #${number}.evidence[${evidenceIndex}]`
          ),
          state,
          ...(followUp === undefined ? {} : { deferredTicket: followUp }),
        };
      }
    );
    return { number, implementationTicket: associatedTicket, prIssue, evidence };
  });
  if (pullRequests.length === 0) throw new Error('packet.pullRequests must not be empty');
  const numbers = new Set();
  const prIssues = new Set();
  for (const pullRequest of pullRequests) {
    if (numbers.has(pullRequest.number))
      throw new Error(`PR #${pullRequest.number} is listed more than once`);
    if (prIssues.has(pullRequest.prIssue))
      throw new Error(`PR issue ${pullRequest.prIssue} is listed more than once`);
    numbers.add(pullRequest.number);
    prIssues.add(pullRequest.prIssue);
  }

  const overrides = array(root['overrides'] ?? [], 'packet.overrides').map((entry, index) => {
    const override = record(entry, `overrides[${index}]`);
    return {
      criterion: requiredText(override, 'criterion', `overrides[${index}]`),
      approvedBy: requiredText(override, 'approvedBy', `overrides[${index}]`),
      rationale: requiredText(override, 'rationale', `overrides[${index}]`),
    };
  });
  const overridden = new Set();
  for (const override of overrides) {
    if (!criterionIds.has(override.criterion))
      throw new Error(`override names unknown criterion ${override.criterion}`);
    if (overridden.has(override.criterion))
      throw new Error(`criterion ${override.criterion} has more than one override`);
    overridden.add(override.criterion);
  }

  return {
    implementationTicket,
    criteria,
    pullRequests,
    ...(overrides.length === 0 ? {} : { overrides }),
  };
}

/**
 * Determine whether a packet is complete enough for an automatic state
 * transition. A recorded human override is never treated as automation.
 *
 * @param {EvidencePacket} packet
 * @returns {{ status: 'ready' | 'blocked' | 'human-override-recorded', canAutomate: boolean, blockers: Blocker[] }}
 */
export function assessImplementationEvidence(packet) {
  /** @type {Map<string, CriterionEvidence[]>} */
  const evidenceByCriterion = new Map(packet.criteria.map((criterion) => [criterion.id, []]));
  for (const pullRequest of packet.pullRequests) {
    for (const evidence of pullRequest.evidence) {
      const records = evidenceByCriterion.get(evidence.criterion);
      if (records === undefined) {
        return {
          status: 'blocked',
          canAutomate: false,
          blockers: [
            { criterion: evidence.criterion, reason: 'evidence names no declared criterion' },
          ],
        };
      }
      records.push(evidence);
    }
  }
  const overrides = new Map(
    (packet.overrides ?? []).map((override) => [override.criterion, override])
  );
  /** @type {Blocker[]} */
  const blockers = [];
  for (const criterion of packet.criteria) {
    const records = evidenceByCriterion.get(criterion.id) ?? [];
    if (records.length === 0) {
      blockers.push({ criterion: criterion.id, reason: 'no evidence record' });
      continue;
    }
    if (records.length > 1) {
      blockers.push({
        criterion: criterion.id,
        reason: 'more than one evidence record; the result is ambiguous',
      });
      continue;
    }
    const evidence = records[0];
    if (evidence === undefined || evidence.state === 'complete') continue;
    blockers.push({
      criterion: criterion.id,
      reason: `${evidence.state} — ${evidence.limitations} (tracked by ${evidence.deferredTicket})`,
    });
  }
  if (blockers.length === 0) return { status: 'ready', canAutomate: true, blockers };
  const everyBlockerOverridden = blockers.every((blocker) => overrides.has(blocker.criterion));
  return {
    status: everyBlockerOverridden ? 'human-override-recorded' : 'blocked',
    canAutomate: false,
    blockers,
  };
}

/**
 * @param {{ status: 'ready' | 'blocked' | 'human-override-recorded', canAutomate: boolean, blockers: Blocker[] }} assessment
 * @returns {string}
 */
export function formatImplementationEvidence(assessment) {
  let headline = 'IMPLEMENTATION EVIDENCE: blocked';
  if (assessment.canAutomate) headline = 'IMPLEMENTATION EVIDENCE: ready for automation';
  if (assessment.status === 'human-override-recorded') {
    headline = 'IMPLEMENTATION EVIDENCE: human override recorded — automation remains blocked';
  }
  const lines = [headline];
  for (const blocker of assessment.blockers)
    lines.push(`  ${blocker.criterion}: ${blocker.reason}`);
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }
  if (args.includes('--self-test')) {
    const packet = readEvidencePacket({
      implementationTicket: 'POPS-1',
      criteria: [{ id: 'criterion', description: 'example' }],
      pullRequests: [
        {
          number: 1,
          implementationTicket: 'POPS-1',
          prIssue: 'POPS-2',
          evidence: [
            {
              criterion: 'criterion',
              implementation: 'source',
              test: 'test',
              revision: 'abcdef1',
              environment: 'local',
              status: 'passed',
              detail: 'self-test',
              limitations: 'none',
              state: 'complete',
            },
          ],
        },
      ],
    });
    if (!assessImplementationEvidence(packet).canAutomate) process.exit(1);
    console.log('self-test OK');
    return;
  }
  const evidencePath = readFlag(args, '--evidence');
  if (evidencePath === undefined) {
    console.error('FAIL — --evidence <packet.json> is required.');
    process.exit(2);
  }
  try {
    const assessment = assessImplementationEvidence(
      readEvidencePacket(JSON.parse(readFileSync(evidencePath, 'utf8')))
    );
    console.log(
      args.includes('--json')
        ? JSON.stringify(assessment, null, 2)
        : formatImplementationEvidence(assessment)
    );
    process.exit(assessment.canAutomate ? 0 : 3);
  } catch (error) {
    console.error(`FAIL — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
}

if (import.meta.main) main();
