/**
 * Planning for the entity `venue:` default-tag backfill (POPS-2609).
 *
 * Fixtures model the shapes the real ledger produces: a merchant whose rows
 * all agree, one whose rows disagree, an `enrich:` merchant that must be left
 * alone, a contact whose stored default contradicts the evidence, and a
 * contact carrying a per-transaction facet that should never have been an
 * entity default.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  entityVenueDefaultsService,
  openFinanceDb,
  transactions,
  type LiveEntityDefaults,
  type OpenedFinanceDb,
} from '../index.js';
import { seededAccountId } from './seeded-account.js';

let tmpDir: string;
let opened: OpenedFinanceDb;

function txn(entityId: string | null, tags: string[]): void {
  opened.db
    .insert(transactions)
    .values({
      description: `txn-${entityId ?? 'none'}-${tags.join('|')}`,
      account: 'Amex',
      accountId: seededAccountId(opened.db, 'Amex'),
      amountCents: -1000,
      date: '2026-01-01',
      type: 'purchase',
      lastEditedTime: '2026-01-01T00:00:00.000Z',
      entityId,
      tags: JSON.stringify(tags),
    })
    .run();
}

function contact(id: string, defaultTags: string[] = []): LiveEntityDefaults {
  return { id, name: `contact ${id}`, defaultTags };
}

function plan(
  live: LiveEntityDefaults[],
  overrides?: Map<string, string>
): ReturnType<typeof entityVenueDefaultsService.planEntityVenueDefaults> {
  return entityVenueDefaultsService.planEntityVenueDefaults(opened.db, live, overrides);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-entity-venue-defaults-test-'));
  opened = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('planEntityVenueDefaults — deterministic writes', () => {
  it('proposes the modal venue for a merchant whose rows agree', () => {
    txn('stonewall', ['venue:bar', 'occasion:out']);
    txn('stonewall', ['venue:bar']);
    txn('stonewall', []);

    const result = plan([contact('stonewall')]);

    expect(result.writes).toEqual([
      {
        entityId: 'stonewall',
        entityName: 'contact stonewall',
        before: [],
        after: ['venue:bar'],
        venueAdded: 'venue:bar',
        removed: [],
      },
    ]);
    expect(result.review).toEqual([]);
  });

  it('proposes the modal venue when a minority row disagrees', () => {
    txn('bws', ['venue:bottleshop']);
    txn('bws', ['venue:bottleshop']);
    txn('bws', ['venue:supermarket']);

    const result = plan([contact('bws')]);

    expect(result.writes[0]?.venueAdded).toBe('venue:bottleshop');
    expect(result.review).toEqual([]);
  });

  it('drops a pre-migration flat default while adding the venue', () => {
    txn('cafe', ['venue:cafe']);

    const result = plan([contact('cafe', ['Coffee', 'Purchase'])]);

    expect(result.writes[0]?.after).toEqual(['venue:cafe']);
    expect(result.writes[0]?.removed).toEqual(['Coffee', 'Purchase']);
  });

  it('writes nothing for a contact that already carries the right venue', () => {
    txn('stonewall', ['venue:bar']);

    const result = plan([contact('stonewall', ['venue:bar'])]);

    expect(result.writes).toEqual([]);
    expect(result.review).toEqual([]);
    expect(result.alreadyCorrect).toEqual(['stonewall']);
  });

  it('is idempotent — replanning after applying a write proposes nothing', () => {
    txn('stonewall', ['venue:bar']);

    const first = plan([contact('stonewall')]);
    const after = first.writes[0]?.after ?? [];
    const second = plan([contact('stonewall', after)]);

    expect(second.writes).toEqual([]);
    expect(second.review).toEqual([]);
  });
});

describe('planEntityVenueDefaults — everything that is not a venue is stripped', () => {
  it('leaves a contact carrying only legacy flat tags with no defaults at all', () => {
    txn('uber', []);

    const result = plan([contact('uber', ['Uber', 'Go out', 'Transport'])]);

    expect(result.writes[0]?.after).toEqual([]);
    expect(result.writes[0]?.removed).toEqual(['Uber', 'Go out', 'Transport']);
  });

  it('removes an occasion: default and adds the venue in one write', () => {
    txn('stonewall', ['venue:bar']);

    const result = plan([contact('stonewall', ['occasion:out', 'contains:alcohol'])]);

    expect(result.writes).toEqual([
      {
        entityId: 'stonewall',
        entityName: 'contact stonewall',
        before: ['occasion:out', 'contains:alcohol'],
        after: ['venue:bar'],
        venueAdded: 'venue:bar',
        removed: ['occasion:out', 'contains:alcohol'],
      },
    ]);
  });

  it('strips a per-transaction facet even from an entity with no venue evidence', () => {
    txn('mystery', []);

    const result = plan([contact('mystery', ['contains:coffee'])]);

    expect(result.writes[0]?.after).toEqual([]);
    expect(result.writes[0]?.venueAdded).toBeUndefined();
    expect(result.review.map((r) => r.reason)).toEqual(['no-evidence']);
  });

  it('strips a per-transaction facet from an enrich: merchant without touching its venue', () => {
    txn('amazon', ['enrich:receipt']);

    const result = plan([contact('amazon', ['occasion:admin'])]);

    expect(result.writes[0]?.after).toEqual([]);
    expect(result.review.map((r) => r.reason)).toEqual(['enrich-excluded']);
  });
});

describe('planEntityVenueDefaults — everything a human has to decide', () => {
  it('leaves an enrich: merchant without a venue, however strong the evidence', () => {
    txn('amazon', ['enrich:receipt', 'venue:online']);
    txn('amazon', ['venue:online']);

    const result = plan([contact('amazon')]);

    expect(result.writes).toEqual([]);
    expect(result.review[0]?.reason).toBe('enrich-excluded');
    expect(result.review[0]?.detail).toContain('1/2');
  });

  it('reports a tie rather than picking a side', () => {
    txn('mixed', ['venue:bar']);
    txn('mixed', ['venue:restaurant']);

    const result = plan([contact('mixed')]);

    expect(result.writes).toEqual([]);
    expect(result.review[0]?.reason).toBe('ambiguous');
    expect(result.review[0]?.detail).toContain('venue:bar / venue:restaurant');
  });

  it('reports a stored default that contradicts the ledger', () => {
    txn('stonewall', ['venue:bar']);
    txn('stonewall', ['venue:bar']);

    const result = plan([contact('stonewall', ['venue:cafe'])]);

    expect(result.writes).toEqual([]);
    expect(result.review[0]?.reason).toBe('venue-conflict');
    expect(result.review[0]?.detail).toContain('venue:cafe');
    expect(result.review[0]?.detail).toContain('venue:bar');
  });

  it('reports a contact carrying more than one venue default', () => {
    txn('stonewall', ['venue:bar']);

    const result = plan([contact('stonewall', ['venue:bar', 'venue:cafe'])]);

    expect(result.writes).toEqual([]);
    expect(result.review[0]?.reason).toBe('venue-conflict');
    expect(result.review[0]?.detail).toContain('2 venues');
  });

  it('counts a live contact with no transactions and asks for a human call', () => {
    const result = plan([contact('never-seen')]);

    expect(result.withoutTransactions).toBe(1);
    expect(result.review.map((r) => r.reason)).toEqual(['no-evidence']);
    expect(result.writes).toEqual([]);
  });

  it('ignores transactions that resolved to no entity', () => {
    txn(null, ['venue:bar']);

    const result = plan([contact('stonewall')]);

    expect(result.review.map((r) => r.reason)).toEqual(['no-evidence']);
  });
});

describe('measureVenueCoverage', () => {
  it('splits the ledger into addressable, covered, enrich-excluded and entity-less', () => {
    txn('stonewall', ['venue:bar']);
    txn('stonewall', ['occasion:out']);
    txn('amazon', ['enrich:receipt', 'venue:online']);
    txn(null, ['venue:bar']);

    expect(entityVenueDefaultsService.measureVenueCoverage(opened.db)).toEqual({
      addressable: 2,
      withVenue: 1,
      enrichExcluded: 1,
      withoutEntity: 1,
    });
  });
});

describe('planEntityVenueDefaults — reviewed overrides', () => {
  it('writes a human venue call for an entity the ledger cannot resolve', () => {
    txn('mystery', []);

    const result = plan([contact('mystery')], new Map([['mystery', 'venue:bar']]));

    expect(result.writes[0]?.after).toEqual(['venue:bar']);
    expect(result.review).toEqual([]);
    expect(result.overridden).toEqual([
      { entityId: 'mystery', entityName: 'contact mystery', venue: 'venue:bar' },
    ]);
  });

  it('lets an override break a tie, recording what the ledger said', () => {
    txn('mixed', ['venue:bar']);
    txn('mixed', ['venue:restaurant']);

    const result = plan([contact('mixed')], new Map([['mixed', 'venue:restaurant']]));

    expect(result.writes[0]?.venueAdded).toBe('venue:restaurant');
    expect(result.review).toEqual([]);
  });

  it('replaces a stored venue and says so', () => {
    txn('stonewall', ['venue:bar']);

    const result = plan(
      [contact('stonewall', ['venue:cafe'])],
      new Map([['stonewall', 'venue:bar']])
    );

    expect(result.writes[0]?.after).toEqual(['venue:bar']);
    expect(result.overridden[0]?.note).toContain('replaces stored venue:cafe');
  });

  it('overrides the enrich: exclusion but flags that it did', () => {
    txn('amazon', ['enrich:receipt']);

    const result = plan([contact('amazon')], new Map([['amazon', 'venue:online']]));

    expect(result.writes[0]?.after).toEqual(['venue:online']);
    expect(result.overridden[0]?.note).toContain('enrich:');
    expect(result.review).toEqual([]);
  });

  it('flags an override that disagrees with unambiguous ledger evidence', () => {
    txn('stonewall', ['venue:bar']);
    txn('stonewall', ['venue:bar']);

    const result = plan([contact('stonewall')], new Map([['stonewall', 'venue:restaurant']]));

    expect(result.overridden[0]?.note).toContain('the ledger says venue:bar');
  });

  it('writes nothing when the override matches what the contact already has', () => {
    txn('stonewall', []);

    const result = plan(
      [contact('stonewall', ['venue:bar'])],
      new Map([['stonewall', 'venue:bar']])
    );

    expect(result.writes).toEqual([]);
  });

  it('reports an override key matching no live contact instead of dropping it', () => {
    const result = plan([contact('stonewall', ['venue:bar'])], new Map([['typo', 'venue:bar']]));

    expect(result.unknownOverrides).toEqual(['typo']);
  });

  it('refuses an override that is not a venue: tag', () => {
    expect(() => plan([contact('stonewall')], new Map([['stonewall', 'occasion:out']]))).toThrow(
      'must be a venue: tag'
    );
  });
});
