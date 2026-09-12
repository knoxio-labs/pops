import { describe, expect, it } from 'vitest';

import { describeForMatching, patternMatchesDescription } from '@pops/finance';

import { buildChangeSet, computeProposals, IMPORT_BATCH_SOURCE } from './utils';

import type { ConfirmedTransaction } from '@pops/finance';

import type { PendingTagRuleChangeSet } from '../../../store/import-store-types';

function txn(overrides: Partial<ConfirmedTransaction> & { description: string }) {
  return {
    date: '2026-09-01',
    amount: -12.34,
    dialectAccountLabel: 'anz-checking',
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

  it('excludes a trip: tag from the proposal even when it is on every row of the group', () => {
    const [proposal] = computeProposals([
      txn({
        description: 'HUNGRY JACKS SYDNEY',
        entityId: 'e1',
        entityName: 'Hungry Jacks',
        tags: ['Fast Food', 'trip:cairns-2026'],
      }),
      txn({
        description: 'HUNGRY JACKS SYDNEY',
        entityId: 'e1',
        entityName: 'Hungry Jacks',
        checksum: 'x2',
        tags: ['Fast Food', 'trip:cairns-2026'],
      }),
    ]);

    expect(proposal!.tags).toEqual(['Fast Food']);
  });

  it('drops the proposal entirely when a trip: tag was the only common tag', () => {
    expect(
      computeProposals([
        txn({ description: 'SIMBA CAR HIRE', entityId: 'e1', tags: ['trip:cairns-2026'] }),
      ])
    ).toEqual([]);
  });
});

describe('computeProposals subtracts what already applies (POPS-3676)', () => {
  const woolworths = { entityId: 'e1', entityName: 'Woolworths' };
  const descriptors = ['WOOLWORTHS 1034 CANTERBURY', 'WOOLWORTHS 2201 NEWTOWN'];

  function rows(
    tags: string[],
    suggestedTags: NonNullable<ConfirmedTransaction['suggestedTags']> = []
  ): ConfirmedTransaction[] {
    return descriptors.map((description, index) =>
      txn({ description, checksum: `w${index}`, ...woolworths, tags, suggestedTags })
    );
  }

  function staged(
    source: string,
    sourceChecksums: string[],
    tags: string[]
  ): PendingTagRuleChangeSet {
    return {
      tempId: `temp:${source}:${sourceChecksums.join(',')}`,
      source,
      appliedAt: '2026-09-12T00:00:00.000Z',
      sourceChecksums,
      changeSet: {
        source,
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'WOOLWORTHS',
              matchType: 'contains',
              entityId: 'e1',
              tags,
              confidence: 0.9,
              isActive: true,
            },
          },
        ],
      },
    };
  }

  it('proposes nothing for a tag every row got from a stored rule', () => {
    const imported = rows(
      ['Groceries'],
      [{ tag: 'Groceries', source: 'rule', pattern: 'WOOLWORTHS' }]
    );
    expect(computeProposals(imported)).toEqual([]);
  });

  it('proposes nothing for a tag the merchant’s default tags supplied', () => {
    const imported = rows(['Groceries'], [{ tag: 'Groceries', source: 'entity' }]);
    expect(computeProposals(imported)).toEqual([]);
  });

  it('keeps a tag the AI suggested, since nothing re-applies it on the next import', () => {
    const [proposal] = computeProposals(rows(['Groceries'], [{ tag: 'Groceries', source: 'ai' }]));
    expect(proposal?.tags).toEqual(['Groceries']);
  });

  it('keeps a tag added by hand', () => {
    const [proposal] = computeProposals(rows(['Groceries']));
    expect(proposal?.tags).toEqual(['Groceries']);
  });

  it('subtracts only the supplied tags from a proposal that mixes both', () => {
    const [proposal] = computeProposals(
      rows(
        ['Groceries', 'venue:supermarket'],
        [
          { tag: 'Groceries', source: 'rule', pattern: 'WOOLWORTHS' },
          { tag: 'venue:supermarket', source: 'ai' },
        ]
      )
    );
    expect(proposal?.tags).toEqual(['venue:supermarket']);
  });

  it('counts a row towards the threshold only where nothing supplied the tag', () => {
    const supplied = [{ tag: 'Groceries', source: 'rule' as const, pattern: 'WOOLWORTHS' }];
    const imported = [
      txn({
        description: 'WOOLWORTHS 1034 CANTERBURY',
        checksum: 'w0',
        ...woolworths,
        tags: ['Groceries'],
        suggestedTags: supplied,
      }),
      txn({
        description: 'WOOLWORTHS 2201 NEWTOWN',
        checksum: 'w1',
        ...woolworths,
        tags: ['Groceries'],
        suggestedTags: supplied,
      }),
      txn({
        description: 'WOOLWORTHS 3310 GLEBE',
        checksum: 'w2',
        ...woolworths,
        tags: ['Groceries'],
      }),
    ];
    expect(computeProposals(imported)).toEqual([]);
  });

  it('drops a tag a rule staged on Tag Review already covers on every row', () => {
    const proposals = computeProposals(rows(['Groceries']), [
      staged('tag-review:Woolworths', ['w0', 'w1'], ['Groceries']),
    ]);
    expect(proposals).toEqual([]);
  });

  it('keeps a tag the staged rule covers on only some of the rows', () => {
    const [proposal] = computeProposals(rows(['Groceries']), [
      staged('tag-review:WOOLWORTHS 1034 CANTERBURY', ['w0'], ['Groceries']),
    ]);
    expect(proposal?.tags).toEqual(['Groceries']);
  });

  it('keeps the tags a staged rule does not write', () => {
    const [proposal] = computeProposals(rows(['Groceries', 'venue:supermarket']), [
      staged('tag-review:Woolworths', ['w0', 'w1'], ['Groceries']),
    ]);
    expect(proposal?.tags).toEqual(['venue:supermarket']);
  });

  it('never subtracts against its own earlier batch rules, which a new visit replaces', () => {
    const [proposal] = computeProposals(rows(['Groceries']), [
      staged(IMPORT_BATCH_SOURCE, ['w0', 'w1'], ['Groceries']),
    ]);
    expect(proposal?.tags).toEqual(['Groceries']);
  });
});
