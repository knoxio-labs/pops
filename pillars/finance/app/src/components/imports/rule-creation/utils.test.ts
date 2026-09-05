import { describe, expect, it } from 'vitest';

import { describeForMatching, patternMatchesDescription } from '@pops/finance';

import { buildChangeSet, computeProposals } from './utils';

import type { ConfirmedTransaction } from '@pops/finance';

function txn(overrides: Partial<ConfirmedTransaction> & { description: string }) {
  return {
    date: '2026-09-01',
    amount: -12.34,
    account: 'anz-checking',
    rawRow: overrides.description,
    tags: ['Streaming'],
    ...overrides,
  } as ConfirmedTransaction;
}

/** The predicate the server actually matches with — the whole point of the ticket. */
function ruleFires(pattern: string, description: string): boolean {
  return patternMatchesDescription(pattern, 'contains', describeForMatching(description));
}

describe('computeProposals pattern derivation', () => {
  // The four shapes audited in POPS-2758. Under the old entity-name derivation
  // the first three produced rules that could never fire.
  it.each([
    ['run-together descriptor', 'Airport Rentals', 'AIRPORTRENTALS.COM 1234'],
    ['separator normalisation does not strip', 'Microsoft Store', 'MICROSOFT*STORE'],
    ['bank-truncated descriptor', 'Rattle N Hum Bar Grill', 'RATTLE N HUM BAR GRI'],
    ['descriptor already lines up', 'City of Sydney', 'CITYOFSYDNEY PARKING'],
  ])('%s: the derived pattern matches the row it came from', (_shape, entityName, description) => {
    const [proposal] = computeProposals([
      txn({ description, entityId: 'e1', entityName, tags: ['Travel'] }),
    ]);

    expect(proposal).toBeDefined();
    expect(ruleFires(proposal!.pattern, description)).toBe(true);
  });

  it('does not derive the pattern from the entity name', () => {
    const [proposal] = computeProposals([
      txn({
        description: 'MICROSOFT*STORE',
        entityId: 'e1',
        entityName: 'Microsoft Store',
        tags: ['Software'],
      }),
    ]);

    expect(proposal!.pattern).not.toBe('microsoft store');
    expect(proposal!.entityName).toBe('Microsoft Store');
  });

  it('takes the shared part of several descriptors, so it matches every one', () => {
    const descriptions = [
      'WOOLWORTHS 1034 CANTERBURY',
      'WOOLWORTHS 2201 NEWTOWN',
      'WOOLWORTHS 3310 GLEBE',
    ];
    const [proposal] = computeProposals(
      descriptions.map((description) =>
        txn({ description, entityId: 'e1', entityName: 'Woolworths', tags: ['Groceries'] })
      )
    );

    expect(proposal!.pattern).toBe('WOOLWORTHS');
    for (const description of descriptions) {
      expect(ruleFires(proposal!.pattern, description)).toBe(true);
    }
  });

  it('offers no proposal when the group shares no pattern specific enough to store', () => {
    // Entity mis-assignment puts unrelated descriptors in one group; their
    // longest common substring is a word fragment that would tag everything.
    const proposals = computeProposals([
      txn({
        description: 'STRIKE AUSTRALIA PTY LT',
        entityId: 'e1',
        entityName: 'Archie Brothers',
      }),
      txn({ description: 'VOTINGPARTNER ONCENET', entityId: 'e1', entityName: 'Archie Brothers' }),
    ]);

    expect(proposals).toEqual([]);
  });

  it('carries the derived pattern into the ChangeSet the commit applies', () => {
    const [proposal] = computeProposals([
      txn({ description: 'MICROSOFT*STORE', entityId: 'e1', entityName: 'Microsoft Store' }),
    ]);
    const op = buildChangeSet(proposal!).ops[0]!;

    expect(op.op).toBe('add');
    expect(op).toMatchObject({ data: { descriptionPattern: proposal!.pattern } });
    expect(ruleFires(proposal!.pattern, 'MICROSOFT*STORE')).toBe(true);
  });

  it('still skips a group with no common tags', () => {
    expect(
      computeProposals([txn({ description: 'MICROSOFT*STORE', entityId: 'e1', tags: [] })])
    ).toEqual([]);
  });
});
