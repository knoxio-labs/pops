import { describe, expect, it } from 'vitest';

import {
  HELP,
  assessImplementationEvidence,
  formatImplementationEvidence,
  readEvidencePacket,
} from '../implementation-evidence.mjs';

type EvidenceInput = {
  criterion: string;
  implementation: string;
  test: string;
  revision: string;
  environment: string;
  status: 'passed' | 'failed' | 'skipped';
  detail: string;
  limitations: string;
  state: 'complete' | 'partial' | 'deferred';
  deferredTicket?: string;
};

type PacketInput = {
  implementationTicket: string;
  criteria: { id: string; description: string }[];
  pullRequests: {
    number: number;
    implementationTicket: string;
    prIssue: string;
    evidence: EvidenceInput[];
  }[];
  overrides?: { criterion: string; approvedBy: string; rationale: string }[];
};

const packet = (
  overrides: { criterion: string; approvedBy: string; rationale: string }[] = []
): PacketInput => ({
  implementationTicket: 'POPS-4387',
  criteria: [
    { id: 'association', description: 'associate work with its implementation ticket' },
    { id: 'evidence', description: 'record evidence for every criterion' },
  ],
  pullRequests: [
    {
      number: 5010,
      implementationTicket: 'POPS-4387',
      prIssue: 'POPS-5011',
      evidence: [
        {
          criterion: 'association',
          implementation: 'scripts/implementation-evidence.mjs',
          test: 'scripts/__tests__/implementation-evidence.test.ts',
          revision: 'abcdef1234567',
          environment: 'local Node 24',
          status: 'passed',
          detail: 'vitest run scripts/__tests__/implementation-evidence.test.ts',
          limitations: 'none',
          state: 'complete',
        },
      ],
    },
    {
      number: 5012,
      implementationTicket: 'POPS-4387',
      prIssue: 'POPS-5013',
      evidence: [
        {
          criterion: 'evidence',
          implementation: 'scripts/implementation-evidence.mjs',
          test: 'scripts/__tests__/implementation-evidence.test.ts',
          revision: '0123456789abc',
          environment: 'local Node 24',
          status: 'passed',
          detail: 'vitest run scripts/__tests__/implementation-evidence.test.ts',
          limitations: 'none',
          state: 'complete',
        },
      ],
    },
  ],
  ...(overrides.length === 0 ? {} : { overrides }),
});

describe('implementation evidence', () => {
  it('documents the canonical association and human-only override boundary', () => {
    expect(HELP).toContain('canonical implementation ticket');
    expect(HELP).toContain('human-only');
  });

  it('accepts two PRs for one canonical implementation ticket and preserves every evidence field', () => {
    const parsed = readEvidencePacket(packet());
    expect(parsed.pullRequests).toHaveLength(2);
    expect(parsed.pullRequests[0]?.implementationTicket).toBe('POPS-4387');
    expect(parsed.pullRequests[0]?.prIssue).toBe('POPS-5011');
    expect(parsed.pullRequests[0]?.evidence[0]).toMatchObject({
      implementation: 'scripts/implementation-evidence.mjs',
      test: 'scripts/__tests__/implementation-evidence.test.ts',
      revision: 'abcdef1234567',
      environment: 'local Node 24',
      status: 'passed',
      detail: 'vitest run scripts/__tests__/implementation-evidence.test.ts',
      limitations: 'none',
    });
    expect(assessImplementationEvidence(parsed)).toEqual({
      status: 'ready',
      canAutomate: true,
      blockers: [],
    });
  });

  it('refuses a PR issue masquerading as the canonical implementation ticket', () => {
    const input = packet();
    input.pullRequests[0]!.prIssue = 'POPS-4387';
    expect(() => readEvidencePacket(input)).toThrow(/associations are distinct/u);
  });

  it('refuses a PR associated with a different implementation ticket', () => {
    const input = packet();
    input.pullRequests[1]!.implementationTicket = 'POPS-9999';
    expect(() => readEvidencePacket(input)).toThrow(/canonical implementation ticket/u);
  });

  it.each(['implementation', 'test', 'revision', 'environment', 'detail', 'limitations'])(
    'refuses evidence without %s',
    (field) => {
      const input = packet();
      const evidence = input.pullRequests[0]!.evidence[0]!;
      if (field === 'implementation') evidence.implementation = '';
      if (field === 'test') evidence.test = '';
      if (field === 'revision') evidence.revision = '';
      if (field === 'environment') evidence.environment = '';
      if (field === 'detail') evidence.detail = '';
      if (field === 'limitations') evidence.limitations = '';
      expect(() => readEvidencePacket(input)).toThrow(new RegExp(`\\.${field} must be`, 'u'));
    }
  );

  it.each(['', 'passing'])('refuses evidence with an invalid status %s', (invalidStatus) => {
    const input = packet();
    const evidence: Record<string, unknown> = input.pullRequests[0]!.evidence[0]!;
    evidence['status'] = invalidStatus;
    expect(() => readEvidencePacket(input)).toThrow(/\.status must be one of/u);
  });

  it('refuses a non-git revision rather than reporting an untraceable result', () => {
    const input = packet();
    input.pullRequests[0]!.evidence[0]!.revision = 'release-one';
    expect(() => readEvidencePacket(input)).toThrow(/git revision/u);
  });

  it.each(['partial', 'deferred'] as const)(
    'requires a separately tracked limitation for %s evidence',
    (state) => {
      const input = packet();
      input.pullRequests[0]!.evidence[0]!.state = state;
      expect(() => readEvidencePacket(input)).toThrow(/needs deferredTicket/u);
      input.pullRequests[0]!.evidence[0]!.deferredTicket = 'POPS-6000';
      const assessment = assessImplementationEvidence(readEvidencePacket(input));
      expect(assessment).toMatchObject({ status: 'blocked', canAutomate: false });
      expect(assessment.blockers[0]?.reason).toContain(state);
    }
  );

  it('does not let a completed criterion defer work', () => {
    const input = packet();
    input.pullRequests[0]!.evidence[0]!.deferredTicket = 'POPS-6000';
    expect(() => readEvidencePacket(input)).toThrow(/cannot defer/u);
  });

  it.each(['partial', 'deferred'] as const)(
    'refuses %s evidence deferred to its own implementation ticket',
    (state) => {
      const input = packet();
      input.pullRequests[0]!.evidence[0]!.state = state;
      input.pullRequests[0]!.evidence[0]!.deferredTicket = 'POPS-4387';
      expect(() => readEvidencePacket(input)).toThrow(/different ticket/u);
    }
  );

  it.each(['failed', 'skipped'] as const)(
    'refuses a complete record whose status is %s, whatever its free-text detail says',
    (status) => {
      const input = packet();
      input.pullRequests[0]!.evidence[0]!.status = status;
      input.pullRequests[0]!.evidence[0]!.detail = 'passed: all green';
      expect(() => readEvidencePacket(input)).toThrow(/\.status is complete but reports/u);
    }
  );

  it('accepts a complete record whose free-text detail merely mentions a prior failure that was since fixed', () => {
    const input = packet();
    input.pullRequests[0]!.evidence[0]!.status = 'passed';
    input.pullRequests[0]!.evidence[0]!.detail = 'passed after fixing the earlier failed run';
    expect(() => readEvidencePacket(input)).not.toThrow();
  });

  it('allows a failed or skipped status for non-complete evidence states', () => {
    const input = packet();
    input.pullRequests[0]!.evidence[0]!.state = 'partial';
    input.pullRequests[0]!.evidence[0]!.status = 'failed';
    input.pullRequests[0]!.evidence[0]!.detail = 'failed on the concurrent-write case';
    input.pullRequests[0]!.evidence[0]!.deferredTicket = 'POPS-6000';
    const assessment = assessImplementationEvidence(readEvidencePacket(input));
    expect(assessment).toMatchObject({ status: 'blocked', canAutomate: false });
  });

  it('blocks a criterion no pull request ever gave evidence for', () => {
    const input = packet();
    input.criteria.push({ id: 'undocumented', description: 'a criterion nobody evidenced' });
    const assessment = assessImplementationEvidence(readEvidencePacket(input));
    expect(assessment).toMatchObject({ status: 'blocked', canAutomate: false });
    expect(assessment.blockers).toContainEqual({
      criterion: 'undocumented',
      reason: 'no evidence record',
    });
  });

  it('blocks ambiguous duplicate evidence rather than choosing a PR', () => {
    const input = packet();
    input.pullRequests[1]!.evidence[0]!.criterion = 'association';
    const assessment = assessImplementationEvidence(readEvidencePacket(input));
    expect(assessment).toMatchObject({ status: 'blocked', canAutomate: false });
    expect(assessment.blockers[0]?.reason).toContain('ambiguous');
  });

  it('requires a named human and rationale for an override, and never turns it into automation', () => {
    const input = packet([
      {
        criterion: 'association',
        approvedBy: 'operator',
        rationale: 'duplicate reports are equivalent',
      },
      {
        criterion: 'evidence',
        approvedBy: 'operator',
        rationale: 'the duplicate leaves no independent record',
      },
    ]);
    input.pullRequests[1]!.evidence[0]!.criterion = 'association';
    const assessment = assessImplementationEvidence(readEvidencePacket(input));
    expect(assessment).toMatchObject({
      status: 'human-override-recorded',
      canAutomate: false,
    });
    expect(formatImplementationEvidence(assessment)).toContain('automation remains blocked');
  });

  it('refuses an override with no rationale', () => {
    const input = packet([{ criterion: 'association', approvedBy: 'operator', rationale: '' }]);
    expect(() => readEvidencePacket(input)).toThrow(/overrides\[0\]\.rationale/u);
  });

  it('refuses an override without a named human approver', () => {
    const input = packet([{ criterion: 'association', approvedBy: '', rationale: 'reviewed' }]);
    expect(() => readEvidencePacket(input)).toThrow(/overrides\[0\]\.approvedBy/u);
  });
});
